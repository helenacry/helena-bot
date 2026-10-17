
import { db } from "../../database/connection.mjs";

import { getPlayer } from "../../database/economy.mjs";

import { recordMissionEvent } from "./missions.mjs";

// ==========================================
// RECOMPENSA DIÁRIA
// ==========================================

// Regras do /daily num lugar só, usadas pelo comando e pelo site
// (services/web/web-api.mjs): quem resgata pelo Discord e quem resgata
// pelo painel passa pelo mesmo caminho e pelas mesmas travas.

// Valores em centavos.
export const DAILY_CONFIG = Object.freeze({
    // R$ 500,00
    reward: 50_000,

    // Intervalo entre dois resgates, em segundos.
    cooldown: 24 * 60 * 60,

    // Até 48 horas entre dois resgates mantém a sequência.
    streakGracePeriod: 48 * 60 * 60,

    // Bônus de R$ 50 por dia seguido, limitado ao dia 7.
    streakBonus: 5_000,

    // Bônus especial a cada sete dias (R$ 500,00).
    weeklyBonus: 50_000,

    maxWallet: 100_000_000_000_000
});

const nowSeconds = () => Math.floor(Date.now() / 1000);

// ==========================================
// CÁLCULOS
// ==========================================

export function getUTCDate(timestamp) {
    return new Date(timestamp * 1000)
        .toISOString()
        .slice(0, 10);
}

export function calculateReward(streak) {
    const bonusDays = Math.min(
        (streak - 1) % 7,
        6
    );

    const progressiveBonus =
        bonusDays * DAILY_CONFIG.streakBonus;

    const weeklyBonus =
        streak > 0 && streak % 7 === 0
            ? DAILY_CONFIG.weeklyBonus
            : 0;

    return {
        base: DAILY_CONFIG.reward,
        progressiveBonus,
        weeklyBonus,

        total:
            DAILY_CONFIG.reward +
            progressiveBonus +
            weeklyBonus
    };
}

export function getNextStreak(currentStreak, lastDaily, now) {
    if (!lastDaily || currentStreak <= 0) {
        return 1;
    }

    const elapsed = now - lastDaily;

    if (elapsed > DAILY_CONFIG.streakGracePeriod) {
        return 1;
    }

    return currentStreak + 1;
}

// ==========================================
// SITUAÇÃO (SÓ LEITURA)
// ==========================================

// Mostra se o resgate está liberado, sem criar o jogador nem alterar
// nada. Quem nunca jogou naquele servidor aparece como liberado, com
// sequência zero.
//
// { available, remaining, streak, bestStreak, nextStreak, nextReward }
//
// "streak" é a sequência que ainda vale: se já passou da tolerância,
// ela vai voltar para 1 no próximo resgate, então aparece como 0.
export function getDailyStatus(guildId, userId, now = nowSeconds()) {
    const player = db.prepare(`
        SELECT last_daily
        FROM players
        WHERE guild_id = ?
          AND user_id = ?
    `).get(guildId, userId);

    const streakData = db.prepare(`
        SELECT streak, best_streak
        FROM daily_streaks
        WHERE guild_id = ?
          AND user_id = ?
    `).get(guildId, userId);

    const lastDaily = player?.last_daily ?? 0;

    const stored = streakData?.streak ?? 0;

    const remaining = Math.max(
        0,
        DAILY_CONFIG.cooldown - (now - lastDaily)
    );

    const alive =
        lastDaily > 0 &&
        now - lastDaily <= DAILY_CONFIG.streakGracePeriod;

    const nextStreak = getNextStreak(stored, lastDaily, now);

    return {
        available: remaining === 0,
        remaining,
        streak: alive ? stored : 0,
        bestStreak: streakData?.best_streak ?? 0,
        nextStreak,
        nextReward: calculateReward(nextStreak)
    };
}

// ==========================================
// RESGATAR
// ==========================================

