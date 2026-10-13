
import {
    createEmbed,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

import { refuse } from "../../services/combat.mjs";

// ==========================================
// COMANDO /RECUSARDUELO
// ==========================================

export default {
    name: "recusarduelo",

    description: "Recusa um desafio PvP",

    options: [],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Este comando só pode ser usado em um servidor."
            );
        }

        try {
            // ==================================
            // RECUSAR DESAFIO
            // ==================================

            const recusado = await refuse(
                guildId,
                userId
            );

            const embed = createEmbed({
                title: "⚔️ Desafio PvP",

                description: recusado
                    ? "✅ Desafio recusado com sucesso."
                    : "❌ Você não possui nenhum desafio pendente.",

                color: HELENA_COLORS.primary
            });

            return {
                type: "message",

                data: {
                    body: "",
                    embeds: [embed]
                }
            };

        } catch (error) {
            console.error(
                "[RECUSARDUELO]",
                error
            );

            return errorEmbed(
                error?.message ||
                "Não foi possível recusar o desafio."
            );
        }
    }
};