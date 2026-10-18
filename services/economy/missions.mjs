
import { db } from "../../database/connection.mjs";

import {
    MISSIONS,
    getMission,
    getMissionPeriod
} from "../../config/missions.mjs";

import { calculateLevel } from "../progress/experience.mjs";

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

// ==========================================
// RESGATAR UMA MISSÃO
// ==========================================

// O mesmo teto de carteira do restante da economia.
const MAX_WALLET = 100_000_000_000_000;

// Paga a recompensa de uma missão pronta (dinheiro e XP) e a marca como resgatada, tudo numa
// transação. Devolve { status }:
//   unknown     a missão não existe
//   incomplete  falta progresso (mission, progress)
//   claimed     já foi resgatada neste período (mission)
//   ok          resgatada (mission, level, xp, leveledUp, wallet)
// Erros inesperados (carteira cheia, banco) são lançados.
export function claimMission({
    guildId,
    userId,
    missionId,
    now = Date.now()
}) {
    const mission = getMission(missionId);

    if (!mission) {
        return { status: "unknown" };
    }

    db.exec("BEGIN IMMEDIATE");

    try {
        const period = getMissionPeriod(now);

        const saved = db.prepare(`
            SELECT progress, claimed
            FROM mission_progress
            WHERE guild_id = ?
              AND user_id = ?
              AND mission_id = ?
              AND period = ?
        `).get(guildId, userId, mission.id, period);

        if (!saved || saved.progress < mission.target) {
            db.exec("ROLLBACK");

            return {
                status: "incomplete",
                mission,
                progress: saved?.progress ?? 0
            };
        }

        if (saved.claimed) {
            db.exec("ROLLBACK");

            return { status: "claimed", mission };
        }

        const player = db.prepare(`
            SELECT wallet, xp, level
            FROM players
            WHERE guild_id = ?
              AND user_id = ?
        `).get(guildId, userId);

        if (!player) {
            throw new Error("Jogador não encontrado.");
        }

        if (player.wallet > MAX_WALLET - mission.reward) {
            throw new Error("Sua carteira não comporta essa recompensa.");
        }

        const newXp = player.xp + mission.xp;

        if (!Number.isSafeInteger(newXp)) {
            throw new Error("Limite de experiência atingido.");
        }

        const newLevel = calculateLevel(newXp);

        // Marca a missão como resgatada.
        const claim = db.prepare(`
            UPDATE mission_progress
            SET claimed = 1
            WHERE guild_id = ?
              AND user_id = ?
              AND mission_id = ?
              AND period = ?
              AND progress >= ?
              AND claimed = 0
        `).run(guildId, userId, mission.id, period, mission.target);

        if (claim.changes !== 1) {
            throw new Error("Não foi possível confirmar o resgate.");
        }

        // Paga a recompensa.
        const payment = db.prepare(`
            UPDATE players
            SET wallet = wallet + ?,
                xp = ?,
                level = ?
            WHERE guild_id = ?
              AND user_id = ?
              AND wallet <= ?
        `).run(
            mission.reward,
            newXp,
            newLevel,
            guildId,
            userId,
            MAX_WALLET - mission.reward
        );

        if (payment.changes !== 1) {
            throw new Error("Não foi possível pagar a recompensa.");
        }

        // Histórico financeiro.
        db.prepare(`
            INSERT INTO transactions (
                guild_id,
                user_id,
                target_id,
                type,
                amount
            )
            VALUES (?, ?, NULL, 'mission', ?)
        `).run(guildId, userId, mission.reward);

        db.exec("COMMIT");

        return {
            status: "ok",
            mission,
            level: newLevel,
            xp: newXp,
            leveledUp: newLevel > player.level,
            wallet: player.wallet + mission.reward
        };

    } catch (error) {
        if (db.isTransaction) {
            db.exec("ROLLBACK");
        }

        throw error;
    }
}
