
import { formatMoney } from "../../database/economy.mjs";

import { MARKET_CONFIG } from "../../config/market.mjs";

import {
    sellableItems,
    buyPriceOf,
    sellPriceOf,
    hotItem,
    isHot,
    formatPercent
} from "../economy/market.mjs";

import {
    createEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

import { receipt } from "../../utils/receipt.mjs";

import { formatDuration } from "../../utils/time.mjs";

import {
    container,
    divider,
    subtext,
    text
} from "../../utils/components-v2.mjs";

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

// Uma lista com um item por linha, como a da Alfacusa: o emoji, o nome e os preços de compra e de
// venda de agora. O ▲ marca o item em alta.
function priceTable(market) {
    const items = sellableItems();

    if (!items.length) {
        return "Nada para vender.";
    }

    return items
        .map(item =>
            `${item.emoji} **${item.name}**${isHot(item, market) ? " ▲" : ""} · ` +
            `compra ${formatMoney(buyPriceOf(item, market))} · ` +
            `venda ${formatMoney(sellPriceOf(item, market))}`
        )
        .join("\n");
}

const TREND_WORD = { up: "subiu", down: "caiu", flat: "igual" };

export function buildMarketView({ ownerId, market }) {
    // Bolsa desligada: os preços da loja ficam na tabela.
    if (!market) {
        return {
            embed: createEmbed({
                section: "Bolsa",
                title: "📊 Bolsa desligada",

                description:
                    "Os preços da loja ficam sempre no valor de tabela.",

                color: HELENA_COLORS.wait,
                mood: "dormindo",

                footer: "A loja continua aberta"
            }),

            components: [row(
                button(`loja:home:${ownerId}`, "Abrir a loja", "🛒", "primary"),
                button(`bolsa:fechar:${ownerId}`, "Fechar", "✖️", "danger")
            )]
        };
    }

    const hot = hotItem(market);

    const indexRows = [
        ["Índice", `${market.index} de ${MARKET_CONFIG.indexMax} (${market.band.label})`],
        ["Preços", `${formatPercent(market.priceBp)} da tabela`],
        ...(market.trend ? [["Tendência", `${TREND_WORD[market.trend]} (era ${market.previousIndex})`]] : []),
        ["Atualiza em", formatDuration(market.remaining)]
    ];

    const hotLines = hot
        ? [
            `${hot.emoji} **${hot.name}** paga ` +
            `**+${formatPercent(market.hotBonusBp)}** na venda.`,

            `Agora: ${formatMoney(sellPriceOf(hot, market))} ` +
            `(tabela ${formatMoney(hot.sellPrice)}).`
        ]
        : ["Nenhum item em alta agora."];

    const rules =
        "Índice baixo deixa a loja mais barata, índice alto paga melhor na venda. " +
        `O preço vai de ${formatPercent(MARKET_CONFIG.minPriceBp)} a ` +
        `${formatPercent(MARKET_CONFIG.maxPriceBp)} da tabela, e o item em alta soma o bônus só na venda. ` +
        "Cada servidor tem o seu mercado.";

    const embed = createEmbed({
        section: "Bolsa",
        title: `${market.band.emoji} Bolsa do servidor`,

        description:
            "O índice muda a cada " + `${minutes} minutos e mexe nos preços da loja.\n` +
            receipt(indexRows),

        color: HELENA_COLORS.economy,
        mood: "dinheiro",

        fields: [
            {
                name: "🔥 Item em alta",
                value: hotLines.join("\n"),
                inline: false
            },
            {
                name: "🛒 Preços de agora (▲ em alta)",
                value: priceTable(market),
                inline: false
            },
            {
                name: "💡 Como funciona",
                value: rules,
                inline: false
            }
        ],

        footer: `Atualiza a cada ${minutes} minutos`
    });

    // O V2: o índice em destaque, o item em alta e a tabela de preços, com a explicação em letra
    // pequena no fim.
    const layout = [
        container([
            text("-# HELENA · BOLSA"),

            text(`## ${market.band.emoji} Bolsa do servidor`),

            text(`O índice muda a cada ${minutes} minutos e mexe nos preços da loja.`),

            divider(),

            text(receipt(indexRows)),

            text(`### 🔥 Item em alta\n${hotLines.join("\n")}`),

            divider(),

            text(`### 🛒 Preços de agora (▲ em alta)\n${priceTable(market)}`),

            divider(),

            subtext(`💡 ${rules}`),

            buttons(ownerId)
        ], { color: HELENA_COLORS.economy })
    ];

    return {
        embed,
        components: [buttons(ownerId)],
        layout
    };
}

// ==========================================
// BOLSA FECHADA
// ==========================================

export function buildMarketClosed() {
    return {
        embed: createEmbed({
            section: "Bolsa",
            title: "📊 Bolsa fechada",
            description: "Use `/bolsa` para abrir de novo.",
            color: HELENA_COLORS.wait,
            mood: "dormindo",
            footer: "Até a próxima oscilação"
        }),

        components: []
    };
}
