
import { randomBytes } from "node:crypto";

import { db } from "../../database/connection.mjs";

import { getPlayer } from "../../database/economy.mjs";

import { FAMILY_RULES } from "../../config/family.mjs";

import { formatCooldown } from "../../config/cooldowns.mjs";

import { DAILY_CONFIG } from "../economy/daily.mjs";

import { getPrison } from "../crime/prison.mjs";

import { normalizeName } from "../platform/user-lookup.mjs";

import { getMarriage } from "./marriage.mjs";

// ==========================================
// FAMÍLIA: GOZOFONE E FILHOS
// ==========================================

// O Gozofone é uma ligação para o cônjuge. O cônjuge tem poucos segundos para atender; se
// atender, ou nasce um filho (uma chance pequena) ou ele recebe um dinheiro. A espera é de
// quem liga: volta se o cônjuge recusar ou não atender, e fica se quem ligou cancelar.
//
// A ligação em andamento vive na memória (dura segundos: se o bot reiniciar, ela cai). O que
// precisa sobreviver vai para o banco: os filhos, o bebê que espera nome e a espera de cada um.
// Os números estão em config/family.mjs.

const nowSeconds = () => Math.floor(Date.now() / 1000);

function transaction(callback) {
    db.exec("BEGIN IMMEDIATE");

    try {
        const result = callback();

        db.exec("COMMIT");

        return result;

    } catch (error) {
        if (db.isTransaction) {
            db.exec("ROLLBACK");
        }

        throw error;
    }
}

// O casal sempre na mesma ordem (a < b), igual ao que está no banco.
const pair = (x, y) => String(x) < String(y)
    ? [String(x), String(y)]
    : [String(y), String(x)];

// ==========================================
// O CASAL
// ==========================================

export function coupleOf(guildId, userId) {
    const marriage = getMarriage(guildId, userId);

    if (!marriage) {
        return null;
    }

    const [a, b] = pair(userId, marriage.spouse_id);

    return {
        a,
        b,
        spouseId: String(marriage.spouse_id),
        marriedAt: marriage.married_at
    };
}

// ==========================================
// A LIGAÇÃO
// ==========================================

const calls = new Map();

const KEEP_CALLS_FOR = 10 * 60;

function newId() {
    let id;

    do {
        id = randomBytes(4).toString("hex");
    } while (calls.has(id));

    return id;
}

// Joga fora as ligações antigas (já terminadas) e os bebês que ninguém registrou.
function sweep(now) {
    for (const [id, call] of calls) {
        if (call.status !== "pending" && now - call.createdAt > KEEP_CALLS_FOR) {
            calls.delete(id);
        }
    }

    db.prepare("DELETE FROM family_births WHERE expires_at <= ?")
        .run(now - 60 * 60);
}

export function getCall(id) {
    return calls.get(String(id)) ?? null;
}

// Esquece todas as ligações em memória (os testes começam sempre do zero).
export function clearCalls() {
    calls.clear();
}

// A espera volta ao que era antes da ligação (só se ninguém ligou de novo no meio).
function refund(call) {
    db.prepare(`
        UPDATE family_calls
        SET last_call = ?
        WHERE guild_id = ?
          AND user_id = ?
          AND last_call = ?
    `).run(call.previousCall, call.guildId, call.callerId, call.createdAt);
}

export function startCall({ guildId, callerId, now = nowSeconds() }) {
    const couple = coupleOf(guildId, callerId);

    if (!couple) {
        throw new Error(
            "O Gozofone é para casais: peça alguém em casamento com `/casar`."
        );
    }

    if (getPrison(guildId, couple.spouseId, now)) {
        throw new Error("Seu cônjuge está preso e não pode atender.");
    }

    sweep(now);

    for (const call of calls.values()) {
        if (
            call.guildId === guildId &&
            call.a === couple.a &&
            call.b === couple.b &&
            call.status === "pending" &&
            now < call.expiresAt
        ) {
            throw new Error("Já tem uma ligação tocando para o seu cônjuge.");
        }
    }

    return transaction(() => {
        const row = db.prepare(`
            SELECT last_call
            FROM family_calls
            WHERE guild_id = ?
              AND user_id = ?
        `).get(guildId, callerId);

        const previous = row?.last_call ?? 0;

        const remaining = FAMILY_RULES.cooldown - (now - previous);

        if (remaining > 0) {
            throw new Error(
                `Você ligou há pouco. Tente de novo em **${formatCooldown(remaining)}**.`
            );
        }

        db.prepare(`
            INSERT INTO family_calls (guild_id, user_id, last_call)
            VALUES (?, ?, ?)
            ON CONFLICT(guild_id, user_id)
            DO UPDATE SET last_call = excluded.last_call
        `).run(guildId, callerId, now);

        const call = {
            id: newId(),
            guildId,
            callerId: String(callerId),
            partnerId: couple.spouseId,
            a: couple.a,
            b: couple.b,
            createdAt: now,
            expiresAt: now + FAMILY_RULES.callTtl,
            previousCall: previous,
            status: "pending"
        };

        calls.set(call.id, call);

        return call;
    });
}

