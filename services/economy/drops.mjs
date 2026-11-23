import { randomBytes } from "node:crypto";

import { db } from "../../database/connection.mjs";

import { getPlayer } from "../../database/economy.mjs";

import { getItem } from "../../config/items.mjs";

import {
    DROP_CONFIG,
    DROP_PRIZES
} from "../../config/drops.mjs";

import { guildsWithDrops } from "../platform/guild-settings.mjs";

import { blocked } from "../platform/developer.mjs";

import { addStat, getStat } from "../progress/stats.mjs";

import { addItem, getItemQuantity } from "./inventory.mjs";

import { inventoryRoom } from "./backpack.mjs";

import { tx } from "../combat/combat.mjs";

// ==========================================
// DROPS NO CHAT
// ==========================================

// Um servidor liga os drops com o /servidor. Aí, quando há conversa num canal (várias mensagens de pelo menos duas
// pessoas nos últimos minutos), a Helena às vezes solta um presente com um botão: a primeira pessoa que aperta leva
// (config/drops.mjs tem os números e o que pode vir).
//
//   - a conversa que conta fica SÓ NA MEMÓRIA (quantas mensagens e de quem, por poucos minutos): o texto das
//     mensagens não passa por aqui, e nada disso vai para o banco;
//   - o primeiro clique leva: a marca é feita antes de qualquer outra coisa, na mesma rodada do Node, então dois cliques
//     ao mesmo tempo não levam os dois;
//   - só leva quem já tem conta no servidor (já usou a Helena) e não está bloqueado, e no máximo 5 por dia;
//   - quem fala com o Discord (enviar e editar a mensagem) é passado de fora, como em services/platform/about.mjs.

const unit = () => randomBytes(4).readUInt32BE() / 2 ** 32;

// O teto da carteira, o mesmo da loja.
const MAX_CENTS = 100_000_000_000_000;

// O dia UTC de um instante ("2026-11-22"), para o limite por dia.
const dayOf = ms => new Date(ms).toISOString().slice(0, 10);

// Sorteia o prêmio por peso (random de 0 a menos de 1).
export function rollDropPrize(random = unit, prizes = DROP_PRIZES) {
    const total = prizes.reduce((sum, prize) => sum + prize.weight, 0);

    let point = Math.min(Math.max(random(), 0), 0.999999999) * total;

    for (const prize of prizes) {
        if (point < prize.weight) {
            return prize;
        }

        point -= prize.weight;
    }

    return prizes[prizes.length - 1];
}

// Entrega o prêmio (numa transação só). Item que não cabe (limite do item ou mochila cheia) vira o dinheiro de
// reserva. Devolve { kind, money, item, quantity, lost }: kind é "money", "item" ou "converted".
export function deliverDropPrize(guildId, userId, prize, random = unit) {
    return tx(() => {
        const player = getPlayer(guildId, userId);

        let money = 0;
        let kind = "money";
        let item = null;
        let quantity = 0;

        if (prize.money) {
            const [min, max] = prize.money;

            money = min + Math.floor(random() * ((max - min) / 100 + 1)) * 100;

        } else {
            item = getItem(prize.item);

            const fits = prize.quantity <= item.maxStack - getItemQuantity(guildId, userId, item.id) &&
                (item.capacity || prize.quantity <= inventoryRoom(guildId, userId));

            if (fits) {
                addItem(guildId, userId, item.id, prize.quantity);

                kind = "item";
                quantity = prize.quantity;

            } else {
                kind = "converted";
                money = prize.fallback;
            }
        }

        const credit = Math.max(0, Math.min(money, MAX_CENTS - player.wallet));

        if (credit > 0) {
            db.prepare(`
                UPDATE players
                SET wallet = wallet + ?
                WHERE guild_id = ?
                  AND user_id = ?
            `).run(credit, String(guildId), String(userId));

            db.prepare(`
                INSERT INTO transactions (guild_id, user_id, target_id, type, amount)
                VALUES (?, ?, NULL, 'drop', ?)
            `).run(String(guildId), String(userId), credit);
        }

        return { kind, money: credit, lost: money - credit, item, quantity };
    });
}

