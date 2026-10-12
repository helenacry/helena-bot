
import { randomInt } from "node:crypto";

import { db } from "../database/connection.mjs";

// ==========================================
// DADOS DO JOGADOR NO SISTEMA DE CRIME
// ==========================================

// Garante a linha do jogador e a devolve.
export function ensureCrimePlayer(guildId, userId) {
    db.prepare(`
        INSERT OR IGNORE INTO crime_players (
            guild_id,
            user_id
        )
        VALUES (?, ?)
    `).run(guildId, userId);

    return db.prepare(`
        SELECT *
        FROM crime_players
        WHERE guild_id = ?
          AND user_id = ?
    `).get(guildId, userId);
}

// ==========================================
// SORTEIO
// ==========================================

// Número em [0, 1) com aleatoriedade criptográfica.
// Os serviços aceitam outra função no lugar dela
// para que os testes sejam determinísticos.
export const defaultRng = () =>
    randomInt(0, 1_000_000) / 1_000_000;

// Inteiro sorteado em [min, max], inclusive.
export function rollBetween(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
}

// Item sorteado de uma lista.
export function pick(rng, list) {
    return list[Math.floor(rng() * list.length)];
}