// A ligação caiu sem ninguém atender: devolve a espera. Devolve a ligação, ou null se ainda
// toca, já terminou ou não existe (então pode ser chamada de novo sem efeito).
export function expireCall(id, now = nowSeconds()) {
    const call = calls.get(String(id));

    if (!call || call.status !== "pending" || now < call.expiresAt) {
        return null;
    }

    call.status = "expired";

    refund(call);

    return call;
}

// "aceitar" (só o cônjuge), "recusar" (só o cônjuge) e "cancelar" (só quem ligou).
// Devolve { call, outcome }, com outcome.kind:
//   child      nasceu um filho (birthId, babies, expiresAt)
//   money      o cônjuge recebeu "amount" (0 se a carteira estava cheia)
//   declined   recusada (a espera volta)
//   cancelled  cancelada por quem ligou (a espera fica)
//   expired    o tempo acabou antes da resposta (a espera volta)
// Qualquer outra situação lança Error com o motivo (quem não pode, já terminou, casal desfeito...).
export function answerCall({ id, userId, action, now = nowSeconds(), random = Math.random }) {
    const call = calls.get(String(id));

    if (!call) {
        throw new Error("Essa ligação não existe mais.");
    }

    if (call.status === "pending" && now >= call.expiresAt) {
        expireCall(id, now);

        return { call, outcome: { kind: "expired" } };
    }

    if (call.status !== "pending") {
        throw new Error("Essa ligação já terminou.");
    }

    const who = String(userId);

    if (action === "cancelar") {
        if (who !== call.callerId) {
            throw new Error("Só quem ligou pode cancelar.");
        }

        call.status = "cancelled";

        return { call, outcome: { kind: "cancelled" } };
    }

    if (who !== call.partnerId) {
        throw new Error("Só o seu cônjuge pode responder a esta ligação.");
    }

    if (action === "recusar") {
        call.status = "declined";

        refund(call);

        return { call, outcome: { kind: "declined" } };
    }

    if (action !== "aceitar") {
        throw new Error("Ação inválida.");
    }

    // O casamento pode ter acabado nesses segundos.
    if (coupleOf(call.guildId, call.callerId)?.spouseId !== call.partnerId) {
        call.status = "cancelled";

        refund(call);

        throw new Error("O casamento acabou: não há mais com quem falar.");
    }

    if (getPrison(call.guildId, call.partnerId, now)) {
        throw new Error("Você está preso e não pode atender.");
    }

    // a conta de quem atende precisa existir para receber
    getPlayer(call.guildId, call.partnerId);

    const outcome = transaction(() => {
        const pending = db.prepare(`
            SELECT 1
            FROM family_births
            WHERE guild_id = ?
              AND parent_a = ?
              AND parent_b = ?
              AND expires_at > ?
        `).get(call.guildId, call.a, call.b, now);

        const { total } = db.prepare(`
            SELECT COUNT(*) AS total
            FROM family_children
            WHERE guild_id = ?
              AND parent_a = ?
              AND parent_b = ?
        `).get(call.guildId, call.a, call.b);

        // Um bebê esperando nome ou a família cheia: sem chance de filho.
        if (!pending && total < FAMILY_RULES.maxChildren && random() < FAMILY_RULES.childChance) {
            const babies = random() < FAMILY_RULES.twinChance ? 2 : 1;

            const expiresAt = now + FAMILY_RULES.nameWindow;

            const info = db.prepare(`
                INSERT INTO family_births (guild_id, parent_a, parent_b, babies, expires_at)
                VALUES (?, ?, ?, ?, ?)
            `).run(call.guildId, call.a, call.b, babies, expiresAt);

            return { kind: "child", birthId: Number(info.lastInsertRowid), babies, expiresAt };
        }

        const span = FAMILY_RULES.payoutMax - FAMILY_RULES.payoutMin + 1;

        const amount = FAMILY_RULES.payoutMin + Math.floor(random() * span);

        const paid = db.prepare(`
            UPDATE players
            SET wallet = wallet + ?
            WHERE guild_id = ?
              AND user_id = ?
              AND wallet <= ?
        `).run(amount, call.guildId, call.partnerId, DAILY_CONFIG.maxWallet - amount).changes === 1;

        if (!paid) {
            return { kind: "money", amount: 0 };
        }

        db.prepare(`
            INSERT INTO transactions (guild_id, user_id, target_id, type, amount)
            VALUES (?, ?, ?, 'gozofone', ?)
        `).run(call.guildId, call.partnerId, call.callerId, amount);

        return { kind: "money", amount };
    });

    call.status = "accepted";

    return { call, outcome };
}