export function createDrops({
    send = async () => null,
    edit = async () => null,
    now = Date.now,
    random = unit,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    config = DROP_CONFIG,
    prizes = DROP_PRIZES,
    servers = guildsWithDrops,
    buildDrop = () => ({}),
    buildExpired = () => ({})
} = {}) {
    // a conversa recente: "servidor:canal" -> [{ t, u }]
    const chat = new Map();

    const lastDropAt = new Map();

    const live = new Map();

    function recent(key, current) {
        const list = (chat.get(key) ?? []).filter(entry => current - entry.t < config.chatWindowMs);

        if (list.length === 0) {
            chat.delete(key);

        } else {
            chat.set(key, list);
        }

        return list;
    }

    return {
        // Uma mensagem num canal (só quem escreveu e quando; o texto não vem para cá).
        noteChat({ guildId, channelId, userId }) {
            if (!guildId || !channelId || !userId) {
                return;
            }

            const key = `${guildId}:${channelId}`;

            const list = chat.get(key) ?? [];

            list.push({ t: now(), u: String(userId) });

            // nunca cresce sem fim: só as últimas 200
            chat.set(key, list.length > 200 ? list.slice(-200) : list);
        },

        // O canal do servidor que tem conversa de verdade (o de mais mensagens), ou null. "only" limita a um canal.
        activeChannel(guildId, only = "") {
            const current = now();

            let best = null;

            for (const key of [...chat.keys()]) {
                const [guild, channel] = key.split(":");

                if (guild !== String(guildId) || (only && channel !== only)) {
                    continue;
                }

                const list = recent(key, current);

                const people = new Set(list.map(entry => entry.u)).size;

                if (list.length >= config.minMessages && people >= config.minPeople && (!best || list.length > best.messages)) {
                    best = { channelId: channel, messages: list.length };
                }
            }

            return best?.channelId ?? null;
        },

        // O sorteio de cada rodada: devolve os drops que saíram.
        async tick() {
            const current = now();

            const spawned = [];

            for (const { guildId, channelId: only } of servers()) {
                const last = lastDropAt.get(guildId);

                if (last !== undefined && current - last < config.minIntervalMs) {
                    continue;
                }

                if ([...live.values()].some(drop => drop.guildId === guildId && !drop.claimedBy)) {
                    continue;
                }

                const channel = this.activeChannel(guildId, only);

                if (!channel || random() >= config.chancePerTick) {
                    continue;
                }

                const drop = await this.spawn({ guildId, channelId: channel });

                if (drop) {
                    spawned.push(drop);
                }
            }

            return spawned;
        },

        // Solta um drop num canal.
        async spawn({ guildId, channelId }) {
            const prize = rollDropPrize(random, prizes);

            const id = randomBytes(5).toString("hex");

            const current = now();

            const drop = {
                id,
                guildId: String(guildId),
                channelId: String(channelId),
                messageId: null,
                prize,
                createdAt: current,
                expiresAt: current + config.expireMs,
                claimedBy: null,
                timer: null
            };

            // marca o servidor já: se o envio falhar, a próxima tentativa espera um pouco em vez de insistir a cada minuto
            lastDropAt.set(drop.guildId, current);

            let sent = null;

            try {
                sent = await send({ guildId: drop.guildId, channelId: drop.channelId }, buildDrop(drop));

            } catch {
                lastDropAt.set(drop.guildId, current - config.minIntervalMs + 10 * 60 * 1000);

                return null;
            }

            if (!sent?.id) {
                lastDropAt.set(drop.guildId, current - config.minIntervalMs + 10 * 60 * 1000);

                return null;
            }

            drop.messageId = String(sent.id);

            live.set(id, drop);

            drop.timer = setTimer(() => { this.expire(id); }, config.expireMs);

            drop.timer?.unref?.();

            return drop;
        },

        // O drop some do chat (ninguém pegou a tempo).
        async expire(id) {
            const drop = live.get(id);

            if (!drop) {
                return false;
            }

            live.delete(id);

            if (drop.claimedBy) {
                return false;
            }

            try {
                await edit({ guildId: drop.guildId, channelId: drop.channelId }, drop.messageId, buildExpired(drop));

            } catch {
                // a mensagem pode já ter sido apagada: não faz mal
            }

            return true;
        },

        /**
         * O clique no botão. Devolve { status }:
         *   gone        o drop não existe mais (acabou, ou o bot reiniciou)
         *   late        outra pessoa levou primeiro (by)
         *   blocked     a pessoa está bloqueada
         *   no_account  a pessoa nunca usou a Helena neste servidor
         *   cap         já levou o máximo de hoje (cap)
         *   failed      não deu para entregar (nada foi gasto)
         *   ok          levou (drop, delivery)
         */
        claim({ id, guildId, userId }) {
            const drop = live.get(String(id));

            if (!drop || drop.guildId !== String(guildId)) {
                return { status: "gone" };
            }

            if (drop.claimedBy) {
                return { status: "late", by: drop.claimedBy };
            }

            const current = now();

            if (current >= drop.expiresAt) {
                this.expire(drop.id);

                return { status: "gone" };
            }

            try {
                if (blocked(String(userId))) {
                    return { status: "blocked" };
                }

            } catch {
                return { status: "failed" };
            }

            const hasAccount = db.prepare("SELECT 1 FROM players WHERE guild_id = ? AND user_id = ?").get(drop.guildId, String(userId));

            if (!hasAccount) {
                return { status: "no_account" };
            }

            const dayKey = `drop_day:${dayOf(current)}`;

            if (getStat(drop.guildId, userId, dayKey) >= config.dailyCap) {
                return { status: "cap", cap: config.dailyCap };
            }

            // a marca vem ANTES de entregar: nada assíncrono entre conferir e marcar, então só um clique leva
            drop.claimedBy = String(userId);

            let delivery;

            try {
                delivery = deliverDropPrize(drop.guildId, userId, drop.prize, random);

                addStat(drop.guildId, userId, dayKey);
                addStat(drop.guildId, userId, "drops_claimed");

            } catch {
                drop.claimedBy = null;

                return { status: "failed" };
            }

            clearTimer(drop.timer);

            live.delete(drop.id);

            return { status: "ok", drop, delivery };
        },

        // Para os testes e o /servidor: o que está no chat agora.
        live: () => [...live.values()]
    };
}

// O que o bot usa de verdade. As telas (a mensagem do drop e a que sobra depois) ficam em
// services/economy/drops-view.mjs, que registra aqui o jeito de montar cada uma, e o helena.mjs põe o envio e a
// edição de mensagens do Discord (setDropSender).
let sender = { send: async () => null, edit: async () => null };

let views = { buildDrop: () => ({}), buildExpired: () => ({}) };

export const drops = createDrops({
    send: (...args) => sender.send(...args),
    edit: (...args) => sender.edit(...args),
    buildDrop: drop => views.buildDrop(drop),
    buildExpired: drop => views.buildExpired(drop)
});

export function setDropSender(value) {
    sender = value ?? { send: async () => null, edit: async () => null };
}

export function setDropViews(value) {
    views = value;
}
