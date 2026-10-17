
import {
    createEmbed,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

import { refuse, pendingChallenge } from "../../services/combat/combat.mjs";

import { mention } from "../../services/platform/mentions.mjs";

// ==========================================
// COMANDO /RECUSARDUELO
// ==========================================

export default {
    name: "recusarduelo",

    description: "Recusa o desafio de duelo que você recebeu",

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

            // Quem desafiou, lido antes de apagar o desafio, para avisar a pessoa.
            const challenger = pendingChallenge(guildId, userId)?.senderId;

            const recusado = await refuse(
                guildId,
                userId
            );

            const description = !recusado
                ? "❌ Você não possui nenhum desafio pendente."
                : challenger
                    ? `✅ Você recusou o desafio de ${mention(challenger)}.`
                    : "✅ Desafio recusado com sucesso.";

            const embed = createEmbed({
                title: "⚔️ Desafio PvP",

                description,

                color: HELENA_COLORS.primary
            });

            return {
                type: "message",

                data: {
                    // quem desafiou é avisado pelo texto da mensagem
                    body: recusado && challenger ? mention(challenger) : "",
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