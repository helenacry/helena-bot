
import { getPlayer } from "../../database/economy.mjs";

import { getMission } from "../../config/missions.mjs";

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

// customId: miss:resgatar:<dono>:<missão> e miss:tab:<dono>:<aba>. Só quem abriu a lista mexe nela. O resgate paga e a
// própria lista é atualizada (na aba da missão resgatada), com uma linha de aviso no topo; os botões de aba trocam
// entre as diárias e as semanais.
export function handleMissionsClick(interaction) {
    const [, action, ownerId, missionId] = String(
        interaction.data?.customId || ""
    ).split(":");

    if (!sameUser(interaction, ownerId)) {
        return notYours();
    }

    const guildId = interaction.guildId;

    if (action === "tab") {
        if (!guildId) {
            return null;
        }

        return update(buildMissions({ guildId, userId: ownerId, tab: missionId }));
    }

    if (action !== "resgatar") {
        return warn("Botão desconhecido", "Esse botão não é reconhecido.");
    }

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
            notice: claimNotice(result),
            tab: getMission(missionId)?.period ?? "daily"
        }));

    } catch (error) {
        console.error("[MISSOES]", error);

        return warn("Missões", "Não foi possível processar a missão: " + error.message);
    }
}
