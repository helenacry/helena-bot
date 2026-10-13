
import { formatMoney } from "../database/economy.mjs";

import { MARKET_CONFIG } from "../config/market.mjs";

import {
    sellableItems,
    buyPriceOf,
    sellPriceOf,
    hotItem,
    isHot,
    marketLine,
    trendText,
    formatPercent
} from "./market.mjs";

import {
    createEmbed,
    HELENA_COLORS
} from "../utils/embed.mjs";

import { formatDuration } from "../utils/time.mjs";

import { button, row } from "./panel-kit.mjs";

// ==========================================
// VISÃO DA BOLSA
// ==========================================

// O painel do /bolsa. Mostra o índice do servidor, o item em alta e os
// preços de agora dos itens que dá para vender. Os botões levam à loja
// (loja:home, em shop-panels.mjs) e atualizam ou fecham este painel.
//
//   bolsa:atualizar:<dono>   mostra de novo, com o mercado de agora
//   bolsa:fechar:<dono>      fecha o painel

const minutes = MARKET_CONFIG.intervalSeconds / 60;

const buttons = ownerId => row(
    button(`loja:home:${ownerId}`, "Abrir a loja", "🛒", "primary"),
    button(`bolsa:atualizar:${ownerId}`, "Atualizar", "🔄", "secondary"),
    button(`bolsa:fechar:${ownerId}`, "Fechar", "✖️", "danger")
);

// Um item por linha: preço de compra e de venda de agora.
function priceLines(market) {
    return sellableItems().map(item => {
        const buy = buyPriceOf(item, market);
        const sell = sellPriceOf(item, market);

        return (
            `${item.emoji} **${item.name}**: compra ${formatMoney(buy)} • ` +
            `venda ${formatMoney(sell)}${isHot(item, market) ? " 🔥" : ""}`
        );
    });
}

export function buildMarketView({ ownerId, market }) {
    // Bolsa desligada: os preços da loja ficam na tabela.
    if (!market) {
        return {
            embed: createEmbed({
                title: "📊 Helena Bolsa",

                description:
                    "A bolsa está desligada. Os preços da loja ficam " +
                    "sempre no valor de tabela.",

                color: HELENA_COLORS.neutral,

                footer: "Helena • Bolsa"
            }),

            components: [row(
                button(`loja:home:${ownerId}`, "Abrir a loja", "🛒", "primary"),
                button(`bolsa:fechar:${ownerId}`, "Fechar", "✖️", "danger")
            )]
        };
    }

    const hot = hotItem(market);

    const trend = trendText(market);

    const indexLines = [
        `${market.band.emoji} **${market.index}** de ${MARKET_CONFIG.indexMax} • ` +
        `faixa **${market.band.label}**`,

        `Preços em **${formatPercent(market.priceBp)}** da tabela`,

        ...(trend ? [trend] : []),

        `⏳ Próxima atualização em **${formatDuration(market.remaining)}**`
    ];

    const hotLines = hot
        ? [
            `${hot.emoji} **${hot.name}** paga ` +
            `**+${formatPercent(market.hotBonusBp)}** na venda.`,

            `Agora: ${formatMoney(sellPriceOf(hot, market))} ` +
            `(tabela ${formatMoney(hot.sellPrice)}).`
        ]
        : ["Nenhum item em alta agora."];

    const embed = createEmbed({
        title: "📊 Helena Bolsa",

        description:
            "O mercado do seu servidor. O índice muda a cada " +
            `${minutes} minutos e mexe nos preços da loja.\n\n` +
            marketLine(market),

        color: HELENA_COLORS.economy,

        fields: [
            {
                name: "📈 Índice do servidor",
                value: indexLines.join("\n"),
                inline: false
            },
            {
                name: "🔥 Item em alta",
                value: hotLines.join("\n"),
                inline: false
            },
            {
                name: "🛒 Preços de agora",
                value: priceLines(market).join("\n") || "Nada para vender.",
                inline: false
            },
            {
                name: "💡 Como funciona",
                value: [
                    "Índice baixo deixa a loja mais barata, índice alto paga melhor na venda.",
                    `O preço vai de ${formatPercent(MARKET_CONFIG.minPriceBp)} a ` +
                    `${formatPercent(MARKET_CONFIG.maxPriceBp)} da tabela, e o item em alta soma o bônus só na venda.`,
                    "Cada servidor tem o seu mercado. O preço que vale é o da hora em que você confirma."
                ].join("\n"),
                inline: false
            }
        ],

        footer: `Helena • Bolsa • atualiza a cada ${minutes} minutos`
    });

    return {
        embed,
        components: [buttons(ownerId)]
    };
}

// ==========================================
// BOLSA FECHADA
// ==========================================

export function buildMarketClosed() {
    return {
        embed: createEmbed({
            title: "📊 Bolsa fechada",
            description: "Use `/bolsa` para abrir de novo.",
            color: HELENA_COLORS.neutral,
            footer: "Helena • Bolsa"
        }),

        components: []
    };
}
