
import {
    createEmbed,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

import { challenge, DUEL_RULES } from "../../services/combat/combat.mjs";

import { mention } from "../../services/platform/mentions.mjs";

// Quanto o desafio vale, escrito para o jogador (o prazo vem de DUEL_RULES).
const REQUEST_MINUTES = Math.round(DUEL_RULES.requestTtl / 60);

export default {
    name: "atacar",

    description: "Desafia outro jogador para um duelo",

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
                section: "Duelo",
                title: "⚔️ Desafio enviado",

                description:
                    `${mention(targetId)} tem ${REQUEST_MINUTES} minutos para usar ` +
                    "`/aceitarduelo` ou `/recusarduelo`.\n" +
                    "Nenhum dinheiro será perdido.",

                color: HELENA_COLORS.error,
                mood: "bravo",

                footer: "Duelo gasta munição e desgasta a arma"
            });

            return {
                type: "message",

                data: {
                    // Menção só avisa quem é citada no texto da mensagem; dentro
                    // do embed ela vira apenas um chip (veja services/platform/mentions.mjs).
                    body: mention(targetId),
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