
import { getMarket } from "../economy/market.mjs";

import {
    buildMarketView,
    buildMarketClosed
} from "./market-view.mjs";

import {
    notYours,
    sameUser,
    update,
    warn
} from "./panel-kit.mjs";

// ==========================================
// BOLSA: CLIQUES
// ==========================================

// customId: bolsa:atualizar|fechar:<dono>. Só quem abriu o painel mexe nele.
export function handleMarketClick(interaction) {
    const [, action, ownerId] = String(
        interaction.data?.customId || ""
    ).split(":");

    if (!sameUser(interaction, ownerId)) {
        return notYours();
    }

    if (action === "atualizar") {
        return update(buildMarketView({
            ownerId,
            market: getMarket(interaction.guildId)
        }));
    }

    if (action === "fechar") {
        return update(buildMarketClosed());
    }

    return warn("Botão desconhecido", "Esse botão não é reconhecido.");
}
