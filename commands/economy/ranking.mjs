import { getPlayer } from "../../database/economy.mjs";

import { savePlayerName } from "../../services/platform/player-names.mjs";

import {
    buildRanking,
    RANKING_TYPES,
    GLOBAL_RANKING_TYPES,
    typeForScope
} from "../../services/economy/ranking-view.mjs";

import {
    embedResponse,
    errorEmbed
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /RANKING
// ==========================================

// Dois alcances: o do servidor (o padrão) e o global, que junta todos os servidores. O primeiro do
// "XP total" global é quem o status do bot mostra. Os botões da mensagem trocam a classificação e o
// alcance (services/panels/ranking-panel.mjs).
//
//   /ranking                       patrimônio do servidor
//   /ranking tipo:level            nível do servidor
//   /ranking escopo:global         XP total de todos os servidores
//   /ranking escopo:global tipo:money

// As escolhas do menu "tipo": as do servidor e o XP total do global.
const TYPE_CHOICES = [
    ...Object.entries(RANKING_TYPES).map(([value, entry]) => ({ name: entry.name, value })),
    { name: GLOBAL_RANKING_TYPES.xp.name + " (global)", value: "xp" }
];

export default {
    name: "ranking",
    aliases: ["top"],

    description:
        "Consulte os melhores jogadores do servidor ou de todos os servidores",

    options: [
        {
            name: "tipo",
            description: "Escolha a classificação",
            type: "string",
            required: false,

            choices: TYPE_CHOICES
        },

        {
            name: "escopo",
            description: "Neste servidor ou em todos (global)",
            type: "string",
            required: false,

            choices: [
                { name: "Neste servidor", value: "servidor" },
                { name: "Global (todos os servidores)", value: "global" }
            ]
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

            const scope = interaction.data.options?.escopo === "global" ? "global" : "server";

            const asked = interaction.data.options?.tipo || (scope === "global" ? "xp" : "money");

            if (!RANKING_TYPES[asked] && !GLOBAL_RANKING_TYPES[asked]) {
                return errorEmbed(
                    "Tipo de ranking inválido."
                );
            }

            // "nível" no global é o XP total, e "XP total" no servidor é o nível
            const type = typeForScope(asked, scope);

            const view = buildRanking({ guildId, userId, type, scope });

            const response = embedResponse(view.embed);

            // Os botões trocam a classificação e o alcance (só para quem abriu).
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
