
import {
    getPlayer
} from "../../database/economy.mjs";

import {
    getAvailableTitles,
    getEquippedTitle,
    checkAchievements
} from "../../services/progress/achievements.mjs";

import {
    getAchievementRarity
} from "../../config/achievements.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /TITULOS
// ==========================================

export default {
    name: "titulos",

    description:
        "Consulte seus títulos desbloqueados",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Este comando precisa ser utilizado em um servidor."
            );
        }

        try {
            // Garantir cadastro do jogador.
            getPlayer(guildId, userId);

            // Verificar conquistas que já podem
            // ser desbloqueadas.
            checkAchievements(guildId, userId);

            const titles = getAvailableTitles(
                guildId,
                userId
            );

            const equipped = getEquippedTitle(
                guildId,
                userId
            );

            // ==============================
            // NENHUM TÍTULO DESBLOQUEADO
            // ==============================

            if (titles.length === 0) {
                return embedResponse(
                    createEmbed({
                        title: "🏷️ Helena Títulos",

                        description:
                            "Você ainda não desbloqueou nenhum título.\n\n" +
                            "Complete conquistas para receber novos títulos.\n" +
                            "Use `/conquistas` para consultar seu progresso.",

                        color: HELENA_COLORS.primary,

                        footer:
                            "Helena • Títulos"
                    })
                );
            }

            // ==============================
            // LISTAR TÍTULOS
            // ==============================

            const lines = titles.map(title => {
                const rarity = getAchievementRarity({
                    rarity: title.rarity
                });

                const isEquipped =
                    equipped?.achievementId === title.id;

                const status = isEquipped
                    ? " · **EQUIPADO**"
                    : "";

                return (
                    title.formatted +
                    " " +
                    rarity.emoji +
                    status +
                    "\n" +
                    "`" +
                    title.id +
                    "`"
                );
            });

            // ==============================
            // EMBED
            // ==============================

            return embedResponse(
                createEmbed({
                    title: "🏷️ Helena Títulos",

                    description:
                        "**Seus títulos desbloqueados:**\n\n" +
                        lines.join("\n\n"),

                    color: HELENA_COLORS.primary,

                    fields: [
                        {
                            name: "✨ Título atual",

                            value:
                                equipped?.formatted ||
                                "Nenhum título equipado.",

                            inline: false
                        },
                        {
                            name: "📚 Total desbloqueado",

                            value:
                                String(titles.length),

                            inline: true
                        }
                    ],

                    footer:
                        "Use /equipartitulo para escolher um título."
                })
            );

        } catch (error) {
            console.error("[TITULOS]", error);

            return errorEmbed(
                "Não foi possível consultar seus títulos."
            );
        }
    }
};