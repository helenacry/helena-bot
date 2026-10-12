
import { db } from "../../database/connection.mjs";

import {
    getPlayer,
    formatMoney
} from "../../database/economy.mjs";

import {
    recordMissionEvent
} from "../../services/missions.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const DAILY_REWARD = 50_000; // R$ 500,00

const DAILY_COOLDOWN = 24 * 60 * 60;

// Até 48 horas entre dois resgates
const STREAK_GRACE_PERIOD = 48 * 60 * 60;

// Bônus de R$ 50 por dia, limitado ao dia 7
const STREAK_BONUS = 5_000;

// Bônus especial a cada sete dias
const WEEKLY_BONUS = 50_000;

const MAX_WALLET = 100_000_000_000_000;

// ==========================================
// UTILITÁRIOS
// ==========================================

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${hours}h ${minutes}m ${secs}s`;
}

function getUTCDate(timestamp) {
    return new Date(timestamp * 1000)
        .toISOString()
        .slice(0, 10);
}

function calculateReward(streak) {
    const bonusDays = Math.min(
        (streak - 1) % 7,
        6
    );

    const progressiveBonus =
        bonusDays * STREAK_BONUS;

    const weeklyBonus =
        streak > 0 && streak % 7 === 0
            ? WEEKLY_BONUS
            : 0;

    return {
        base: DAILY_REWARD,
        progressiveBonus,
        weeklyBonus,

        total:
            DAILY_REWARD +
            progressiveBonus +
            weeklyBonus
    };
}

function getNextStreak(currentStreak, lastDaily, now) {
    if (!lastDaily || currentStreak <= 0) {
        return 1;
    }

    const elapsed = now - lastDaily;

    if (elapsed > STREAK_GRACE_PERIOD) {
        return 1;
    }

    return currentStreak + 1;
}

// ==========================================
// COMANDO /DAILY
// ==========================================

export default {
    name: "daily",
    aliases: ["diario"],

    description:
        "Resgate sua recompensa diária e aumente sua sequência",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        const now = Math.floor(Date.now() / 1000);

        let reward;
        let newStreak;
        let bestStreak;

        try {
            // Inicializar conta fora da transação.
            getPlayer(guildId, userId);

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
                    throw new Error(
                        "Jogador não encontrado."
                    );
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

                const currentStreak =
                    streakData?.streak || 0;

                const previousBest =
                    streakData?.best_streak || 0;

                // ==========================
                // COOLDOWN
                // ==========================

                const remaining = Math.max(
                    0,
                    DAILY_COOLDOWN -
                        (now - player.last_daily)
                );

                if (remaining > 0) {
                    db.exec("ROLLBACK");

                    return embedResponse(
                        createEmbed({
                            title: "⏳ Helena Daily",

                            description:
                                "Você já resgatou sua recompensa diária.",

                            color: HELENA_COLORS.warning,

                            fields: [
                                {
                                    name: "🔥 Sequência atual",
                                    value:
                                        "**" +
                                        currentStreak +
                                        " dias**",
                                    inline: true
                                },
                                {
                                    name: "🏆 Recorde",
                                    value:
                                        "**" +
                                        previousBest +
                                        " dias**",
                                    inline: true
                                },
                                {
                                    name: "⏰ Próximo resgate",
                                    value:
                                        "**" +
                                        formatTime(remaining) +
                                        "**",
                                    inline: false
                                }
                            ],

                            footer:
                                "Helena Daily • Volte amanhã!"
                        })
                    );
                }

                // ==========================
                // CALCULAR NOVA SEQUÊNCIA
                // ==========================

                newStreak = getNextStreak(
                    currentStreak,
                    player.last_daily,
                    now
                );

                bestStreak = Math.max(
                    previousBest,
                    newStreak
                );

                reward = calculateReward(newStreak);

                // ==========================
                // LIMITE DA CARTEIRA
                // ==========================

                if (
                    player.wallet >
                    MAX_WALLET - reward.total
                ) {
                    db.exec("ROLLBACK");

                    return errorEmbed(
                        "Sua carteira não comporta a recompensa diária.\n\n" +
                        "Deposite parte do dinheiro no banco e tente novamente.",
                        "Carteira no limite"
                    );
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
                    MAX_WALLET - reward.total,
                    now - DAILY_COOLDOWN
                );

                if (result.changes !== 1) {
                    throw new Error(
                        "Não foi possível resgatar a recompensa."
                    );
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

                recordMissionEvent(
                    guildId,
                    userId,
                    "daily"
                );

                // Confirma pagamento, sequência
                // e missão na mesma transação.
                db.exec("COMMIT");

            } catch (error) {
                if (db.isTransaction) {
                    db.exec("ROLLBACK");
                }

                throw error;
            }

            // ==============================
            // CARTEIRA ATUALIZADA
            // ==============================

            const updated = getPlayer(
                guildId,
                userId
            );

            // ==============================
            // RESPOSTA FINAL
            // ==============================

            const rewardFields = [
                {
                    name: "💰 Recompensa base",
                    value:
                        "**" +
                        formatMoney(reward.base) +
                        "**",
                    inline: true
                },
                {
                    name: "🔥 Bônus de sequência",
                    value:
                        "**" +
                        formatMoney(
                            reward.progressiveBonus
                        ) +
                        "**",
                    inline: true
                }
            ];

            if (reward.weeklyBonus > 0) {
                rewardFields.push({
                    name: "🎁 Bônus de 7 dias",
                    value:
                        "**" +
                        formatMoney(reward.weeklyBonus) +
                        "**",
                    inline: false
                });
            }

            rewardFields.push(
                {
                    name: "💵 Total recebido",
                    value:
                        "**" +
                        formatMoney(reward.total) +
                        "**",
                    inline: false
                },
                {
                    name: "🔥 Sequência atual",
                    value:
                        "**" +
                        newStreak +
                        " dias**",
                    inline: true
                },
                {
                    name: "🏆 Seu recorde",
                    value:
                        "**" +
                        bestStreak +
                        " dias**",
                    inline: true
                },
                {
                    name: "👛 Carteira atual",
                    value:
                        "**" +
                        formatMoney(updated.wallet) +
                        "**",
                    inline: true
                },
                {
                    name: "⏰ Próximo resgate",
                    value: "**24 horas**",
                    inline: true
                }
            );

            return embedResponse(
                createEmbed({
                    title: "🎁 Helena Daily",

                    description:
                        "**Recompensa resgatada!**\n\n" +
                        "Você completou o dia **" +
                        newStreak +
                        "** da sua sequência." +
                        (
                            reward.weeklyBonus > 0
                                ? "\n\n🎉 Bônus semanal desbloqueado!"
                                : ""
                        ),

                    color: HELENA_COLORS.success,

                    fields: rewardFields,

                    footer:
                        "Helena Daily • Sua dedicação merece recompensas."
                })
            );

        } catch (error) {
            console.error("[DAILY]", error);

            return errorEmbed(
                "Não foi possível processar sua recompensa diária."
            );
        }
    }
};