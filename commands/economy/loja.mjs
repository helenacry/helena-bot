
import { ITEM_CATEGORIES } from "../../config/items.mjs";

import { getPlayer } from "../../database/economy.mjs";

import {
    buildShopView,
    ALL_CATEGORIES
} from "../../services/shop-view.mjs";

import {
    embedResponse,
    errorEmbed
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /LOJA
// ==========================================

// A loja é um painel: menu de categorias, 5 itens por página,
// botões para comprar cada item (abrem um modal de quantidade),
// "Por nome" e "Vender". A navegação fica em services/shop-panels.mjs.

export default {
    name: "loja",

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
            const player = getPlayer(guildId, userId);

            const category =
                interaction.data?.options?.categoria ??
                ALL_CATEGORIES;

            if (
                category !== ALL_CATEGORIES &&
                !Object.hasOwn(ITEM_CATEGORIES, category)
            ) {
                return errorEmbed("Categoria inválida.");
            }

            const view = buildShopView({
                ownerId: userId,
                category,
                page: 1,
                wallet: player.wallet
            });

            const response = embedResponse(view.embed);

            // Só o dono do painel navega e compra por ele.
            response.data.components = view.components;

            return response;

        } catch (error) {
            console.error("[LOJA]", error);

            return errorEmbed(
                "Não foi possível carregar a loja."
            );
        }
    }
};
