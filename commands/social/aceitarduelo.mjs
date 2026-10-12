
import {
    createEmbed,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

import { accept } from "../../services/combat.mjs";

export default {
    name: "aceitarduelo",
    description: "Aceita o desafio PvP",
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
                `<@${result.sender}>: ${result.senderHp} HP (causou ${result.senderDamage} de dano)`,
                `<@${result.target}>: ${result.targetHp} HP (causou ${result.targetDamage} de dano)`,
                "",
                result.winner
                    ? `🏆 Vencedor: <@${result.winner}> (+35 XP)`
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
                    body: "",
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