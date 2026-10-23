
import {
    ITEMS
} from "../../config/items.mjs";

import {
    formatMoney
} from "../../database/economy.mjs";

import {
    buyItem
} from "../../services/economy/shop.mjs";

import {
    marketLine
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
    name: "comprar",
    description: "Compre itens utilizando sua carteira",

    options: [
        {
            name: "item",
            description: "Item que deseja comprar",
            type: "string",
            required: true,
            choices: ITEMS
                .filter(item =>
                    Number.isSafeInteger(item.buyPrice) &&
                    item.buyPrice > 0
                )
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

            const result = buyItem(
                guildId,
                userId,
                itemId,
                quantity
            );

            return embedResponse(
                ledgerEmbed({
                    section: "Loja",
                    title: "🛒 Compra feita",

                    say:
                        result.item.emoji + " **" + result.item.name +
                        "** já está no seu inventário.",

                    rows: [
                        ["Quantidade", String(result.quantity)],
                        ...(result.quantity > 1 ? [["Preço unitário", formatMoney(result.unitPrice)]] : []),
                        ["Pagou", signed(-result.total, formatMoney(result.total))],
                        null,
                        ["Carteira", formatMoney(result.wallet)],
                        ["Você tem", plural(result.inventoryQuantity, "unidade")]
                    ],

                    note: result.market ? marketLine(result.market) : "",

                    color: HELENA_COLORS.economy,
                    mood: "dinheiro",

                    footer: "Use /usaritem para usar o que comprou"
                })
            );

        } catch (error) {
            console.error("[COMPRAR]", error);

            return errorEmbed(
                error.message ||
                "Não foi possível realizar sua compra."
            );
        }
    }
};