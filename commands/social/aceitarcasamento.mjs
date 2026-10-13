
import {
    acceptMarriage
} from "../../services/marriage.mjs";

import {
    mention,
    mentionAll
} from "../../services/mentions.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    warningEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

export default {
    name: "aceitarcasamento",
    description: "Aceita um pedido de casamento recebido",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
            const result = acceptMarriage(guildId, userId);

            if (result.expired) {
                return warningEmbed(
                    "Pedido expirado",
                    "Esse pedido ultrapassou o prazo de 24 horas."
                );
            }

            // Na descrição e nos campos do embed a menção vira chip (sem
            // notificar); quem avisa os dois é o texto da mensagem, abaixo.
            const coupleText = [
                mention(result.senderId),
                "❤️",
                mention(result.targetId)
            ].join("\n");

            const weddingDate = new Date(
                result.marriedAt * 1000
            ).toLocaleDateString("pt-BR", {
                timeZone: "UTC"
            });

            const embed = createEmbed({
                title: "💍 Casamento realizado!",

                description:
                    "### Felicidades ao novo casal! ❤️\n\n" +
                    "O pedido foi aceito e o casamento foi registrado.",

                color: HELENA_COLORS.success,

                fields: [
                    {
                        name: "💑 Casal",
                        value: coupleText,
                        inline: false
                    },
                    {
                        name: "📅 Data do casamento",
                        value: weddingDate,
                        inline: false
                    },
                    {
                        name: "👤 Perfil",
                        value:
                            "O estado civil já pode ser consultado com /perfil.",
                        inline: false
                    }
                ],

                footer:
                    "Helena • Uma nova história começa."
            });

            const mentions = mentionAll([
                result.senderId,
                result.targetId
            ]);

            return embedResponse(embed, mentions);

        } catch (error) {
            console.error("[ACEITAR CASAMENTO]", error);

            return errorEmbed(
                error.message ||
                "Não foi possível aceitar o casamento."
            );
        }
    }
};