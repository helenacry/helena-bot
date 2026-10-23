
import {
    getPlayer
} from "../../database/economy.mjs";

import { getGemBonusStatus } from "../../services/economy/gem-bonus.mjs";

import { formatDuration } from "../../utils/time.mjs";

import {
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
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
                ledgerEmbed({
                    section: "Gemas",
                    title: "💎 Gemas de " + username,

                    say: "As gemas são da sua conta e valem em todos os servidores.",

                    rows: [
                        ["Gemas", gems.toLocaleString("pt-BR")],
                        [
                            "Bônus",
                            bonus.available
                                ? "disponível"
                                : "em " + formatDuration(bonus.remaining)
                        ]
                    ],

                    note: bonus.available
                        ? "O bônus está liberado: use `/coletargemas`."
                        : "",

                    color: HELENA_COLORS.primary,
                    thumbnail: interaction.user?.avatarUrl,
                    mood: "festa",

                    footer: "/coletargemas rende gemas de tempos em tempos"
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
