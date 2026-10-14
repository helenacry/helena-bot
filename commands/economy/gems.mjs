
import {
    getPlayer
} from "../../database/economy.mjs";

import { getGemBonusStatus } from "../../services/gem-bonus.mjs";

import { formatDuration } from "../../utils/time.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

export default {
    name: "gemas",
    description: "Consulta seu saldo global de gemas",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
            const player = getPlayer(
                guildId,
                userId
            );

            const username =
                interaction.user?.displayName ||
                interaction.user?.username ||
                "Jogador";

            const gems = Number(player.gems ?? 0);

            // A mesma recarga do /coletargemas e do painel do site (é da conta).
            const bonus = getGemBonusStatus(String(userId));

            return embedResponse(
                createEmbed({
                    title: "💎 Helena Gems",

                    description:
                        "👤 **Jogador:** " +
                        username +
                        "\n\nConsulte suas gemas disponíveis.",

                    color: HELENA_COLORS.economy,

                    fields: [
                        {
                            name: "💎 Gemas disponíveis",
                            value:
                                "**" +
                                gems.toLocaleString("pt-BR") +
                                " 💎**",
                            inline: false
                        },
                        {
                            name: "🌐 Saldo global",
                            value:
                                "Suas gemas acompanham sua conta em todos os servidores.",
                            inline: false
                        },
                        {
                            name: "🎁 Bônus de gemas",
                            value: bonus.available
                                ? "**Disponível!** Use `/coletargemas` para coletar."
                                : "Próxima coleta em **" +
                                  formatDuration(bonus.remaining) +
                                  "**.",
                            inline: false
                        }
                    ],

                    footer:
                        "Helena • Suas gemas, em qualquer servidor."
                })
            );

        } catch (error) {
            console.error("[GEMAS]", error);

            return errorEmbed(
                "Erro ao consultar suas gemas."
            );
        }
    }
};