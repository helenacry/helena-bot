
import {
    getPlayer
} from "../../database/economy.mjs";

import {
    ITEM_CATEGORIES,
    getCategoryName
} from "../../config/items.mjs";

import {
    getInventory,
    getInventoryStats
} from "../../services/inventory.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

export default {
    name: "inventario",
    description: "Consulte os itens do seu inventário",

    options: [
        {
            name: "categoria",
            description: "Filtre os itens por categoria",
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
                interaction.data.options?.categoria;

            if (
                category &&
                !Object.hasOwn(ITEM_CATEGORIES, category)
            ) {
                return errorEmbed("Categoria inválida.");
            }

            const inventory = getInventory(
                guildId,
                userId
            );

            const stats = getInventoryStats(
                guildId,
                userId
            );

            const filtered = category
                ? inventory.filter(
                    entry => entry.category === category
                )
                : inventory;

            const username =
                interaction.user?.displayName ||
                interaction.user?.username ||
                "Jogador";

            const categoryLabel = category
                ? getCategoryName(category)
                : "Todas";

            // ==================================
            // INVENTÁRIO VAZIO
            // ==================================

            if (filtered.length === 0) {
                return embedResponse(
                    createEmbed({
                        title: "🎒 Helena Inventário",

                        description:
                            "👤 **Jogador:** " + username + "\n" +
                            "📂 **Categoria:** " + categoryLabel +
                            "\n\n📦 Nenhum item encontrado nesta seleção.\n\n" +
                            "Visite `/loja` para adquirir novos itens.",

                        color: HELENA_COLORS.inventory,

                        fields: [
                            {
                                name: "📦 Itens diferentes",
                                value: String(stats.uniqueItems),
                                inline: true
                            },
                            {
                                name: "🔢 Quantidade total",
                                value: String(stats.totalQuantity),
                                inline: true
                            },
                            {
                                name: "📚 Catálogo",
                                value: String(stats.catalogSize),
                                inline: true
                            }
                        ]
                    })
                );
            }

            // ==================================
            // AGRUPAR POR CATEGORIA
            // ==================================

            const groups = new Map();

            for (const entry of filtered) {
                const key = entry.category;

                if (!groups.has(key)) {
                    groups.set(key, []);
                }

                groups.get(key).push(entry);
            }

            const fields = [];

            for (const [key, entries] of groups) {
                const lines = entries.map(entry => {
                    const description =
                        entry.item?.description ||
                        "Item sem descrição.";

                    return [
                        entry.emoji +
                            " **" +
                            entry.name +
                            "** ×" +
                            entry.quantity,
                        description,
                        "ID: `" + entry.item_id + "`"
                    ].join("\n");
                });

                // Campos de embeds possuem limite de 1024 caracteres.
                // Divide os itens sem cortar suas informações.
                let chunk = "";

                for (const line of lines) {
                    const next = chunk
                        ? chunk + "\n\n" + line
                        : line;

                    if (next.length > 1000 && chunk) {
                        fields.push({
                            name: "📂 " + getCategoryName(key),
                            value: chunk,
                            inline: false
                        });

                        chunk = line;
                    } else {
                        chunk = next;
                    }
                }

                if (chunk) {
                    fields.push({
                        name: "📂 " + getCategoryName(key),
                        value: chunk,
                        inline: false
                    });
                }
            }

            fields.push({
                name: "📊 Estatísticas",
                value:
                    "📦 **Itens diferentes:** " +
                    stats.uniqueItems + "\n" +
                    "🔢 **Quantidade total:** " +
                    stats.totalQuantity + "\n" +
                    "📚 **Itens no catálogo:** " +
                    stats.catalogSize,
                inline: false
            });

            return embedResponse(
                createEmbed({
                    title: "🎒 Helena Inventário",

                    description:
                        "👤 **Jogador:** " + username + "\n" +
                        "📂 **Categoria:** " + categoryLabel + "\n\n" +
                        "Seus itens estão organizados abaixo.",

                    color: HELENA_COLORS.inventory,

                    fields,

                    footer:
                        "Helena • Use /inventario categoria para filtrar."
                })
            );

        } catch (error) {
            console.error("[INVENTARIO]", error);

            return errorEmbed(
                "Não foi possível consultar seu inventário."
            );
        }
    }
};