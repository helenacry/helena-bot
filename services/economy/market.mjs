
import { db } from "../../database/connection.mjs";

import { ITEMS, getItem } from "../../config/items.mjs";

import { MARKET_CONFIG } from "../../config/market.mjs";

// ==========================================
// BOLSA: ÍNDICE, ITEM EM ALTA E PREÇOS
// ==========================================

// Cada servidor tem o próprio mercado. Ninguém precisa "ligar" nada: o
// primeiro preço consultado depois do prazo sorteia o índice novo (uma compra,
// uma venda ou o /bolsa), e o prazo seguinte conta a partir daí. Se o bot
// ficar desligado, o sorteio simplesmente acontece na primeira consulta.
//
//   preço de compra = tabela x preço do índice
//   preço de venda  = tabela x preço do índice x (1 + bônus do item em alta)
//
// Sem mercado (HELENA_MARKET=off), todos os preços ficam na tabela.

const nowSeconds = () => Math.floor(Date.now() / 1000);

// Os testes trocam o sorteio por valores combinados.
let random = Math.random;

export function setMarketRandom(fn) {
    random = fn ?? Math.random;
}

// Sorteio de 0 (incluído) a 1 (excluído), mesmo que a fonte erre.
const roll = () => Math.min(0.999999999, Math.max(0, Number(random()) || 0));

const BP = 10_000;

// ==========================================
// LIGADO OU DESLIGADO
// ==========================================

export function marketEnabled(env = process.env) {
    const value = String(env.HELENA_MARKET ?? "on").trim().toLowerCase();

    return !["off", "0", "false", "no"].includes(value);
}

// ==========================================
// ÍNDICE
// ==========================================

// Preço do índice, em pontos-base (10000 = tabela): reta de 90% a 110%.
export function priceBp(index) {
    const { indexMax, minPriceBp, maxPriceBp } = MARKET_CONFIG;

    const clamped = Math.min(indexMax, Math.max(0, Math.trunc(Number(index)) || 0));

    return Math.round(minPriceBp + clamped * (maxPriceBp - minPriceBp) / indexMax);
}

export function bandOf(index) {
    const { bands } = MARKET_CONFIG;

    return bands.find(band => index <= band.max) ?? bands[bands.length - 1];
}

// Itens que podem ser o "em alta": os que dá para vender.
export function sellableItems() {
    return ITEMS.filter(item =>
        item.sellable &&
        Number.isSafeInteger(item.sellPrice) &&
        item.sellPrice > 0
    );
}

// ==========================================
// SORTEIO
// ==========================================

function draw(previous, now) {
    const { indexMax, hotBonusMinBp, hotBonusMaxBp } = MARKET_CONFIG;

    const index = Math.floor(roll() * (indexMax + 1));

    const candidates = sellableItems();

    const hot = candidates.length > 0
        ? candidates[Math.floor(roll() * candidates.length)]
        : null;

    const bonus = hotBonusMinBp +
        Math.floor(roll() * (hotBonusMaxBp - hotBonusMinBp + 1));

    return {
        idx: index,
        previous_idx: previous ? previous.idx : null,
        hot_item: hot ? hot.id : null,
        hot_bonus: hot ? bonus : 0,
        drawn_at: now
    };
}

function snapshot(row, now) {
    const nextAt = row.drawn_at + MARKET_CONFIG.intervalSeconds;

    const previous = row.previous_idx;

    return {
        index: row.idx,
        previousIndex: previous,

        // Compara só com o índice anterior; não adivinha o próximo.
        trend: previous === null || previous === undefined
            ? null
            : row.idx > previous ? "up" : row.idx < previous ? "down" : "flat",

        band: bandOf(row.idx),
        priceBp: priceBp(row.idx),

        hotItemId: row.hot_item,
        hotBonusBp: row.hot_bonus,

        drawnAt: row.drawn_at,
        nextAt,
        remaining: Math.max(0, nextAt - now)
    };
}

// O mercado do servidor agora, sorteando um índice novo se o prazo acabou.
// Devolve null com a bolsa desligada.
export function getMarket(guildId, now = nowSeconds()) {
    if (!marketEnabled()) {
        return null;
    }

    const id = String(guildId ?? "");

    if (!id) {
        return null;
    }

    const row = db
        .prepare("SELECT * FROM market_state WHERE guild_id = ?")
        .get(id);

    if (row && now < row.drawn_at + MARKET_CONFIG.intervalSeconds) {
        return snapshot(row, now);
    }

    const next = draw(row, now);

    db.prepare(`
        INSERT INTO market_state (
            guild_id, idx, previous_idx, hot_item, hot_bonus, drawn_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(guild_id) DO UPDATE SET
            idx = excluded.idx,
            previous_idx = excluded.previous_idx,
            hot_item = excluded.hot_item,
            hot_bonus = excluded.hot_bonus,
            drawn_at = excluded.drawn_at
    `).run(
        id,
        next.idx,
        next.previous_idx,
        next.hot_item,
        next.hot_bonus,
        next.drawn_at
    );

    return snapshot(next, now);
}

// ==========================================
// PREÇOS
// ==========================================

const valid = price => Number.isSafeInteger(price) && price > 0;

export function buyPriceOf(item, market) {
    if (!market || !valid(item.buyPrice)) {
        return item.buyPrice;
    }

    return Math.max(1, Math.round(item.buyPrice * market.priceBp / BP));
}

export function sellPriceOf(item, market) {
    if (!market || !item.sellable || !valid(item.sellPrice)) {
        return item.sellPrice;
    }

    const bonus = isHot(item, market) ? market.hotBonusBp : 0;

    // Tudo em inteiros: preço x pontos-base do índice x pontos-base do bônus.
    return Math.max(
        1,
        Math.round(item.sellPrice * market.priceBp * (BP + bonus) / (BP * BP))
    );
}

export const isHot = (item, market) =>
    Boolean(market) &&
    Boolean(market.hotItemId) &&
    market.hotItemId === item.id &&
    Boolean(item.sellable);

// O item em alta agora (ou null).
export function hotItem(market) {
    return market?.hotItemId ? getItem(market.hotItemId) ?? null : null;
}

// Uma cópia do item com os preços de agora, para as telas e as contas
// usarem os campos de sempre (buyPrice e sellPrice). Guarda a tabela em
// `table` e se o item está em alta em `hot`.
export function priceItem(item, market) {
    return {
        ...item,
        buyPrice: buyPriceOf(item, market),
        sellPrice: sellPriceOf(item, market),
        table: { buyPrice: item.buyPrice, sellPrice: item.sellPrice },
        hot: isHot(item, market)
    };
}

// "103,7%": o preço do índice como porcentagem da tabela.
export const formatPercent = bp =>
    `${(bp / 100).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    })}%`;

const TREND = {
    up: "⬆️ subiu",
    down: "⬇️ caiu",
    flat: "➡️ ficou igual"
};

// "📈 Índice 62 (Alto) • preços em 103,7% da tabela": a linha curta do
// mercado, usada na loja e nos comprovantes.
export function marketLine(market) {
    return (
        `${market.band.emoji} Índice **${market.index}** (${market.band.label}) • ` +
        `preços em **${formatPercent(market.priceBp)}** da tabela`
    );
}

// "⬆️ subiu desde o último sorteio (de 40)", ou "" no primeiro sorteio.
export function trendText(market) {
    if (!market.trend) {
        return "";
    }

    return `${TREND[market.trend]} desde o último sorteio (era ${market.previousIndex})`;
}
