
import {
    getPlayer,
    formatMoney
} from "../../database/economy.mjs";

import {
    getAllAchievements,
    getAchievementRarity,
    formatAchievementTitle
} from "../../config/achievements.mjs";

import {
    checkAchievements,
    hasAchievement,
    getAchievementProgress,
    getEquippedTitle
} from "../../services/progress/achievements.mjs";

import { getPlayerName } from "../../services/platform/player-names.mjs";

import { mention } from "../../services/platform/mentions.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const PROGRESS_BAR_SIZE = 10;

// ==========================================
// UTILITÁRIOS
// ==========================================

function progressBar(current, target) {
    const percentage = target > 0
        ? Math.min(1, Math.max(0, current / target))
        : 0;

    const filled = Math.round(
        percentage * PROGRESS_BAR_SIZE
    );

    return (
        "▰".repeat(filled) +
        "▱".repeat(PROGRESS_BAR_SIZE - filled)
    );
}

function formatProgress(value, type) {
    if (type === "wealth") {
        return formatMoney(value);
    }

    if (type === "streak") {
        return value + " dias";
    }

    if (type === "duel_wins") {
        return value + " vitórias";
    }

    if (type === "gems") {
        return value + " gemas";
    }

    return String(value);
}

function safeName(value) {
    return String(value || "Jogador")
        .replace(/\\/g, "\\\\")
        .replace(/([*_`~|>])/g, "\\$1")
        .replace(/@/g, "@\u200b")
        .replace(/\n/g, " ")
        .slice(0, 80);
}

// ==========================================
// COMANDO /CONQUISTAS
// ==========================================

export default {
    name: "conquistas",

    description:
        "Consulte suas conquistas, títulos e progresso",

    options: [
        {
            name: "jogador",
            description:
                "Jogador que deseja consultar",
            type: "user",
            required: false
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const authorId = interaction.user?.id;

        if (!guildId || !authorId) {
            return errorEmbed(
                "Este comando precisa ser utilizado em um servidor."
            );
        }

        try {
            // ==================================
            // IDENTIFICAR JOGADOR
            // ==================================

            const selectedUser =
                interaction.data.options?.jogador;

            const targetId =
                typeof selectedUser === "string"
                    ? selectedUser
                    : selectedUser?.id || authorId;

            const ownProfile =
                String(targetId) === String(authorId);

            const player = getPlayer(
                guildId,
                targetId
            );

            if (!player) {
                return errorEmbed(
                    "Não foi possível encontrar esse jogador."
                );
            }

            // ==================================
            // VERIFICAR CONQUISTAS
            // ==================================

            const newlyUnlocked = checkAchievements(
                guildId,
                targetId
            );

            const achievements = getAllAchievements();

            const unlocked = achievements.filter(
                achievement =>
                    hasAchievement(
                        guildId,
                        targetId,
                        achievement.id
                    )
            );

            const pending = achievements.filter(
                achievement =>
                    !hasAchievement(
                        guildId,
                        targetId,
                        achievement.id
                    )
            );

            const equipped = getEquippedTitle(
                guildId,
                targetId
            );

            // ==================================
            // CONQUISTAS DESBLOQUEADAS
            // ==================================

            const unlockedLines = unlocked.map(
                achievement => {
                    const rarity = getAchievementRarity(
                        achievement
                    );

                    return (
                        achievement.emoji +
                        " **" +
                        achievement.name +
                        "** " +
                        rarity.emoji +
                        "\n" +
                        "Título: " +
                        formatAchievementTitle(achievement)
                    );
                }
            );

            // ==================================
            // CONQUISTAS PENDENTES
            // ==================================

            const pendingLines = pending.map(
                achievement => {
                    const requirement =
                        achievement.requirement;

                    const current =
                        getAchievementProgress(
                            guildId,
                            targetId,
                            achievement
                        );

                    const target = requirement.target;

                    const visibleProgress = Math.min(
                        current,
                        target
                    );

                    return (
                        achievement.emoji +
                        " **" +
                        achievement.name +
                        "**\n" +
                        progressBar(
                            visibleProgress,
                            target
                        ) +
                        " " +
                        formatProgress(
                            visibleProgress,
                            requirement.type
                        ) +
                        " / " +
                        formatProgress(
                            target,
                            requirement.type
                        )
                    );
                }
            );

            // ==================================
            // RESUMO
            // ==================================

            const total = achievements.length;

            const completion = total > 0
                ? Math.round(
                    (unlocked.length / total) * 100
                )
                : 0;

            // Outra pessoa: o nome salvo, ou a menção (o Discord mostra o
            // nome real; no lugar do antigo "Jogador #123456").
            const savedName = ownProfile
                ? null
                : getPlayerName(targetId);

            const playerText = ownProfile
                ? safeName(
                    interaction.user?.displayName ||
                    interaction.user?.username ||
                    "Você"
                )
                : savedName
                    ? safeName(savedName)
                    : mention(targetId);

            const description = [
                progressBar(unlocked.length, total) +
                    "  **" + unlocked.length + "/" + total +
                    "** (" + completion + "%)",

                "🏷️ Título equipado: " +
                    (
                        equipped?.formatted ||
                        "nenhum"
                    ),

                newlyUnlocked.length > 0
                    ? "> 🎉 **Novas conquistas desbloqueadas: " +
                      newlyUnlocked.length +
                      "**"
                    : ""
            ].filter(Boolean).join("\n");

            // ==================================
            // EMBED
            // ==================================

            return embedResponse(
                createEmbed({
                    section: "Conquistas",
                    title: "🏆 Conquistas de " + playerText,

                    description,

                    color: HELENA_COLORS.primary,
                    thumbnail: ownProfile ? interaction.user?.avatarUrl : undefined,
                    mood: "festa",

                    fields: [
                        {
                            name:
                                "✅ Desbloqueadas (" +
                                unlocked.length +
                                ")",

                            value:
                                unlockedLines.join("\n\n") ||
                                "Nenhuma conquista desbloqueada.",

                            inline: false
                        },

                        {
                            name:
                                "🔒 Pendentes (" +
                                pending.length +
                                ")",

                            value:
                                pendingLines.join("\n\n") ||
                                "Você desbloqueou todas as conquistas!",

                            inline: false
                        }
                    ],

                    footer:
                        "/titulos mostra os títulos que você já pode usar"
                })
            );

        } catch (error) {
            console.error(
                "[CONQUISTAS]",
                error
            );

            return errorEmbed(
                "Não foi possível consultar as conquistas."
            );
        }
    }
};