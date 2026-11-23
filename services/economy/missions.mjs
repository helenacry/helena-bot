
import { db } from "../../database/connection.mjs";

import {
    ALL_MISSIONS,
    getMission,
    getMissionPeriod
} from "../../config/missions.mjs";

import { calculateLevel } from "../progress/experience.mjs";

import { addStat } from "../progress/stats.mjs";

// ==========================================
// REGISTRAR PROGRESSO
// ==========================================

// Chamar somente dentro de uma transação SQLite.
// event: "work", "deposit", "daily", "fish", "crime" ou "rob". Todo evento também soma no contador do jogo
// (event_<nome>), de onde saem as conquistas por quantidade; as missões diárias e as semanais escutam o mesmo evento.
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

    addStat(guildId, userId, `event_${event}`);

    const missions = ALL_MISSIONS.filter(
        mission => mission.event === event
    );

    for (const mission of missions) {
        const period = getMissionPeriod(now, mission.period);

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

    // o período de cada tipo (o dia e a semana)
    const periods = [getMissionPeriod(now, "daily"), getMissionPeriod(now, "weekly")];

    const rows = db.prepare(`
        SELECT mission_id, period, progress, claimed
        FROM mission_progress
        WHERE guild_id = ?
          AND user_id = ?
          AND period IN (?, ?)
    `).all(guildId, userId, periods[0], periods[1]);

    const progressMap = new Map(
        rows.map(row => [`${row.mission_id}|${row.period}`, row])
    );

    return ALL_MISSIONS.map(mission => {
        const saved = progressMap.get(`${mission.id}|${getMissionPeriod(now, mission.period)}`);

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
        const period = getMissionPeriod(now, mission.period);

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
