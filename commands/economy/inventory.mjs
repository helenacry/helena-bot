
import { getPlayer } from "../../database/economy.mjs";

import { ITEM_CATEGORIES } from "../../config/items.mjs";

import {
    buildInventoryView,
    ALL_SHELVES
} from "../../services/panels/inventory-view.mjs";

import {
    embedResponse,
    errorEmbed
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /INVENTARIO
// ==========================================

// A mochila é um painel: menu de prateleiras, 12 itens por página,
// Anterior/Próxima/Atualizar e o botão Descartar (abre um modal e
// depois pede confirmação). A navegação fica em
// services/panels/shop-panels.mjs.

export default {
    name: "inventario",
    aliases: ["inv"],
    description: "Abra seu inventário: veja, organize e descarte itens",

    options: [
        {
            name: "categoria",
            description: "Abrir já numa prateleira (categoria)",
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
            getPlayer(guildId, userId);

            const category =
                interaction.data?.options?.categoria ??
                ALL_SHELVES;

            if (
                category !== ALL_SHELVES &&
                !Object.hasOwn(ITEM_CATEGORIES, category)
            ) {
                return errorEmbed("Categoria inválida.");
            }

            const view = buildInventoryView({
                ownerId: userId,
                guildId,
                userId,
                username:
                    interaction.user?.displayName ||
                    interaction.user?.username ||
                    "Jogador",
                category,
                page: 1
            });

            const response = embedResponse(view.embed);

            // Só o dono do painel navega e descarta por ele.
            response.data.components = view.components;

            return response;

        } catch (error) {
            console.error("[INVENTARIO]", error);

            return errorEmbed(
                "Não foi possível consultar seu inventário."
            );
        }
    }
};
