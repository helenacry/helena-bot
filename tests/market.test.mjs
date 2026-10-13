import { db, getPlayer, set, get } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// A bolsa (services/market.mjs): índice do servidor, item em alta e preços.
// tests/helpers.mjs deixa a bolsa desligada para os outros testes valerem o
// preço de tabela; aqui ela liga e o sorteio é controlado.
process.env.HELENA_MARKET = "on";

const { MARKET_CONFIG } = await import("../config/market.mjs");
const { PRISON_BLOCKED_COMMANDS } = await import("../config/crime.mjs");
const { getItem } = await import("../config/items.mjs");
const { formatMoney } = await import("../database/economy.mjs");

const {
    getMarket, setMarketRandom, marketEnabled, priceBp, bandOf,
    buyPriceOf, sellPriceOf, isHot, sellableItems, priceItem
} = await import("../services/market.mjs");

const { buyItem, sellItem } = await import("../services/shop.mjs");
const { addItem } = await import("../services/inventory.mjs");
const { tx } = await import("../services/combat.mjs");
const { buildShopView, buildShopHome, shopContext } = await import("../services/shop-view.mjs");
const { buildInventoryView } = await import("../services/inventory-view.mjs");
const { handlePanelClick, handleModalSubmit } = await import("../services/panels.mjs");
const { carregarComandos, resolverComando } = await import("../command-registry.mjs");

const silently = async fn => {
    const log = console.log;
    const error = console.error;
    console.log = () => {};
    console.error = () => {};

    try { return await fn(); } finally { console.log = log; console.error = error; }
};

const comandos = await silently(() => carregarComandos());

const ME = "111111111111111111";
const OTHER = "222222222222222222";
const T0 = 1_800_000_000;
const HALF_HOUR = MARKET_CONFIG.intervalSeconds;

// ==========================================
// FERRAMENTAS
// ==========================================

let counter = 0;

const guild = () => `g-mkt-${++counter}`;

const sellable = sellableItems();

// Sorteio combinado: cada sorteio gasta 3 números (índice, item em alta, bônus).
function fixedDraw({ index, hot = "apple", bonus = 1250 }) {
    const hotIndex = sellable.findIndex(item => item.id === hot);

    assert.ok(hotIndex >= 0, `${hot} é vendável`);

    const range = MARKET_CONFIG.hotBonusMaxBp - MARKET_CONFIG.hotBonusMinBp + 1;

    const values = [
        (index + 0.5) / (MARKET_CONFIG.indexMax + 1),
        (hotIndex + 0.5) / sellable.length,
        (bonus - MARKET_CONFIG.hotBonusMinBp + 0.5) / range
    ];

    let next = 0;

    setMarketRandom(() => values[next++ % 3]);
}

