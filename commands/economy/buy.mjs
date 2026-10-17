
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
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

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
                createEmbed({
                    title: "🛒 Compra realizada!",

                    description:
                        "Seu pedido foi concluído com sucesso.\n\n" +
                        result.item.emoji +
                        " **" +
                        result.item.name +
                        "** foi adicionado ao seu inventário.",

                    color: HELENA_COLORS.success,

                    fields: [
                        {
                            name: "📦 Quantidade comprada",
                            value: String(result.quantity),
                            inline: true
                        },
                        {
                            name: "💰 Valor pago",
                            value: "**" +
                                formatMoney(result.total) +
                                "**",
                            inline: true
                        },
                        ...(result.market ? [{
                            name: "📈 Mercado",
                            value:
                                formatMoney(result.unitPrice) +
                                " cada • " +
                                marketLine(result.market),
                            inline: false
                        }] : []),
                        {
                            name: "👛 Carteira restante",
                            value: "**" +
                                formatMoney(result.wallet) +
                                "**",
                            inline: false
                        },
                        {
                            name: "🎒 Total deste item",
                            value:
                                result.inventoryQuantity +
                                " unidade(s)",
                            inline: true
                        },
                        {
                            name: "🆔 ID do item",
                            value: "`" + result.item.id + "`",
                            inline: true
                        }
                    ],

                    footer:
                        "Helena • Obrigado pela sua compra!"
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