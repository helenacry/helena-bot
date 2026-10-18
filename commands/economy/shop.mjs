
import { ITEM_CATEGORIES } from "../../config/items.mjs";

import {
    buildShopHome,
    buildShopView,
    shopContext
} from "../../services/panels/shop-view.mjs";

import {
    embedResponse,
    errorEmbed
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /LOJA
// ==========================================

// A loja é um painel: abre numa vitrine com as prateleiras (ou direto
// numa categoria), 5 itens por página, botões para comprar cada item
// (abrem um modal de quantidade), "Por nome", "Vender" e "Fechar".
// A navegação fica em services/panels/shop-panels.mjs.

export default {
    name: "loja",
    aliases: ["store"],

    description: "Abra a loja: compre e venda itens",

    options: [
        {
            name: "categoria",
            description: "Abrir já numa categoria",
            type: "string",
            required: false,

            choices: Object.entries(
                ITEM_CATEGORIES
            ).map(([value, name]) => ({
                name,
                value
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
            const context = shopContext(guildId, userId);

            const category = interaction.data?.options?.categoria;

            if (category && !Object.hasOwn(ITEM_CATEGORIES, category)) {
                return errorEmbed("Categoria inválida.");
            }

            // Sem categoria: a vitrine inicial.
            const view = category
                ? buildShopView({
                    ownerId: userId,
                    category,
                    page: 1,
                    ...context
                })
                : buildShopHome({
                    ownerId: userId,
                    wallet: context.wallet,
                    gems: context.gems,
                    market: context.market
                });

            const response = embedResponse(view.embed);

            // Só o dono do painel navega e compra por ele.
            response.data.components = view.components;

            // O desenho do V2 (a vitrine limpa); o clássico ignora.
            response.data.layout = view.layout;

            return response;

        } catch (error) {
            console.error("[LOJA]", error);

            return errorEmbed(
                "Não foi possível carregar a loja."
            );
        }
    }
};