// Gerador com semente: o teste de distribuição sempre dá o mesmo resultado.
function seeded(seed) {
    let a = seed;

    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;

        let t = Math.imul(a ^ (a >>> 15), 1 | a);

        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function seedPlayer(guildId, money) {
    getPlayer(guildId, ME);

    set("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?", money, guildId, ME);
}

const wallet = guildId =>
    get("SELECT wallet w FROM players WHERE guild_id = ? AND user_id = ?", guildId, ME).w;

const owned = (guildId, itemId) =>
    get("SELECT quantity q FROM inventory WHERE guild_id = ? AND user_id = ? AND item_id = ?", guildId, ME, itemId)?.q ?? 0;

const giveItem = (guildId, itemId, quantity) => tx(() => addItem(guildId, ME, itemId, quantity));

const user = id => ({ id, username: "eu", displayName: "Eu Mesmo" });

let sequence = 0;

const click = (guildId, customId, userId = ME) => ({
    id: "c" + (++sequence), guildId, channelId: "c1",
    user: user(userId), data: { customId }
});

const submit = (guildId, customId, fields, userId = ME) => ({
    id: "s" + (++sequence), guildId, channelId: "c1", user: user(userId),
    data: {
        customId,
        fields: Object.entries(fields).map(([id, value]) => ({ customId: id, value }))
    }
});

const slash = (guildId, userId = ME) => ({
    id: "i" + (++sequence), guildId, channelId: "c1",
    user: user(userId), data: { options: {} }
});

const textOf = response => JSON.stringify(response.data);
const embedOf = response => response.data.embeds[0];
const idsOf = components => components.flatMap(r => r.components).map(c => c.customId);

// ==========================================
// REGRAS DO ÍNDICE
// ==========================================

test("a configuração fecha: índice de 0 a 90, o 45 é a tabela, 9 pontos mexem 2%", () => {
    assert.equal(HALF_HOUR, 30 * 60);
    assert.equal(MARKET_CONFIG.indexMax, 90);

    assert.equal(priceBp(0), 9000, "índice 0 = 90% da tabela");
    assert.equal(priceBp(45), 10000, "índice 45 = tabela");
    assert.equal(priceBp(90), 11000, "índice 90 = 110% da tabela");
    assert.equal(priceBp(9) - priceBp(0), 200, "cada 9 pontos mexem 2%");

    // limites das faixas (a reta passa por 96,4%, 96,7%, 103,3% e 103,6%)
    assert.deepEqual([29, 30, 60, 61].map(priceBp), [9644, 9667, 10333, 10356]);

    // fora do intervalo, o preço trava no limite
    assert.equal(priceBp(-5), 9000);
    assert.equal(priceBp(500), 11000);
    assert.equal(priceBp("abc"), 9000);

    for (let index = 1; index <= 90; index++) {
        assert.ok(priceBp(index) >= priceBp(index - 1), `o preço não cai do ${index - 1} para o ${index}`);
    }
});

test("as faixas cobrem todo o índice, sem buraco", () => {
    assert.deepEqual([0, 29].map(i => bandOf(i).id), ["low", "low"]);
    assert.deepEqual([30, 60].map(i => bandOf(i).id), ["medium", "medium"]);
    assert.deepEqual([61, 90].map(i => bandOf(i).id), ["high", "high"]);

    for (let index = 0; index <= 90; index++) {
        assert.ok(bandOf(index)?.label, `índice ${index} tem faixa`);
    }
});

test("o sorteio vai de 0 a 90, cada faixa sai cerca de 1 vez em 3 e o item em alta sempre é vendável", () => {
    setMarketRandom(seeded(7));

    const draws = 3000;
    const bands = { low: 0, medium: 0, high: 0 };
    const hot = new Set();

    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < draws; i++) {
        const market = getMarket(`g-draw-${i}`, T0);

        bands[market.band.id]++;
        hot.add(market.hotItemId);

        min = Math.min(min, market.index);
        max = Math.max(max, market.index);

        assert.ok(sellable.some(item => item.id === market.hotItemId), "o em alta pode ser vendido");
        assert.ok(market.hotBonusBp >= MARKET_CONFIG.hotBonusMinBp && market.hotBonusBp <= MARKET_CONFIG.hotBonusMaxBp);
    }

    assert.equal(min, 0);
    assert.equal(max, 90);

    for (const [band, count] of Object.entries(bands)) {
        assert.ok(count / draws > 0.29 && count / draws < 0.38, `faixa ${band}: ${count} de ${draws}`);
    }

    assert.deepEqual([...hot].sort(), sellable.map(item => item.id).sort(), "todo item vendável já foi o em alta");
});

// ==========================================
// SORTEIO E PRAZO
// ==========================================

test("o primeiro preço consultado sorteia, e o índice vale por 30 minutos", () => {
    const g = guild();

    let rolls = 0;

    setMarketRandom(() => { rolls++; return 0.5; });

    const first = getMarket(g, T0);

    assert.equal(rolls, 3, "índice, item em alta e bônus");
    assert.equal(first.index, 45);
    assert.equal(first.trend, null, "no primeiro sorteio não há com o que comparar");
    assert.equal(first.previousIndex, null);
    assert.equal(first.drawnAt, T0);
    assert.equal(first.nextAt, T0 + HALF_HOUR);
    assert.equal(first.remaining, HALF_HOUR);

    const again = getMarket(g, T0 + HALF_HOUR - 1);

    assert.equal(rolls, 3, "dentro do prazo não sorteia de novo");
    assert.equal(again.index, 45);
    assert.equal(again.remaining, 1);

    getMarket(g, T0 + HALF_HOUR);

    assert.equal(rolls, 6, "no prazo exato sorteia");

    const row = get("SELECT * FROM market_state WHERE guild_id = ?", g);

    assert.equal(row.idx, 45);
    assert.equal(row.drawn_at, T0 + HALF_HOUR);
});

