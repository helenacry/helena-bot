
import { db } from "../../database/connection.mjs";

import {
    MISSIONS,
    getMissionPeriod
} from "../../config/missions.mjs";

// ==========================================
// REGISTRAR PROGRESSO
// ==========================================

// Chamar somente dentro de uma transação SQLite.
// event: "work", "deposit" ou "daily".
export function recordMissionEvent(
    guildId,
    userId,
    event,
    now = Date.now()
) {
    if (!db.isTransaction) {
        throw new Error(
            "O progresso das missões exige uma transação SQLite."
        );
    }

    if (!guildId || !userId) {
        throw new Error("Jogador inválido.");
    }

    const period = getMissionPeriod(now);

    const missions = MISSIONS.filter(
        mission => mission.event === event
    );

    for (const mission of missions) {
        db.prepare(`
            INSERT OR IGNORE INTO mission_progress (
                guild_id,
                user_id,
                mission_id,
                period,
                progress,
                claimed
            )
            VALUES (?, ?, ?, ?, 0, 0)
        `).run(
            guildId,
            userId,
            mission.id,
            period
        );

        db.prepare(`
            UPDATE mission_progress
            SET progress = MIN(progress + 1, ?)
            WHERE guild_id = ?
              AND user_id = ?
              AND mission_id = ?
              AND period = ?
              AND claimed = 0
              AND progress < ?
        `).run(
            mission.target,
            guildId,
            userId,
            mission.id,
            period,
            mission.target
        );
    }
}

// ==========================================
// CONSULTAR MISSÕES
// ==========================================

export function getPlayerMissions(
    guildId,
    userId,
    now = Date.now()
) {
    if (!guildId || !userId) {
        throw new Error("Jogador inválido.");
    }

    const period = getMissionPeriod(now);

    const rows = db.prepare(`
        SELECT mission_id, progress, claimed
        FROM mission_progress
        WHERE guild_id = ?
          AND user_id = ?
          AND period = ?
    `).all(guildId, userId, period);

    const progressMap = new Map(
        rows.map(row => [row.mission_id, row])
    );

    return MISSIONS.map(mission => {
        const saved = progressMap.get(mission.id);

        return {
            ...mission,
            progress: saved?.progress ?? 0,
            claimed: Boolean(saved?.claimed)
        };
    });
}