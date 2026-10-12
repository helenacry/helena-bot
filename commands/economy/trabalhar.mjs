
import { db } from "../../database/connection.mjs";

import {
    getPlayer,
    formatMoney
} from "../../database/economy.mjs";

import {
    calculateLevel
} from "../../services/experience.mjs";

import {
    recordMissionEvent
} from "../../services/missions.mjs";

import {
    getJob
} from "../../config/jobs.mjs";

import {
    consumeEnergy,
    ENERGY_CONFIG
} from "../../services/energy.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    warningEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

const CONFIG = {
    cooldown: 60 * 60,
    xp: 25,
    maxWallet: 100_000_000_000_000
};

function formatTime(seconds) {
    const value = Math.max(0, Math.floor(seconds));

    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const secs = value % 60;

    return [
        hours > 0 ? hours + "h" : null,
        minutes + "m",
        secs + "s"
    ].filter(Boolean).join(" ");
}

export default {
    name: "trabalhar",
    description: "Trabalhe para ganhar dinheiro e experiência",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        const now = Math.floor(Date.now() / 1000);

        try {
            // Garante que o jogador exista.
            getPlayer(guildId, userId);

            db.exec("BEGIN IMMEDIATE");

            try {
                const player = db.prepare(`
                    SELECT
                        wallet,
                        xp,
                        level,
                        last_work,
                        job_id
                    FROM players
                    WHERE guild_id = ?
                      AND user_id = ?
                `).get(guildId, userId);

                if (!player) {
                    throw new Error("Jogador não encontrado.");
                }

                // ==================================
                // EMPREGO E SALÁRIO
                // ==================================

                const job = getJob(player.job_id);

                if (!job) {
                    throw new Error(
                        "Seu emprego atual não foi encontrado."
                    );
                }

                const reward = job.salary;

                if (
                    !Number.isSafeInteger(reward) ||
                    reward <= 0
                ) {
                    throw new Error(
                        "O salário deste emprego é inválido."
                    );
                }

                // ==================================
                // COOLDOWN
                // ==================================

                const remaining = Math.max(
                    0,
                    CONFIG.cooldown - (now - player.last_work)
                );

                if (remaining > 0) {
                    db.exec("ROLLBACK");

                    return warningEmbed(
                        "Expediente indisponível",
                        "Você já trabalhou recentemente!\n\n" +
                        "👔 **Emprego:** " + job.name + "\n" +
                        "💰 **Salário:** " + formatMoney(reward) + "\n\n" +
                        "⏰ **Próximo trabalho em:** " +
                        formatTime(remaining) + "\n\n" +
                        "Aproveite para realizar outras atividades."
                    );
                }

                // ==================================
                // LIMITE DA CARTEIRA
                // ==================================

                if (
                    player.wallet >
                    CONFIG.maxWallet - reward
                ) {
                    throw new Error(
                        "Sua carteira atingiu o limite permitido."
                    );
                }

                // ==================================
                // EXPERIÊNCIA
                // ==================================

                const newXp = player.xp + CONFIG.xp;

                if (!Number.isSafeInteger(newXp)) {
                    throw new Error(
                        "Limite de experiência atingido."
                    );
                }

                const newLevel = calculateLevel(newXp);

                // ==================================
                // ENERGIA
                // ==================================

                const energyResult = consumeEnergy(
                    guildId,
                    userId,
                    ENERGY_CONFIG.workCost,
                    now
                );

                if (!energyResult.success) {
                    db.exec("ROLLBACK");

                    return warningEmbed(
                        "Energia insuficiente",
                        "Você não possui energia suficiente para trabalhar.\n\n" +
                        "⚡ **Custo:** " +
                        ENERGY_CONFIG.workCost +
                        " pontos\n" +
                        "🔋 **Energia atual:** " +
                        energyResult.energy +
                        "/" +
                        energyResult.max +
                        "\n" +
                        "❌ **Faltam:** " +
                        energyResult.missing +
                        " pontos\n\n" +
                        "Use `/energia` para acompanhar sua regeneração."
                    );
                }

                // ==================================
                // ATUALIZAR JOGADOR
                // ==================================

                const update = db.prepare(`
                    UPDATE players
                    SET
                        wallet = wallet + ?,
                        xp = ?,
                        level = ?,
                        last_work = ?
                    WHERE guild_id = ?
                      AND user_id = ?
                      AND wallet <= ?
                      AND last_work <= ?
                `).run(
                    reward,
                    newXp,
                    newLevel,
                    now,
                    guildId,
                    userId,
                    CONFIG.maxWallet - reward,
                    now - CONFIG.cooldown
                );

                if (update.changes !== 1) {
                    throw new Error(
                        "Não foi possível registrar seu trabalho."
                    );
                }

                // ==================================
                // HISTÓRICO FINANCEIRO
                // ==================================

                db.prepare(`
                    INSERT INTO transactions (
                        guild_id,
                        user_id,
                        target_id,
                        type,
                        amount
                    )
                    VALUES (?, ?, NULL, 'work', ?)
                `).run(
                    guildId,
                    userId,
                    reward
                );

                // ==================================
                // MISSÕES
                // ==================================

                recordMissionEvent(
                    guildId,
                    userId,
                    "work"
                );

                // ==================================
                // CONFIRMAR TRANSAÇÃO
                // ==================================

                db.exec("COMMIT");

                const updated = getPlayer(guildId, userId);

                const leveledUp =
                    updated.level > player.level;

                // ==================================
                // EMBED FINAL
                // ==================================

                return embedResponse(
                    createEmbed({
                        title: "💼 Expediente concluído!",

                        description:
                            "Você concluiu seu trabalho e recebeu sua recompensa." +
                            (
                                leveledUp
                                    ? "\n\n🎉 **Parabéns! Você alcançou o nível " +
                                      updated.level + "!**"
                                    : "\n\nContinue trabalhando para evoluir!"
                            ),

                        color: HELENA_COLORS.success,

                        fields: [
                            {
                                name: "👔 Emprego",
                                value: "**" + job.name + "**",
                                inline: false
                            },
                            {
                                name: "💰 Pagamento",
                                value: "**+" + formatMoney(reward) + "**",
                                inline: true
                            },
                            {
                                name: "✨ Experiência",
                                value: "**+" + CONFIG.xp + " XP**",
                                inline: true
                            },
                            {
                                name: "⚡ Energia consumida",
                                value:
                                    "-" + ENERGY_CONFIG.workCost,
                                inline: true
                            },
                            {
                                name: "🔋 Energia restante",
                                value:
                                    energyResult.energy +
                                    "/" +
                                    energyResult.max,
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
                                name: "⭐ Nível",
                                value: String(updated.level),
                                inline: true
                            },
                            {
                                name: "📊 XP total",
                                value: String(updated.xp),
                                inline: true
                            },
                            {
                                name: "⏰ Próximo expediente",
                                value: "Em 1 hora",
                                inline: false
                            }
                        ],

                        footer:
                            "Helena • O esforço constrói sua fortuna."
                    })
                );

            } catch (error) {
                if (db.isTransaction) {
                    db.exec("ROLLBACK");
                }

                throw error;
            }

        } catch (error) {
            console.error("[TRABALHAR]", error);

            return errorEmbed(
                "Não foi possível concluir seu trabalho: " +
                error.message
            );
        }
    }
};