test("a tendência compara só com o sorteio anterior, e o prazo novo conta do sorteio", () => {
    const g = guild();

    fixedDraw({ index: 40 });
    assert.equal(getMarket(g, T0).trend, null);

    fixedDraw({ index: 60 });

    const up = getMarket(g, T0 + HALF_HOUR);

    assert.deepEqual([up.index, up.previousIndex, up.trend], [60, 40, "up"]);

    fixedDraw({ index: 10 });
    assert.equal(getMarket(g, T0 + HALF_HOUR + 1700).index, 60, "ainda dentro do prazo do sorteio de 60");

    fixedDraw({ index: 60 });

    const flat = getMarket(g, T0 + 2 * HALF_HOUR);

    assert.deepEqual([flat.index, flat.trend], [60, "flat"]);

    fixedDraw({ index: 10 });

    const down = getMarket(g, T0 + 3 * HALF_HOUR);

    assert.deepEqual([down.index, down.previousIndex, down.trend], [10, 60, "down"]);
});

test("se ninguém olhar por horas, o sorteio acontece na primeira consulta e o prazo conta dali", () => {
    const g = guild();

    fixedDraw({ index: 20 });
    getMarket(g, T0);

    fixedDraw({ index: 80 });

    const late = getMarket(g, T0 + 10_000);

    assert.equal(late.index, 80, "um sorteio só, não um por meia hora perdida");
    assert.equal(late.drawnAt, T0 + 10_000);
    assert.equal(late.nextAt, T0 + 10_000 + HALF_HOUR);
});

test("cada servidor tem o seu mercado", () => {
    const [a, b] = [guild(), guild()];

    fixedDraw({ index: 5, hot: "apple" });
    getMarket(a, T0);

    fixedDraw({ index: 85, hot: "backpack" });
    getMarket(b, T0);

    assert.equal(getMarket(a, T0 + 1).index, 5);
    assert.equal(getMarket(a, T0 + 1).hotItemId, "apple");
    assert.equal(getMarket(b, T0 + 1).index, 85);
    assert.equal(getMarket(b, T0 + 1).hotItemId, "backpack");
});

test("HELENA_MARKET desliga a bolsa: sem mercado, sem sorteio, sem linha no banco", () => {
    for (const value of ["off", "OFF", "0", "false", "no"]) {
        assert.equal(marketEnabled({ HELENA_MARKET: value }), false, value);
    }

    for (const value of [undefined, "", "on", "1", "true"]) {
        assert.equal(marketEnabled({ HELENA_MARKET: value }), true, String(value));
    }

    const g = guild();

    process.env.HELENA_MARKET = "off";

    try {
        assert.equal(getMarket(g, T0), null);
        assert.equal(get("SELECT COUNT(*) c FROM market_state WHERE guild_id = ?", g).c, 0);
    } finally {
        process.env.HELENA_MARKET = "on";
    }

    assert.equal(getMarket(""), null, "sem servidor não há mercado");
});

// ==========================================
// PREÇOS
// ==========================================

const marketAt = (index, hotItemId = null, hotBonusBp = 0) =>
    ({ priceBp: priceBp(index), hotItemId, hotBonusBp });

test("preço de compra: a tabela vezes o preço do índice, arredondado", () => {
    const apple = getItem("apple");

    assert.deepEqual([0, 45, 90].map(i => buyPriceOf(apple, marketAt(i))), [270, 300, 330]);

    // 3500 x 96,44% = 3375,4
    assert.equal(buyPriceOf(getItem("pocket_knife"), marketAt(29)), 3375);

    assert.equal(buyPriceOf(apple, null), 300, "sem mercado vale a tabela");
    assert.equal(buyPriceOf(getItem("worker_medal"), marketAt(0)), null, "o que não está à venda continua assim");
});

