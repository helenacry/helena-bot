
import { buildRanking } from "../economy/ranking-view.mjs";

import {
    notYours,
    sameUser,
    update,
    warn
} from "./panel-kit.mjs";

// ==========================================
// RANKING: CLIQUES
// ==========================================

// customId: rank:tipo:<dono>:<tipo>. Só quem abriu o ranking troca de classificação.
export function handleRankingClick(interaction) {
    const [, action, ownerId, type] = String(
        interaction.data?.customId || ""
    ).split(":");

    if (!sameUser(interaction, ownerId)) {
        return notYours();
    }

    if (action !== "tipo") {
        return warn("Botão desconhecido", "Esse botão não é reconhecido.");
    }

    try {
        return update(buildRanking({
            guildId: interaction.guildId,
            userId: ownerId,
            type
        }));

    } catch (error) {
        return warn("Ranking", error.message);
    }
}
