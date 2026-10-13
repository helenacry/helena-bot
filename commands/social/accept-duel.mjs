
import {
    createEmbed,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

import { accept, DUEL_RULES } from "../../services/combat.mjs";

import { mention, mentionAll } from "../../services/mentions.mjs";

export default {
    name: "aceitarduelo",
    description: "Aceita o desafio de duelo que você recebeu",
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
            const result = await accept(guildId, userId);

            if (!result) {
                return errorEmbed(
                    "Não foi possível processar o duelo."
                );
            }

            const description = [
                `${mention(result.sender)}: ${result.senderHp} HP (causou ${result.senderDamage} de dano)`,
                `${mention(result.target)}: ${result.targetHp} HP (causou ${result.targetDamage} de dano)`,
                "",
                result.winner
                    ? `🏆 Vencedor: ${mention(result.winner)} (+${DUEL_RULES.winXp} XP)`
                    : "🤝 Empate!"
            ].join("\n");

            const embed = createEmbed({
                title: "⚔️ Resultado do duelo",
                description,
                color: HELENA_COLORS.primary
            });

            return {
                type: "message",
                data: {
                    // quem desafiou precisa saber que o duelo aconteceu
                    body: mentionAll([result.sender, result.target]),
                    embeds: [embed]
                }
            };

        } catch (error) {
            console.error("[ACEITARDUELO]", error);

            return errorEmbed(
                error?.message ||
                "Não foi possível aceitar o duelo."
            );
        }
    }
};