test("preço de venda: o índice vale para todos e o item em alta soma o bônus", () => {
    const apple = getItem("apple");
    const coffee = getItem("coffee");

    // índice 90 (110%) com o bônus máximo (24,5%) na maçã: 150 x 1,1 x 1,245 = 205,4
    const high = marketAt(90, "apple", 2450);

    assert.equal(sellPriceOf(apple, high), 205);
    assert.equal(sellPriceOf(coffee, high), 385, "o café não está em alta: só o índice (350 x 1,1)");

    // índice 45 (tabela) com 12,5%: 150 x 1,125 = 168,75
    assert.equal(sellPriceOf(apple, marketAt(45, "apple", 1250)), 169);
    assert.equal(sellPriceOf(coffee, marketAt(45, "apple", 1250)), 350);

    assert.equal(sellPriceOf(apple, null), 150);

    assert.equal(sellPriceOf(getItem("revolver"), high), 0, "o que não vende continua sem preço");
    assert.equal(isHot(getItem("revolver"), marketAt(90, "revolver", 2450)), false, "item que não vende nunca fica em alta");
    assert.equal(isHot(apple, high), true);
    assert.equal(isHot(coffee, high), false);
});

test("priceItem devolve o item com os preços de agora e guarda a tabela", () => {
    const priced = priceItem(getItem("coffee"), marketAt(90, "coffee", 2450));

    assert.equal(priced.id, "coffee");
    assert.equal(priced.buyPrice, 770);
    assert.equal(priced.sellPrice, 479);
    assert.deepEqual(priced.table, { buyPrice: 700, sellPrice: 350 });
    assert.equal(priced.hot, true);

    assert.equal(getItem("coffee").buyPrice, 700, "a tabela em config/items.mjs não muda");
});

test("a bolsa não abre lucro: comprar no mais barato e vender no mais caro, com o bônus máximo, ainda perde", () => {
    const best = marketAt(90, null, MARKET_CONFIG.hotBonusMaxBp);
    const cheapest = marketAt(0);

    for (const item of sellable) {
        const sale = sellPriceOf(item, { ...best, hotItemId: item.id });

        assert.ok(sale < buyPriceOf(item, cheapest), `${item.id}: vende por ${sale} e compra por ${buyPriceOf(item, cheapest)}`);
    }
});

// ==========================================
// COMPRA E VENDA
// ==========================================

test("comprar usa o preço do mercado do servidor", () => {
    const g = guild();

    fixedDraw({ index: 0 });
    seedPlayer(g, 10_000);

    const result = buyItem(g, ME, "apple", 3, { now: T0 });

    assert.equal(result.unitPrice, 270);
    assert.equal(result.total, 810);
    assert.equal(result.market.index, 0);
    assert.equal(result.wallet, 10_000 - 810);
    assert.equal(wallet(g), 10_000 - 810);
    assert.equal(owned(g, "apple"), 3);

    const log = get("SELECT type, amount FROM transactions WHERE guild_id = ?", g);

    assert.deepEqual({ ...log }, { type: "shop_buy", amount: 810 });
});

test("o preço que vale é o da hora de confirmar, não o da tela", () => {
    const g = guild();

    fixedDraw({ index: 0 });
    seedPlayer(g, 330);

    // a tela mostrou R$ 2,70 (índice 0) ...
    assert.equal(getMarket(g, T0).priceBp, 9000);

    // ... mas o mercado virou antes de confirmar
    fixedDraw({ index: 90 });

    const result = buyItem(g, ME, "apple", 1, { now: T0 + HALF_HOUR });

    assert.equal(result.unitPrice, 330);
    assert.equal(wallet(g), 0);

    // e uma carteira que cobria o preço baixo não cobre o alto
    seedPlayer(g, 300);

    assert.throws(
        () => buyItem(g, ME, "apple", 1, { now: T0 + HALF_HOUR + 1 }),
        /não possui dinheiro suficiente/
    );

    assert.equal(wallet(g), 300, "nada foi cobrado");
});

test("vender usa o índice e o bônus do item em alta", () => {
    const g = guild();

    fixedDraw({ index: 90, hot: "apple", bonus: 2450 });
    seedPlayer(g, 0);
    giveItem(g, "apple", 4);
    giveItem(g, "coffee", 2);

    const apples = sellItem(g, ME, "apple", 2, { now: T0 });

    assert.deepEqual(
        [apples.unitPrice, apples.total, apples.hot, apples.market.hotBonusBp],
        [205, 410, true, 2450]
    );

    const coffee = sellItem(g, ME, "coffee", 1, { now: T0 });

    assert.deepEqual([coffee.unitPrice, coffee.total, coffee.hot], [385, 385, false]);

    assert.equal(wallet(g), 410 + 385);
    assert.equal(owned(g, "apple"), 2);
    assert.equal(owned(g, "coffee"), 1);
});

