import { randomInt } from "node:crypto";

import { db } from "../../database/connection.mjs";

import { getPlayer } from "../../database/economy.mjs";

import { getItem } from "../../config/items.mjs";

import {
    FISHING_CONFIG,
    FISHING_TABLE
} from "../../config/fishing.mjs";

import { calculateLevel } from "../progress/experience.mjs";

import {
    addItem,
    getItemQuantity
} from "./inventory.mjs";

import {
    consumeEnergy
} from "./energy.mjs";

import { tx } from "../combat/combat.mjs";

// ==========================================
// PESCAR
// ==========================================

// Uma pescaria: confere a vara, a espera e a energia, sorteia o que veio (config/fishing.mjs) e põe no inventário.
// Tudo numa transação só: ou a pescaria acontece inteira, ou nada muda.
//
// As recusas esperadas (sem vara, esperando, sem energia) NÃO são erros: voltam como { status } para o comando
// mostrar a tela certa. Sem vaga no inventário o item não se perde: é vendido na hora, pelo preço base de venda
// (como a caixa faz com o prêmio que não cabe).

const unit = () => randomInt(0, 1_000_000) / 1_000_000;

// O sorteio de verdade é o do Node (crypto). Os testes trocam por um combinado, como na bolsa e nas caixas
// (setMarketRandom, setBoxRandom); sem argumento volta ao de verdade.
let fishingRandom = unit;

export function setFishingRandom(fn) {
    fishingRandom = fn ?? unit;
}

// A linha da tabela que sai para um número de 0 a menos de 1 (vem de fora para os testes).
export function rollCatch(random = unit) {
    const total = FISHING_TABLE.reduce((sum, entry) => sum + entry.weight, 0);

    let point = Math.min(Math.max(random(), 0), 0.999999999) * total;

    for (const entry of FISHING_TABLE) {
        if (point < entry.weight) {
            return entry;
        }

        point -= entry.weight;
    }

    return FISHING_TABLE[FISHING_TABLE.length - 1];
}

// Quanto falta para a próxima pescaria (0 se já pode).
export function fishingWait(lastFish, now = Math.floor(Date.now() / 1000)) {
    if (!Number.isSafeInteger(lastFish) || lastFish <= 0) {
        return 0;
    }

    return Math.max(0, lastFish + FISHING_CONFIG.cooldown - now);
}

export function hasRod(guildId, userId) {
    return getItemQuantity(guildId, userId, FISHING_CONFIG.rod) >= 1;
}

/**
 * Lança a linha. Devolve:
 *   { status: "no_rod", rod }
 *   { status: "wait", remaining }
 *   { status: "no_energy", energy, max, missing, cost }
 *   { status: "ok", entry, item, stored, sold, money, lost, xp, level, leveledUp, energy, max, wallet }
 *     - "item" é null quando a isca voltou vazia;
 *     - "stored" é a quantidade que ficou no inventário depois de pescar (0 se vendeu na hora);
 *     - "sold" é 1 se o item não coube e foi vendido na hora ("money" é o que entrou na carteira).
 */
export function fish(guildId, userId, { now = Math.floor(Date.now() / 1000), random = fishingRandom } = {}) {
    return tx(() => {
        const before = getPlayer(guildId, userId);

        const rod = getItem(FISHING_CONFIG.rod);

        if (!hasRod(guildId, userId)) {
            return { status: "no_rod", rod };
        }

        const remaining = fishingWait(before.last_fish, now);

        if (remaining > 0) {
            return { status: "wait", remaining };
        }

        const energy = consumeEnergy(guildId, userId, FISHING_CONFIG.energyCost, now);

        if (!energy.success) {
            return {
                status: "no_energy",
                energy: energy.energy,
                max: energy.max,
                missing: energy.missing,
                cost: FISHING_CONFIG.energyCost
            };
        }

        // ----- o que veio -----

        const entry = rollCatch(random);

        const item = entry.item ? getItem(entry.item) : null;

        let stored = 0;
        let sold = 0;
        let money = 0;
        let lost = 0;

        if (item) {
            const owned = getItemQuantity(guildId, userId, item.id);

            if (owned < item.maxStack) {
                addItem(guildId, userId, item.id, 1);

                stored = owned + 1;

            } else {
                // não coube: vende na hora, pelo preço base
                const room = Math.max(0, FISHING_CONFIG.maxWallet - before.wallet);

                money = Math.min(item.sellPrice, room);
                lost = item.sellPrice - money;
                sold = 1;

                if (money > 0) {
                    db.prepare(`
                        UPDATE players
                        SET wallet = wallet + ?
                        WHERE guild_id = ?
                          AND user_id = ?
                    `).run(money, guildId, userId);

                    db.prepare(`
                        INSERT INTO transactions (guild_id, user_id, target_id, type, amount)
                        VALUES (?, ?, NULL, 'fish_sale', ?)
                    `).run(guildId, userId, money);
                }
            }
        }

        // ----- XP e a hora da pescaria -----

        const xp = before.xp + FISHING_CONFIG.xp;

        const level = calculateLevel(xp);

        const update = db.prepare(`
            UPDATE players
            SET xp = ?,
                level = ?,
                last_fish = ?
            WHERE guild_id = ?
              AND user_id = ?
              AND last_fish <= ?
        `).run(xp, level, now, guildId, userId, now - FISHING_CONFIG.cooldown);

        if (update.changes !== 1) {
            throw new Error("Não foi possível registrar a pescaria.");
        }

        const after = getPlayer(guildId, userId);

        return {
            status: "ok",
            entry,
            item,
            stored,
            sold,
            money,
            lost,
            xp: FISHING_CONFIG.xp,
            level: after.level,
            leveledUp: after.level > before.level,
            totalXp: after.xp,
            // o que sobrou depois do gasto (consumeEnergy já devolve o valor novo)
            energy: energy.energy,
            max: energy.max,
            wallet: after.wallet
        };
    });
}
