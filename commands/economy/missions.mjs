import { getPlayer } from "../../database/economy.mjs";

import { MISSIONS } from "../../config/missions.mjs";

import { claimMission } from "../../services/economy/missions.mjs";

import {
    buildClaimResult,
    buildMissions,
    claimProblem
} from "../../services/economy/missions-view.mjs";

import {
    embedResponse,
    errorEmbed,
    warningEmbed
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /MISSOES
// ==========================================

// Sem opção, mostra a lista do dia, com um botão Resgatar em cada missão pronta. Com
// resgatar:<missão>, paga a recompensa direto (o mesmo resgate do botão).

export default {
    name: "missoes",
    aliases: ["missao"],
    description: "Consulte e resgate suas missões diárias",

    options: [
        {
            name: "resgatar",
            description: "Missão que deseja resgatar",
            type: "string",
            required: false,
            choices: MISSIONS.map(mission => ({
                name: mission.name,
                value: mission.id
            }))
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
            getPlayer(guildId, userId);

            const selected =
                interaction.data.options?.resgatar;

            // ==================================
            // LISTAR MISSÕES
            // ==================================

            if (!selected) {
                const view = buildMissions({ guildId, userId });

                const response = embedResponse(view.embed);

                if (view.components.length > 0) {
                    response.data.components = view.components;
                }

                response.data.layout = view.layout;

                return response;
            }

            // ==================================
            // RESGATAR MISSÃO
            // ==================================

            const result = claimMission({ guildId, userId, missionId: selected });

            if (result.status === "unknown") {
                return errorEmbed(claimProblem(result).message);
            }

            const problem = claimProblem(result);

            if (problem) {
                return warningEmbed(problem.title, problem.message);
            }

            return embedResponse(buildClaimResult(result));

        } catch (error) {
            console.error("[MISSOES]", error);

            return errorEmbed(
                "Não foi possível processar a missão: " +
                error.message
            );
        }
    }
};
