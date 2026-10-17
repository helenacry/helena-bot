
import { db } from "../../database/connection.mjs";

import {
    getPlayer,
    formatMoney
} from "../../database/economy.mjs";

import {
    MISSIONS,
    getMission,
    getMissionPeriod
} from "../../config/missions.mjs";

import {
    getPlayerMissions
} from "../../services/economy/missions.mjs";

import {
    calculateLevel
} from "../../services/progress/experience.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    warningEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

const MAX_WALLET = 100_000_000_000_000;

function progressBar(progress, target) {
    const size = 10;

    const ratio = target > 0
        ? Math.max(0, Math.min(1, progress / target))
        : 0;

    const filled = Math.floor(ratio * size);

    return (
        "█".repeat(filled) +
        "░".repeat(size - filled)
    );
}

export default {
    name: "missoes",
    aliases: ["missao"],
    description: "Consulte e resgate suas missões diárias",

    options: [
        {
            name: "resgatar",
            description: "Missão que deseja resgatar",
            type: "string",
            required: false,
            choices: MISSIONS.map(mission => ({
                name: mission.name,
                value: mission.id
            }))
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
            getPlayer(guildId, userId);

            const selected =
                interaction.data.options?.resgatar;

            // ==================================
            // LISTAR MISSÕES
            // ==================================

            if (!selected) {
                const missions = getPlayerMissions(
                    guildId,
                    userId
                );

                const fields = [];

                for (const mission of missions) {
                    const complete =
                        mission.progress >= mission.target;

                    const status = mission.claimed
                        ? "✅ Resgatada"
                        : complete
                            ? "🎉 Pronta para resgatar"
                            : "⏳ Em andamento";

                    fields.push({
                        name:
                            mission.emoji +
                            " " +
                            mission.name,

                        value: [
                            mission.description,
                            "",
                            "**" +
                                progressBar(
                                    mission.progress,
                                    mission.target
                                ) +
                                "**",
                            "📊 **Progresso:** " +
                                mission.progress +
                                "/" +
                                mission.target,
                            "💰 **Recompensa:** " +
                                formatMoney(mission.reward) +
                                " + " +
                                mission.xp +
                                " XP",
                            "**Status:** " + status,
                            "🆔 `" + mission.id + "`"
                        ].join("\n"),

                        inline: false
                    });
                }

                const ready = missions.filter(
                    mission =>
                        mission.progress >= mission.target &&
                        !mission.claimed
                ).length;

                fields.push({
                    name: "🎁 Recompensas disponíveis",
                    value: "**" + ready + "**",
                    inline: true
                });

                return embedResponse(
                    createEmbed({
                        title: "📜 Helena Missões",

                        description:
                            "Complete seus objetivos diários e resgate recompensas.\n\n" +
                            "As missões reiniciam à **meia-noite UTC**.",

                        color:
                            ready > 0
                                ? HELENA_COLORS.success
                                : HELENA_COLORS.missions,

                        fields,

                        footer:
                            "Helena • Use /missoes resgatar para receber sua recompensa."
                    })
                );
            }

            // ==================================
            // RESGATAR MISSÃO
            // ==================================

            const mission = getMission(selected);

            if (!mission) {
                return errorEmbed(
                    "A missão selecionada não foi encontrada."
                );
            }

            db.exec("BEGIN IMMEDIATE");

            try {
                const period = getMissionPeriod();

                const saved = db.prepare(`
                    SELECT progress, claimed
                    FROM mission_progress
                    WHERE guild_id = ?
                      AND user_id = ?
                      AND mission_id = ?
                      AND period = ?
                `).get(
                    guildId,
                    userId,
                    mission.id,
                    period
                );

                if (!saved || saved.progress < mission.target) {
                    db.exec("ROLLBACK");

                    return warningEmbed(
                        "Missão incompleta",
                        mission.emoji +
                        " **" +
                        mission.name +
                        "**\n\n" +
                        "**" +
                        progressBar(
                            saved?.progress ?? 0,
                            mission.target
                        ) +
                        "**\n" +
                        "📊 **Progresso:** " +
                        (saved?.progress ?? 0) +
                        "/" +
                        mission.target +
                        "\n\nConclua o objetivo antes de resgatar."
                    );
                }

                if (saved.claimed) {
                    db.exec("ROLLBACK");

                    return warningEmbed(
                        "Recompensa já resgatada",
                        "Você já recebeu a recompensa da missão **" +
                        mission.name +
                        "** neste período."
                    );
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

                if (
                    player.wallet > MAX_WALLET - mission.reward
                ) {
                    throw new Error(
                        "Sua carteira não comporta essa recompensa."
                    );
                }

                const newXp = player.xp + mission.xp;

                if (!Number.isSafeInteger(newXp)) {
                    throw new Error(
                        "Limite de experiência atingido."
                    );
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
                `).run(
                    guildId,
                    userId,
                    mission.id,
                    period,
                    mission.target
                );

                if (claim.changes !== 1) {
                    throw new Error(
                        "Não foi possível confirmar o resgate."
                    );
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
                    throw new Error(
                        "Não foi possível pagar a recompensa."
                    );
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
                `).run(
                    guildId,
                    userId,
                    mission.reward
                );

                db.exec("COMMIT");

                return embedResponse(
                    createEmbed({
                        title: "🎉 Missão concluída!",

                        description:
                            mission.emoji +
                            " **" +
                            mission.name +
                            "**\n\n" +
                            "Sua recompensa foi resgatada com sucesso!" +
                            (
                                newLevel > player.level
                                    ? "\n\n🎊 **Você também subiu de nível!**"
                                    : "\n\nContinue completando suas missões!"
                            ),

                        color: HELENA_COLORS.success,

                        fields: [
                            {
                                name: "💰 Recompensa",
                                value:
                                    "**+" +
                                    formatMoney(mission.reward) +
                                    "**",
                                inline: true
                            },
                            {
                                name: "✨ Experiência",
                                value:
                                    "**+" +
                                    mission.xp +
                                    " XP**",
                                inline: true
                            },
                            {
                                name: "👛 Carteira atual",
                                value:
                                    formatMoney(
                                        player.wallet + mission.reward
                                    ),
                                inline: false
                            },
                            {
                                name: "⭐ Nível atual",
                                value: String(newLevel),
                                inline: true
                            },
                            {
                                name: "📊 XP total",
                                value: String(newXp),
                                inline: true
                            }
                        ],

                        footer:
                            "Helena • Uma conquista de cada vez."
                    })
                );

            } catch (error) {
                if (db.isTransaction) {
                    db.exec("ROLLBACK");
                }

                throw error;
            }

        } catch (error) {
            console.error("[MISSOES]", error);

            return errorEmbed(
                "Não foi possível processar a missão: " +
                error.message
            );
        }
    }
};