// ==========================================
// OS FILHOS
// ==========================================

export function getBirth(id, now = nowSeconds()) {
    const row = db.prepare(`
        SELECT id, guild_id, parent_a, parent_b, babies, expires_at
        FROM family_births
        WHERE id = ?
    `).get(Number(id));

    return row && row.expires_at > now ? row : null;
}

// O nome do filho: de 2 a 32 letras (acentos valem), com espaço para nome composto.
export function cleanChildName(raw) {
    const name = String(raw ?? "").replace(/\s+/g, " ").trim();

    const length = [...name].length;

    if (length < FAMILY_RULES.nameMin || length > FAMILY_RULES.nameMax) {
        throw new Error(
            `O nome precisa ter de ${FAMILY_RULES.nameMin} a ${FAMILY_RULES.nameMax} letras.`
        );
    }

    if (!/^\p{L}+(?: \p{L}+)*$/u.test(name)) {
        throw new Error("Use só letras no nome (e espaço, se for composto).");
    }

    return name;
}

// Os pais registram o nome do bebê (um nome por bebê) antes do prazo. Qualquer um dos dois pode.
// Devolve os nomes registrados. Prazo vencido: o bebê não é registrado.
export function registerChildren({ guildId, userId, birthId, names, now = nowSeconds() }) {
    const row = db.prepare(`
        SELECT id, guild_id, parent_a, parent_b, babies, expires_at
        FROM family_births
        WHERE id = ?
          AND guild_id = ?
    `).get(Number(birthId), guildId);

    if (!row) {
        throw new Error("Esse bebê não está esperando nome.");
    }

    const who = String(userId);

    if (who !== row.parent_a && who !== row.parent_b) {
        throw new Error("Só os pais podem registrar o filho.");
    }

    if (row.expires_at <= now) {
        db.prepare("DELETE FROM family_births WHERE id = ?").run(row.id);

        throw new Error("O prazo acabou: o bebê não foi registrado.");
    }

    if (names.length !== row.babies) {
        throw new Error(row.babies === 2 ? "Os gêmeos precisam de um nome cada." : "Falta o nome do bebê.");
    }

    const cleaned = names.map(cleanChildName);

    return transaction(() => {
        const existing = db.prepare(`
            SELECT name
            FROM family_children
            WHERE guild_id = ?
              AND parent_a = ?
              AND parent_b = ?
        `).all(guildId, row.parent_a, row.parent_b).map(child => normalizeName(child.name));

        const seen = new Set(existing);

        for (const name of cleaned) {
            const key = normalizeName(name);

            if (seen.has(key)) {
                throw new Error(`Já existe um filho chamado **${name}** nesta família. Escolha outro nome.`);
            }

            seen.add(key);
        }

        const insert = db.prepare(`
            INSERT INTO family_children (guild_id, parent_a, parent_b, name, born_at)
            VALUES (?, ?, ?, ?, ?)
        `);

        for (const name of cleaned) {
            insert.run(guildId, row.parent_a, row.parent_b, name, now);
        }

        db.prepare("DELETE FROM family_births WHERE id = ?").run(row.id);

        return cleaned;
    });
}

// A família de quem pergunta: o casal, os filhos e o bebê que espera nome (se houver).
// null se a pessoa não é casada.
export function familyOf(guildId, userId, now = nowSeconds()) {
    const couple = coupleOf(guildId, userId);

    if (!couple) {
        return null;
    }

    const children = db.prepare(`
        SELECT id, name, born_at
        FROM family_children
        WHERE guild_id = ?
          AND parent_a = ?
          AND parent_b = ?
        ORDER BY born_at, id
    `).all(guildId, couple.a, couple.b);

    const birth = db.prepare(`
        SELECT id, babies, expires_at
        FROM family_births
        WHERE guild_id = ?
          AND parent_a = ?
          AND parent_b = ?
          AND expires_at > ?
        ORDER BY id DESC
        LIMIT 1
    `).get(guildId, couple.a, couple.b, now);

    return { ...couple, children, birth: birth ?? null };
}