// Resultado:
//   { status: "claimed", reward, streak, bestStreak, wallet }
//   { status: "cooldown", remaining, streak, bestStreak }
//   { status: "wallet_full" }
//
// Qualquer outro problema (banco indisponível, linha sumida) é lançado
// como erro. A prisão não é checada aqui: quem chama faz isso antes
// (prisonBlock), como acontece com todos os comandos bloqueados.
export function claimDaily(guildId, userId, now = nowSeconds()) {
    // Inicializar conta fora da transação.
    getPlayer(guildId, userId);

    let reward;
    let newStreak;
    let bestStreak;

    db.exec("BEGIN IMMEDIATE");

    try {
        // ==========================
        // DADOS DO JOGADOR
        // ==========================

        const player = db.prepare(`
            SELECT wallet, last_daily
            FROM players
            WHERE guild_id = ?
              AND user_id = ?
        `).get(guildId, userId);

        if (!player) {
            throw new Error("Jogador não encontrado.");
        }

        // ==========================
        // DADOS DA SEQUÊNCIA
        // ==========================

        const streakData = db.prepare(`
            SELECT
                streak,
                best_streak,
                total_claims
            FROM daily_streaks
            WHERE guild_id = ?
              AND user_id = ?
        `).get(guildId, userId);

        const currentStreak = streakData?.streak || 0;
        const previousBest = streakData?.best_streak || 0;

        // ==========================
        // COOLDOWN
        // ==========================

        const remaining = Math.max(
            0,
            DAILY_CONFIG.cooldown - (now - player.last_daily)
        );

        if (remaining > 0) {
            db.exec("ROLLBACK");

            return {
                status: "cooldown",
                remaining,
                streak: currentStreak,
                bestStreak: previousBest
            };
        }

        // ==========================
        // CALCULAR NOVA SEQUÊNCIA
        // ==========================

        newStreak = getNextStreak(
            currentStreak,
            player.last_daily,
            now
        );

        bestStreak = Math.max(previousBest, newStreak);

        reward = calculateReward(newStreak);

        // ==========================
        // LIMITE DA CARTEIRA
        // ==========================

        if (player.wallet > DAILY_CONFIG.maxWallet - reward.total) {
            db.exec("ROLLBACK");

            return { status: "wallet_full" };
        }

        // ==========================
        // PAGAR RECOMPENSA
        // ==========================

        const result = db.prepare(`
            UPDATE players
            SET
                wallet = wallet + ?,
                last_daily = ?
            WHERE guild_id = ?
              AND user_id = ?
              AND wallet <= ?
              AND last_daily <= ?
        `).run(
            reward.total,
            now,
            guildId,
            userId,
            DAILY_CONFIG.maxWallet - reward.total,
            now - DAILY_CONFIG.cooldown
        );

        if (result.changes !== 1) {
            throw new Error("Não foi possível resgatar a recompensa.");
        }

        // ==========================
        // ATUALIZAR STREAK
        // ==========================

        db.prepare(`
            INSERT INTO daily_streaks (
                guild_id,
                user_id,
                streak,
                best_streak,
                last_claim_day,
                total_claims
            )
            VALUES (?, ?, ?, ?, ?, 1)

            ON CONFLICT(guild_id, user_id)
            DO UPDATE SET
                streak = excluded.streak,
                best_streak = excluded.best_streak,
                last_claim_day = excluded.last_claim_day,
                total_claims =
                    daily_streaks.total_claims + 1
        `).run(
            guildId,
            userId,
            newStreak,
            bestStreak,
            getUTCDate(now)
        );

        // ==========================
        // HISTÓRICO FINANCEIRO
        // ==========================

        db.prepare(`
            INSERT INTO transactions (
                guild_id,
                user_id,
                target_id,
                type,
                amount
            )
            VALUES (?, ?, NULL, 'daily', ?)
        `).run(
            guildId,
            userId,
            reward.total
        );

        // ==========================
        // MISSÃO DIÁRIA
        // ==========================

        recordMissionEvent(guildId, userId, "daily");

        // Confirma pagamento, sequência e missão
        // na mesma transação.
        db.exec("COMMIT");

    } catch (error) {
        if (db.isTransaction) {
            db.exec("ROLLBACK");
        }

        throw error;
    }

    // Carteira atualizada.
    const updated = getPlayer(guildId, userId);

    return {
        status: "claimed",
        reward,
        streak: newStreak,
        bestStreak,
        wallet: updated.wallet
    };
}
