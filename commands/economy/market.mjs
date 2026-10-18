
import {
    embedResponse,
    errorEmbed
} from "../../utils/embed.mjs";

import { getMarket } from "../../services/economy/market.mjs";

import { buildMarketView } from "../../services/panels/market-view.mjs";

// ==========================================
// COMANDO /BOLSA
// ==========================================

// O mercado do servidor: o índice (de 0 a 90, sorteado a cada 30 minutos),
// o item em alta e os preços de agora. Só mostra informação, então também
// abre na prisão. As regras estão em services/economy/market.mjs.

export default {
    name: "bolsa",
    aliases: ["mercado"],
    description: "Veja o índice do mercado, o item em alta e os preços de agora",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
            const view = buildMarketView({
                ownerId: userId,
                market: getMarket(guildId)
            });

            const response = embedResponse(view.embed);

            // Só o dono do painel mexe nos botões.
            response.data.components = view.components;

            if (view.layout) {
                response.data.layout = view.layout;
            }

            return response;

        } catch (error) {
            console.error("[BOLSA]", error);

            return errorEmbed(
                "Não foi possível carregar a bolsa."
            );
        }
    }
};
