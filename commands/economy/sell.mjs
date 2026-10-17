
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
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

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
                createEmbed({
                    title: "💵 Venda concluída!",

                    description:
                        "Seu item foi vendido com sucesso.\n\n" +
                        result.item.emoji +
                        " **" +
                        result.item.name +
                        "** foi negociado na Helena Loja.",

                    color: HELENA_COLORS.success,

                    fields: [
                        {
                            name: "📦 Quantidade vendida",
                            value: String(result.quantity),
                            inline: true
                        },
                        {
                            name: "💰 Valor recebido",
                            value: "**+" +
                                formatMoney(result.total) +
                                "**",
                            inline: true
                        },
                        ...(result.market ? [{
                            name: "📈 Mercado",
                            value:
                                formatMoney(result.unitPrice) +
                                " cada • " +
                                marketLine(result.market) +
                                (result.hot
                                    ? "\n🔥 **Em alta:** +" +
                                        formatPercent(result.market.hotBonusBp) +
                                        " nesta venda"
                                    : ""),
                            inline: false
                        }] : []),
                        {
                            name: "👛 Carteira atual",
                            value: "**" +
                                formatMoney(result.wallet) +
                                "**",
                            inline: false
                        },
                        {
                            name: "🎒 Unidades restantes",
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
                        "Helena • Obrigado por negociar conosco!"
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