
import {
    getPlayer
} from "../../database/economy.mjs";

import {
    getEquippedTitle,
    unequipTitle
} from "../../services/progress/achievements.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /DESEQUIPARTITULO
// ==========================================

export default {
    name: "desequipartitulo",

    description:
        "Remova seu título equipado sem perder a conquista",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Este comando precisa ser utilizado em um servidor."
            );
        }

        try {
            // ==================================
            // IDENTIFICAR JOGADOR
            // ==================================

            getPlayer(guildId, userId);

            // ==================================
            // CONSULTAR TÍTULO ATUAL
            // ==================================

            const currentTitle = getEquippedTitle(
                guildId,
                userId
            );

            if (!currentTitle) {
                return embedResponse(
                    createEmbed({
                        section: "Títulos",
                        title: "🏷️ Nenhum título equipado",

                        description:
                            "Use `/titulos` para consultar os que você já pode usar.",

                        color: HELENA_COLORS.warning,
                        mood: "alerta",

                        footer:
                            "/equipartitulo escolhe um"
                    })
                );
            }

            // ==================================
            // DESEQUIPAR
            // ==================================

            const removed = unequipTitle(
                guildId,
                userId
            );

            if (!removed) {
                return errorEmbed(
                    "Não foi possível remover o título. Tente novamente."
                );
            }

            // ==================================
            // RESPOSTA
            // ==================================

            return embedResponse(
                createEmbed({
                    section: "Títulos",
                    title: "🏷️ Título removido",

                    description:
                        "Você tirou **" + currentTitle.formatted + "**.\n" +
                        "A conquista continua sua e dá para equipar de novo.",

                    color: HELENA_COLORS.wait,
                    mood: "dormindo",

                    footer:
                        "/equipartitulo escolhe outro"
                })
            );

        } catch (error) {
            console.error(
                "[DESEQUIPARTITULO]",
                error
            );

            return errorEmbed(
                "Não foi possível desequipar seu título."
            );
        }
    }
};