test("com a bolsa desligada tudo vale a tabela e o resultado não traz mercado", () => {
    const g = guild();

    seedPlayer(g, 10_000);

    process.env.HELENA_MARKET = "off";

    try {
        const bought = buyItem(g, ME, "apple", 2);

        assert.deepEqual([bought.unitPrice, bought.total, bought.market], [300, 600, null]);

        const sold = sellItem(g, ME, "apple", 1);

        assert.deepEqual([sold.unitPrice, sold.hot, sold.market], [150, false, null]);

        assert.equal(get("SELECT COUNT(*) c FROM market_state WHERE guild_id = ?", g).c, 0);
    } finally {
        process.env.HELENA_MARKET = "on";
    }
});

// ==========================================
// LOJA E INVENTÁRIO
// ==========================================

test("a loja mostra o mercado e os preços de agora, e os botões verdes usam o preço novo", () => {
    const g = guild();

    fixedDraw({ index: 90, hot: "coffee", bonus: 1250 });
    seedPlayer(g, 300);   // cobre a maçã na tabela (R$ 3,00), mas não a R$ 3,30

    const poor = buildShopView({ ownerId: ME, category: "consumable", ...shopContext(g, ME) });

    assert.match(poor.embed.description, /Índice \*\*90\*\* \(Alto\)/);
    assert.match(poor.embed.description, /110,0%/);

    const appleField = poor.embed.fields.find(f => f.name.includes("Maçã"));

    assert.ok(appleField.value.includes(formatMoney(330)), "preço de compra de agora");
    assert.ok(appleField.value.includes("🔒 Faltam"), "não cabe na carteira");

    const coffeeField = poor.embed.fields.find(f => f.name.includes("Café"));

    assert.ok(coffeeField.value.includes("em alta (+12,5%)"), "marca o item em alta na venda");
    assert.ok(coffeeField.value.includes(formatMoney(sellPriceOf(getItem("coffee"), getMarket(g)))), "preço de venda com o bônus");

    const appleButton = poor.components[1].components.find(c => c.customId.endsWith(":apple"));

    assert.equal(appleButton.style, "secondary");

    seedPlayer(g, 330);

    const rich = buildShopView({ ownerId: ME, category: "consumable", ...shopContext(g, ME) });

    assert.equal(rich.components[1].components.find(c => c.customId.endsWith(":apple")).style, "success");
});

test("a vitrine inicial mostra o 'a partir de' com o preço do mercado", () => {
    const g = guild();

    fixedDraw({ index: 0 });

    const { market } = shopContext(g, ME);

    const home = buildShopHome({ ownerId: ME, wallet: 0, gems: 0, market });

    assert.match(home.embed.description, /Índice \*\*0\*\* \(Baixo\)/);

    const consumables = home.embed.fields.find(f => f.name.includes("Consumíveis"));

    assert.ok(consumables.value.includes(formatMoney(270)), "a maçã a R$ 2,70 é o menor preço da prateleira");

    // sem mercado, a vitrine é a de sempre
    const plain = buildShopHome({ ownerId: ME, wallet: 0, gems: 0 });

    assert.doesNotMatch(plain.embed.description, /Índice/);
});

test("o botão de comprar mostra o preço de agora e 'max' conta pelo preço novo", async () => {
    const g = guild();

    fixedDraw({ index: 90 });
    seedPlayer(g, 960);   // na tabela dá para 3 maçãs; a R$ 3,30 só para 2

    const modal = handlePanelClick(click(g, `loja:item:${ME}:apple`));

    assert.ok(textOf(modal).includes(formatMoney(330)), "o formulário cita o preço novo");

    await silently(() => handleModalSubmit(submit(g, "loja:comprar:apple", { quantidade: "max" }), comandos));

    assert.equal(owned(g, "apple"), 2);
    assert.equal(wallet(g), 960 - 2 * 330);
});

