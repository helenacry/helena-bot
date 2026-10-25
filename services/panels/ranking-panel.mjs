
import { buildRanking, typeForScope } from "../economy/ranking-view.mjs";

import {
    notYours,
    sameUser,
    update,
    warn
} from "./panel-kit.mjs";

// ==========================================
// RANKING: CLIQUES
// ==========================================

// Só quem abriu o ranking mexe nele. Os botões trocam a classificação e o alcance na mesma mensagem:
//
//   rank:tipo:<dono>:<tipo>          classificação do servidor
//   rank:tipo:<dono>:<tipo>:g        classificação global
//   rank:escopo:<dono>:<s|g>:<tipo>  muda o alcance (o tipo vai junto, se existir no novo alcance)
export function handleRankingClick(interaction) {
    const [, action, ownerId, first, second] = String(
        interaction.data?.customId || ""
    ).split(":");

    if (!sameUser(interaction, ownerId)) {
        return notYours();
    }

    let scope;
    let type;

    if (action === "tipo") {
        scope = second === "g" ? "global" : "server";
        type = first;

    } else if (action === "escopo") {
        scope = first === "g" ? "global" : "server";
        type = typeForScope(second, scope);

    } else {
        return warn("Botão desconhecido", "Esse botão não é reconhecido.");
    }

    try {
        return update(buildRanking({
            guildId: interaction.guildId,
            userId: ownerId,
            type,
            scope
        }));

    } catch (error) {
        return warn("Ranking", error.message);
    }
}
