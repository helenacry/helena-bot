
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

import { stamp } from "../../utils/receipt.mjs";

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
                        section: "Títulos",
                        title: "🏷️ Nenhum título ainda",

                        description:
                            "Complete conquistas para receber títulos novos.\n" +
                            "Use `/conquistas` para consultar seu progresso.",

                        color: HELENA_COLORS.wait,
                        mood: "dormindo",

                        footer:
                            "Cada conquista libera um título"
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
                    ? " " + stamp("equipado")
                    : "";

                return (
                    title.formatted +
                    " " +
                    rarity.emoji +
                    status +
                    "  `" +
                    title.id +
                    "`"
                );
            });

            // ==============================
            // EMBED
            // ==============================

            return embedResponse(
                createEmbed({
                    section: "Títulos",
                    title: "🏷️ Seus títulos",

                    description:
                        "✨ Título atual: " +
                        (equipped?.formatted || "nenhum") +
                        "\n\n" +
                        lines.join("\n") +
                        "\n\n-# " + titles.length + " desbloqueado" + (titles.length === 1 ? "" : "s"),

                    color: HELENA_COLORS.primary,
                    mood: "festa",

                    footer:
                        "/equipartitulo escolhe o título que aparece no perfil"
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