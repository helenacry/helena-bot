
import {
    acceptMarriage
} from "../../services/social/marriage.mjs";

import {
    mention,
    mentionAll
} from "../../services/platform/mentions.mjs";

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
                section: "Casamento",
                title: "💍 Casamento realizado",

                description:
                    "Felicidades ao novo casal! ❤️\n" +
                    coupleText.replace(/\n❤️\n/, " ❤️ ") + "\n" +
                    "> Casados desde **" + weddingDate + "**. O estado civil já aparece no `/perfil`.",

                color: HELENA_COLORS.love,
                mood: "amor",

                footer:
                    "Uma nova história começa"
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