
import {
    getPlayer
} from "../../database/economy.mjs";

import {
    getEquippedTitle,
    unequipTitle
} from "../../services/achievements.mjs";

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
                        title: "🏷️ Helena Títulos",

                        description:
                            "Você não possui nenhum título equipado.\n\n" +
                            "Use `/titulos` para consultar seus títulos disponíveis.",

                        color: HELENA_COLORS.warning,

                        footer:
                            "Helena • Títulos"
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
                    title: "🏷️ Título Desequipado",

                    description:
                        "Seu título foi removido com sucesso.\n\n" +
                        "**Título anterior:** " +
                        currentTitle.formatted,

                    color: HELENA_COLORS.success,

                    fields: [
                        {
                            name: "✨ Título atual",
                            value: "Nenhum",
                            inline: true
                        },
                        {
                            name: "🏆 Conquista",
                            value:
                                "Preservada. Você poderá equipar esse título novamente.",
                            inline: false
                        }
                    ],

                    footer:
                        "Helena • Use /equipartitulo para escolher outro título."
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