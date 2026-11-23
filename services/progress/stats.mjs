import { db } from "../../database/connection.mjs";

// ==========================================
// CONTADORES DO JOGO
// ==========================================

// Quantas vezes a pessoa fez algo neste servidor. Cada nome de contador é livre ("event_work", "fish_casts",
// "fish:lambari"...); quem lê as conquistas (config/achievements.mjs, tipo "stat") e o tutorial usa os mesmos nomes.
// Funciona dentro ou fora de uma transação.

const KEY = /^[a-z0-9_:.-]{1,64}$/;

function check(guildId, userId, key) {
    if (!guildId || !userId || !KEY.test(String(key))) {
        throw new Error("Contador inválido.");
    }
}

/** Soma ao contador (cria se não existir). Devolve o valor novo. */
export function addStat(guildId, userId, key, amount = 1) {
    check(guildId, userId, key);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new Error("A soma do contador deve ser um inteiro positivo.");
    }

    db.prepare(`
        INSERT INTO player_stats (guild_id, user_id, key, value)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (guild_id, user_id, key)
        DO UPDATE SET value = player_stats.value + excluded.value
    `).run(String(guildId), String(userId), String(key), amount);

    return getStat(guildId, userId, key);
}

/** Guarda o maior valor visto (para recordes). Devolve o valor guardado. */
export function setStatMax(guildId, userId, key, value) {
    check(guildId, userId, key);

    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error("O valor do contador deve ser um inteiro não negativo.");
    }

    db.prepare(`
        INSERT INTO player_stats (guild_id, user_id, key, value)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (guild_id, user_id, key)
        DO UPDATE SET value = MAX(player_stats.value, excluded.value)
    `).run(String(guildId), String(userId), String(key), value);

    return getStat(guildId, userId, key);
}

export function getStat(guildId, userId, key) {
    check(guildId, userId, key);

    const row = db.prepare(`
        SELECT value
        FROM player_stats
        WHERE guild_id = ?
          AND user_id = ?
          AND key = ?
    `).get(String(guildId), String(userId), String(key));

    return row?.value ?? 0;
}

/** Todos os contadores da pessoa neste servidor, como { nome: valor }. */
export function getStats(guildId, userId) {
    check(guildId, userId, "x");

    const rows = db.prepare(`
        SELECT key, value
        FROM player_stats
        WHERE guild_id = ?
          AND user_id = ?
    `).all(String(guildId), String(userId));

    return Object.fromEntries(rows.map(row => [row.key, row.value]));
}

/** Quantos contadores com este prefixo a pessoa já tem acima de zero ("fish:" conta as espécies pescadas). */
export function countStats(guildId, userId, prefix) {
    check(guildId, userId, "x");

    const row = db.prepare(`
        SELECT COUNT(*) AS total
        FROM player_stats
        WHERE guild_id = ?
          AND user_id = ?
          AND key LIKE ? ESCAPE '!'
          AND value > 0
    `).get(String(guildId), String(userId), String(prefix).replace(/[%_!]/g, "!$&") + "%");

    return row?.total ?? 0;
}
