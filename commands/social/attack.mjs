
import {
    createEmbed,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

import { challenge } from "../../services/combat.mjs";

export default {
    name: "atacar",

    description: "Desafia um jogador para PvP",

    options: [
        {
            name: "usuario",
            description: "Jogador",
            type: "user",
            required: true
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Este comando só pode ser usado em um servidor."
            );
        }

        try {
            const targetId = String(
                interaction.data?.options?.usuario || ""
            ).trim()

            if (!targetId) {
                return errorEmbed(
                    "Você precisa selecionar um jogador."
                );
            }

            await challenge(
                guildId,
                userId,
                targetId
            );

            const embed = createEmbed({
                title: "⚔️ Desafio enviado",

                description:
                    `<@${targetId}> tem 2 minutos para usar ` +
                    "`/aceitarduelo` ou `/recusarduelo`.\n" +
                    "Nenhum dinheiro será perdido.",

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
                "[ATACAR]",
                error
            );

            return errorEmbed(
                error?.message ||
                "Não foi possível enviar o desafio."
            );
        }
    }
};