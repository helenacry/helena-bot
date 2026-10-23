
import {
    requestMarriage
} from "../../services/social/marriage.mjs";

import { mention } from "../../services/platform/mentions.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

export default {
    name: "casar",
    description: "Envia um pedido de casamento",

    options: [
        {
            name: "usuario",
            description: "Pessoa que você deseja pedir em casamento",
            type: "user",
            required: true
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const senderId = interaction.user?.id;

        const target = interaction.data.options?.usuario;

        const targetId =
            typeof target === "string"
                ? target
                : target?.id;

        try {
            const request = requestMarriage(
                guildId,
                senderId,
                targetId
            );

            return embedResponse(
                createEmbed({
                    section: "Casamento",
                    title: "💍 Pedido de casamento",

                    // Menção: vira chip no embed, sem notificar (quem avisa é o texto da mensagem).
                    description:
                        mention(request.senderId) + " 💌 " + mention(request.targetId) + "\n" +
                        "O casamento só é registrado se a pessoa convidada aceitar.\n" +
                        "> Responda com `/aceitarcasamento` ou `/recusarcasamento` em até **24 horas**.",

                    color: HELENA_COLORS.love,
                    mood: "amor",

                    footer: "O pedido vale por 24 horas"
                }),
                `<@${targetId}>`
            );

        } catch (error) {
            return errorEmbed(error.message);
        }
    }
};