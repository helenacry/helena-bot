
import { getPlayer } from "../../database/economy.mjs";

import { claimMission } from "../economy/missions.mjs";

import {
    buildMissions,
    claimNotice,
    claimProblem
} from "../economy/missions-view.mjs";

import {
    notYours,
    sameUser,
    update,
    warn
} from "./panel-kit.mjs";

// ==========================================
// MISSÕES: CLIQUES
// ==========================================

// customId: miss:resgatar:<dono>:<missão>. Só quem abriu a lista resgata. O resgate paga e a
// própria lista é atualizada, com uma linha de aviso no topo.
export function handleMissionsClick(interaction) {
    const [, action, ownerId, missionId] = String(
        interaction.data?.customId || ""
    ).split(":");

    if (!sameUser(interaction, ownerId)) {
        return notYours();
    }

    if (action !== "resgatar") {
        return warn("Botão desconhecido", "Esse botão não é reconhecido.");
    }

    const guildId = interaction.guildId;

    try {
        getPlayer(guildId, ownerId);

        const result = claimMission({ guildId, userId: ownerId, missionId });

        const problem = claimProblem(result);

        if (problem) {
            return warn(problem.title, problem.message);
        }

        return update(buildMissions({
            guildId,
            userId: ownerId,
            notice: claimNotice(result)
        }));

    } catch (error) {
        console.error("[MISSOES]", error);

        return warn("Missões", "Não foi possível processar a missão: " + error.message);
    }
}
