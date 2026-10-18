import { getPlayer } from "../../database/economy.mjs";

import { savePlayerName } from "../../services/platform/player-names.mjs";

import { buildRanking, RANKING_TYPES } from "../../services/economy/ranking-view.mjs";

import {
    embedResponse,
    errorEmbed
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /RANKING
// ==========================================

export default {
    name: "ranking",
    aliases: ["top"],

    description:
        "Consulte os melhores jogadores do servidor",

    options: [
        {
            name: "tipo",
            description: "Escolha a classificação",
            type: "string",
            required: false,

            choices: Object.entries(RANKING_TYPES).map(([value, entry]) => ({
                name: entry.name,
                value
            }))
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Este comando precisa ser utilizado em um servidor."
            );
        }

        try {
            // Garantir cadastro e atualizar nome
            getPlayer(guildId, userId);
            savePlayerName(interaction.user);

            const type = interaction.data.options?.tipo || "money";

            if (!RANKING_TYPES[type]) {
                return errorEmbed(
                    "Tipo de ranking inválido."
                );
            }

            const view = buildRanking({ guildId, userId, type });

            const response = embedResponse(view.embed);

            // Os botões trocam a classificação (só para quem abriu).
            response.data.components = view.components;
            response.data.layout = view.layout;

            return response;

        } catch (error) {
            console.error("[RANKING]", error);

            return errorEmbed(
                "Não foi possível carregar o ranking."
            );
        }
    }
};
