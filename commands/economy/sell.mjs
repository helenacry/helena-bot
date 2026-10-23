
import {
    ITEMS
} from "../../config/items.mjs";

import {
    formatMoney
} from "../../database/economy.mjs";

import {
    sellItem
} from "../../services/economy/shop.mjs";

import {
    marketLine,
    formatPercent
} from "../../services/economy/market.mjs";

import {
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { plural } from "../../utils/plural.mjs";

import { signed } from "../../utils/receipt.mjs";

export default {
    name: "vender",
    description: "Venda itens do seu inventário",

    options: [
        {
            name: "item",
            description: "Item que deseja vender",
            type: "string",
            required: true,
            choices: ITEMS
                .filter(item => item.sellable)
                .map(item => ({
                    name: item.name,
                    value: item.id
                }))
        },
        {
            name: "quantidade",
            description: "Quantidade de unidades (1 a 99)",
            type: "integer",
            required: false
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
            const options = interaction.data.options ?? {};

            const itemId = options.item;
            const quantity = options.quantidade ?? 1;

            if (typeof itemId !== "string") {
                return errorEmbed(
                    "Selecione um item válido."
                );
            }

            const result = sellItem(
                guildId,
                userId,
                itemId,
                quantity
            );

            return embedResponse(
                ledgerEmbed({
                    section: "Loja",
                    title: "💵 Venda feita",

                    say:
                        result.item.emoji + " **" + result.item.name + "** foi vendido." +
                        (result.hot
                            ? "\n> 🔥 **Em alta:** +" + formatPercent(result.market.hotBonusBp) + " nesta venda"
                            : ""),

                    rows: [
                        ["Quantidade", String(result.quantity)],
                        ...(result.quantity > 1 ? [["Preço unitário", formatMoney(result.unitPrice)]] : []),
                        ["Recebeu", signed(result.total, formatMoney(result.total))],
                        null,
                        ["Carteira", formatMoney(result.wallet)],
                        ["Ainda tem", plural(result.inventoryQuantity, "unidade")]
                    ],

                    note: result.market ? marketLine(result.market) : "",

                    color: HELENA_COLORS.economy,
                    mood: "dinheiro",

                    footer: "A /bolsa mostra quando os preços sobem"
                })
            );

        } catch (error) {
            console.error("[VENDER]", error);

            return errorEmbed(
                error.message ||
                "Não foi possível concluir sua venda."
            );
        }
    }
};