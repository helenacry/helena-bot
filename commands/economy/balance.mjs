import {
    getPlayer
} from "../../database/economy.mjs";

import { bankPanel } from "../../services/panels/panels.mjs";

import { buildBalance } from "../../services/economy/balance-view.mjs";

import {
    embedResponse,
    errorEmbed
} from "../../utils/embed.mjs";

export default {
    name: "saldo",
    aliases: ["bal", "carteira"],
    description: "Consulta sua situação financeira",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta ou servidor."
            );
        }

        try {
            const player = getPlayer(guildId, userId);

            const username =
                interaction.user?.displayName ||
                interaction.user?.username ||
                "Jogador";

            // Botões que abrem formulários: depositar, sacar e
            // transferir (só o dono do painel consegue usar).
            const controls = bankPanel(userId);

            const view = buildBalance({
                player,
                username,
                avatarUrl: interaction.user?.avatarUrl,
                controls
            });

            const response = embedResponse(view.embed);

            response.data.components = controls;
            response.data.layout = view.layout;

            return response;

        } catch (error) {
            console.error("[SALDO]", error);

            return errorEmbed(
                "Não foi possível consultar sua situação financeira."
            );
        }
    }
};
