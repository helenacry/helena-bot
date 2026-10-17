
import { db } from "../../database/connection.mjs";

import { getPlayerName } from "../platform/player-names.mjs";

import { WANTED_PAGE_SIZE } from "../../config/crime.mjs";

const clock = () => Math.floor(Date.now() / 1000);

// ==========================================
// PROCURADOS
// ==========================================

// Quem tem pelo menos 1 registro na ficha criminal (crime, roubo
// ou lavagem iniciada). Mais registros aparecem primeiro. A ficha
// não expira.
//
// Devolve a página pedida (limitada ao que existe), com o total de
// páginas e, para cada pessoa, se está presa agora.
export function listWanted(guildId, page = 1, now = clock()) {
    const { n: total } = db.prepare(`
        SELECT COUNT(*) AS n
        FROM crime_players
        WHERE guild_id = ?
          AND criminal_record > 0
    `).get(guildId);

    const pages = Math.max(1, Math.ceil(total / WANTED_PAGE_SIZE));

    const current = Math.min(
        pages,
        Math.max(1, Math.trunc(Number(page)) || 1)
    );

    const offset = (current - 1) * WANTED_PAGE_SIZE;

    const rows = db.prepare(`
        SELECT c.user_id,
               c.criminal_record,
               p.release_at
        FROM crime_players c
        LEFT JOIN prison_players p
               ON p.guild_id = c.guild_id
              AND p.user_id = c.user_id
              AND p.release_at > ?
        WHERE c.guild_id = ?
          AND c.criminal_record > 0
        ORDER BY c.criminal_record DESC, c.user_id
        LIMIT ? OFFSET ?
    `).all(now, guildId, WANTED_PAGE_SIZE, offset);

    return {
        total,
        pages,
        page: current,

        entries: rows.map((row, index) => ({
            position: offset + index + 1,
            userId: row.user_id,
            name:
                getPlayerName(row.user_id) ||
                "Jogador " + String(row.user_id).slice(-4),
            record: row.criminal_record,
            jailed: row.release_at !== null
        }))
    };
}
