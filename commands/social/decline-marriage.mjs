
import {
    refuseMarriage
} from "../../services/social/marriage.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

export default {
    name: "recusarcasamento",
    description: "Recusa um pedido de casamento recebido",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
            refuseMarriage(guildId, userId);

            return embedResponse(
                createEmbed({
                    section: "Casamento",
                    title: "💔 Pedido recusado",

                    description:
                        "Você recusou o pedido de casamento. " +
                        "Seu estado civil continua como estava.",

                    color: HELENA_COLORS.wait,
                    mood: "triste",

                    footer:
                        "Cada um segue o seu caminho"
                })
            );

        } catch (error) {
            console.error("[RECUSAR CASAMENTO]", error);

            return errorEmbed(
                error.message ||
                "Não foi possível recusar o pedido."
            );
        }
    }
};