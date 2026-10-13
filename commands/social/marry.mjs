
import {
    requestMarriage
} from "../../services/marriage.mjs";

import { mention } from "../../services/mentions.mjs";

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
                    title: "💍 Pedido de casamento",

                    description:
                        "Um novo pedido de casamento foi enviado!\n\n" +
                        "A pessoa convidada precisa aceitar para que o casamento seja registrado.",

                    color: HELENA_COLORS.primary,

                    fields: [
                        {
                            name: "❤️ Quem pediu",
                            // Menção: vira chip no embed, sem notificar.
                            value: mention(request.senderId),
                            inline: false
                        },
                        {
                            name: "💌 Destinatário",
                            value: mention(request.targetId),
                            inline: false
                        },
                        {
                            name: "⏳ Prazo",
                            value: "24 horas",
                            inline: true
                        },
                        {
                            name: "📨 Como responder",
                            value:
                                "Use `/aceitarcasamento` ou `/recusarcasamento`.",
                            inline: false
                        }
                    ]
                }),
                `<@${targetId}>`
            );

        } catch (error) {
            return errorEmbed(error.message);
        }
    }
};