test("o inventário mostra o preço de venda de agora e marca o item em alta", () => {
    const g = guild();

    fixedDraw({ index: 90, hot: "apple", bonus: 2450 });
    seedPlayer(g, 0);
    giveItem(g, "apple", 2);
    giveItem(g, "coffee", 1);

    const view = buildInventoryView({ ownerId: ME, guildId: g, userId: ME, username: "Eu" });

    const text = JSON.stringify(view.embed);

    assert.ok(text.includes(formatMoney(205)), "maçã com o bônus");
    assert.ok(text.includes(formatMoney(385)), "café só com o índice");
    assert.equal((text.match(/🔥/g) ?? []).length, 1, "só a maçã está em alta");
});

// ==========================================
// COMANDO /BOLSA
// ==========================================

test("/bolsa mostra o índice, o item em alta e os preços, com os botões do dono", async () => {
    const g = guild();

    fixedDraw({ index: 62, hot: "energy_drink", bonus: 1250 });

    const response = await silently(() => resolverComando(comandos, "bolsa").execute(slash(g)));

    const embed = embedOf(response);

    assert.equal(embed.title, "📊 Helena Bolsa");
    assert.deepEqual(
        embed.fields.map(f => f.name),
        ["📈 Índice do servidor", "🔥 Item em alta", "🛒 Preços de agora", "💡 Como funciona"]
    );

    const [index, hot, prices] = embed.fields.map(f => f.value);

    assert.match(index, /\*\*62\*\* de 90/);
    assert.match(index, /faixa \*\*Alto\*\*/);
    assert.match(index, /Próxima atualização em/);

    assert.match(hot, /Energético/);
    assert.match(hot, /\+12,5%/);

    assert.equal(prices.split("\n").length, sellable.length, "uma linha por item vendável");
    assert.equal((prices.match(/🔥/g) ?? []).length, 1, "o em alta aparece marcado");

    assert.deepEqual(
        idsOf(response.data.components),
        [`loja:home:${ME}`, `bolsa:atualizar:${ME}`, `bolsa:fechar:${ME}`]
    );

    assert.equal(resolverComando(comandos, "mercado")?.name, "bolsa", "alias /mercado");
});

test("/bolsa também abre preso, e a bolsa desligada avisa", async () => {
    assert.equal(PRISON_BLOCKED_COMMANDS.has("bolsa"), false);

    const g = guild();

    process.env.HELENA_MARKET = "off";

    try {
        const response = await silently(() => resolverComando(comandos, "bolsa").execute(slash(g)));

        assert.match(embedOf(response).description, /desligada/);
        assert.deepEqual(idsOf(response.data.components), [`loja:home:${ME}`, `bolsa:fechar:${ME}`]);
    } finally {
        process.env.HELENA_MARKET = "on";
    }
});

test("os botões da bolsa: só o dono atualiza ou fecha, e 'Abrir a loja' leva à vitrine com o mercado", () => {
    const g = guild();

    fixedDraw({ index: 30 });

    const refreshed = handlePanelClick(click(g, `bolsa:atualizar:${ME}`));

    assert.equal(refreshed.type, "update");
    assert.equal(refreshed.data.embeds[0].title, "📊 Helena Bolsa");
    assert.ok(JSON.stringify(refreshed.data.embeds[0]).includes("**30** de 90"));

    const foreign = handlePanelClick(click(g, `bolsa:atualizar:${ME}`, OTHER));

    assert.equal(foreign.data.ephemeral, true);
    assert.match(foreign.data.embeds[0].title, /outra pessoa/);

    const closed = handlePanelClick(click(g, `bolsa:fechar:${ME}`));

    assert.equal(closed.type, "update");
    assert.deepEqual(closed.data.components, []);
    assert.match(closed.data.embeds[0].title, /Bolsa fechada/);

    assert.equal(handlePanelClick(click(g, `bolsa:fechar:${ME}`, OTHER)).data.ephemeral, true);

    const shop = handlePanelClick(click(g, `loja:home:${ME}`));

    assert.match(shop.data.embeds[0].title, /Helena Loja/);
    assert.match(shop.data.embeds[0].description, /Índice \*\*30\*\*/);

    assert.match(handlePanelClick(click(g, `bolsa:abrir:${ME}`)).data.embeds[0].title, /desconhecido/);
});

test("a tabela do banco da bolsa guarda só servidor e números", () => {
    const columns = db.prepare("PRAGMA table_info(market_state)").all().map(c => c.name);

    assert.deepEqual(columns, ["guild_id", "idx", "previous_idx", "hot_item", "hot_bonus", "drawn_at"]);
});
