import { db, getPlayer, set, get, receiptOf } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// Pacotes e caixas (config/boxes.mjs, services/economy/boxes.mjs, boxes-view.mjs) e o comando /abrir.
//
//   PACOTE (fixed)   conteúdo sempre igual, à vista; pode ser vendido na loja.
//   CAIXA (random)   sorteio; nunca se compra. Ainda não abre pelo /abrir (só quando existir de graça).

const { BOXES, BOX_TIERS, BOX_TIER_ORDER, MAX_OPEN_AT_ONCE, OPENABLE_BOXES, getBox } = await import("../config/boxes.mjs");
const { ITEMS, getItem } = await import("../config/items.mjs");
const { PRISON_BLOCKED_COMMANDS } = await import("../config/crime.mjs");
const { formatMoney } = await import("../database/economy.mjs");
const { openBoxes, packRoom, rollPrize, setBoxRandom } = await import("../services/economy/boxes.mjs");
const { openedResponse } = await import("../services/economy/boxes-view.mjs");
const { addItem, getItemQuantity } = await import("../services/economy/inventory.mjs");
const { buyItem } = await import("../services/economy/shop.mjs");
const { useItem } = await import("../services/economy/use-item.mjs");
const { tx } = await import("../services/combat/combat.mjs");
const { GameBlocked } = await import("../utils/game-error.mjs");
const { carregarComandos, resolverComando } = await import("../command-registry.mjs");
const { localizeResponse } = await import("../services/platform/i18n.mjs");

const silently = async fn => {
    const log = console.log;
    const error = console.error;
    console.log = () => {};
    console.error = () => {};

    try { return await fn(); } finally { console.log = log; console.error = error; }
};

const comandos = await silently(() => carregarComandos());

const ME = "111111111111111111";

const MAX_CENTS = 100_000_000_000_000;

let counter = 0;

const guild = () => `g-box-${++counter}`;

const pack = BOXES.supply_pack;

const random = BOXES.mystery_box;

// ==========================================
// FERRAMENTAS
// ==========================================

// Cria a conta num servidor novo e dá n unidades do item.
function setup(boxes = 1, itemId = "supply_pack") {
    const g = guild();

    getPlayer(g, ME);

    if (boxes > 0) {
        tx(() => addItem(g, ME, itemId, boxes));
    }

    return g;
}

const wallet = g => get("SELECT wallet FROM players WHERE guild_id = ? AND user_id = ?", g, ME).wallet;

const ledger = g => db.prepare("SELECT type, amount FROM transactions WHERE guild_id = ? AND user_id = ? ORDER BY id").all(g, ME).map(row => ({ ...row }));

// O número de 0 a 1 que cai no meio da faixa de um prêmio da caixa (a tabela é sorteada por peso acumulado).
function aim(prizeId) {
    const total = random.prizes.reduce((sum, prize) => sum + prize.weight, 0);

    let start = 0;

    for (const prize of random.prizes) {
        if (prize.id === prizeId) {
            return (start + prize.weight / 2) / total;
        }

        start += prize.weight;
    }

    throw new Error(`prêmio ${prizeId} não existe`);
}

// Entrega os números na ordem e, se acabarem, falha (o teste sorteou mais do que devia).
function script(...values) {
    let index = 0;

    return () => {
        if (index >= values.length) {
            throw new Error("o sorteio combinado acabou");
        }

        return values[index++];
    };
}

// dinheiro gasta dois números (o prêmio e o valor); item gasta um
const cash = (id, amount = 0) => [aim(id), amount];

async function blocked(fn) {
    try {
        await fn();
    } catch (error) {
        assert.ok(error instanceof GameBlocked, `esperava GameBlocked e veio: ${error?.stack ?? error}`);

        return error;
    }

    assert.fail("esperava uma recusa");
}

// ==========================================
// AS REGRAS QUE PROTEGEM A HELENA (ECA Digital, art. 20, e os termos do site)
// ==========================================

test("o que se compra nunca sorteia: caixa sorteada não tem preço, pacote à venda é de conteúdo fixo", () => {
    for (const [id, box] of Object.entries(BOXES)) {
        const item = getItem(id);

        assert.ok(item, `${id} existe no catálogo`);
        assert.equal(item.category, "box");

        if (box.kind === "random") {
            assert.equal(item.buyPrice, null, `${id} sorteia: não pode estar à venda`);
            assert.equal(item.sellable, false, `${id} sorteia: não se revende`);

        } else {
            assert.equal(box.kind, "fixed", `${id}: tipo conhecido`);
            assert.equal(box.prizes, undefined, `${id}: pacote não tem tabela de sorteio`);
        }
    }

    // o inverso: tudo o que está à venda na categoria caixa é pacote fixo
    for (const item of ITEMS.filter(entry => entry.category === "box" && entry.buyPrice)) {
        assert.equal(getBox(item.id)?.kind, "fixed", `${item.id} está à venda`);
    }
});

test("a caixa sorteada ainda não abre pelo /abrir: só entra na lista quando existir de graça", () => {
    assert.deepEqual([...OPENABLE_BOXES], ["supply_pack"]);

    for (const id of OPENABLE_BOXES) {
        assert.equal(getBox(id).kind, "fixed", `${id}: o que abre hoje é pacote fixo`);
    }
});

test("o pacote é à vista: a descrição diz o que vem, e custa menos que as peças soltas", () => {
    const item = getItem("supply_pack");

    assert.match(item.description, /3 maçãs, 2 cafés e 1 energético/);

    for (const { item: id, quantity } of pack.contents) {
        assert.ok(getItem(id), `${id} existe`);
        assert.ok(item.description.includes(String(quantity)), `a descrição cita a quantidade de ${id}`);
    }

    const parts = pack.contents.reduce((sum, { item: id, quantity }) => sum + getItem(id).buyPrice * quantity, 0);

    assert.ok(item.buyPrice < parts, "mais barato que comprar solto");
    assert.ok(item.buyPrice >= parts * 0.8, "mas sem exagero (no máximo 20% de desconto)");

    // dá para abrir 25 de uma vez em um inventário vazio, sem perder nada
    for (const { item: id, quantity } of pack.contents) {
        assert.ok(quantity * MAX_OPEN_AT_ONCE <= getItem(id).maxStack, `${id}: 25 pacotes cabem`);
    }
});

// ==========================================
// A TABELA DA CAIXA SORTEADA
// ==========================================

test("a tabela da caixa: prêmios válidos, ids únicos, dinheiro em reais inteiros e itens que existem", () => {
    assert.ok(getBox("mystery_box") === random);
    assert.equal(getBox("apple"), null);

    const ids = random.prizes.map(prize => prize.id);

    assert.equal(new Set(ids).size, ids.length, "ids repetidos");

    for (const prize of random.prizes) {
        assert.ok(BOX_TIER_ORDER.includes(prize.tier), `${prize.id}: faixa ${prize.tier}`);
        assert.ok(Number.isInteger(prize.weight) && prize.weight > 0, `${prize.id}: peso`);

        if (prize.money) {
            const [min, max] = prize.money;

            assert.ok(min % 100 === 0 && max % 100 === 0, `${prize.id}: só reais inteiros`);
            assert.ok(min > 0 && min <= max, `${prize.id}: faixa de valores`);

        } else {
            const item = getItem(prize.item);

            assert.ok(item, `${prize.id}: o item ${prize.item} existe`);
            assert.ok(prize.quantity >= 1 && prize.quantity <= item.maxStack, `${prize.id}: quantidade cabe no item`);
            assert.ok(prize.fallback > 0, `${prize.id}: o dinheiro de quando não cabe`);
        }
    }

    assert.deepEqual(BOX_TIER_ORDER, ["common", "uncommon", "rare", "epic", "legendary"]);

    for (const tier of BOX_TIER_ORDER) {
        assert.ok(BOX_TIERS[tier].label && BOX_TIERS[tier].emoji);
    }

    assert.equal(MAX_OPEN_AT_ONCE, getItem("mystery_box").maxStack, "dá para abrir tudo o que cabe no inventário");
});

test("a economia da caixa: vale em média entre 70% e 90% do valor de referência; as raras são raras", () => {
    const total = random.prizes.reduce((sum, prize) => sum + prize.weight, 0);

    // dinheiro pelo valor médio; item pelo que rende na venda (o troféu, que não se vende, vale 0)
    const value = prize => prize.money
        ? (prize.money[0] + prize.money[1]) / 2
        : prize.quantity * (getItem(prize.item).sellable ? getItem(prize.item).sellPrice : 0);

    const expected = random.prizes.reduce((sum, prize) => sum + prize.weight * value(prize), 0) / total;

    const ratio = expected / random.referenceValue;

    assert.ok(ratio >= 0.70 && ratio <= 0.90, `a caixa vale ${(ratio * 100).toFixed(1)}% do valor de referência`);

    const share = tier => random.prizes.filter(prize => prize.tier === tier).reduce((sum, prize) => sum + prize.weight, 0) / total;

    assert.ok(share("common") >= 0.5, "mais da metade das caixas é comum");
    assert.ok(share("legendary") <= 0.01, "lendária é até 1%");
    assert.ok(share("epic") + share("legendary") <= 0.05, "épica e lendária juntas, até 5%");

    assert.ok(Math.max(...random.prizes.map(value)) <= 30 * random.referenceValue, "o maior prêmio tem teto");
});

test("rollPrize escolhe pela faixa de peso: 0 é o primeiro prêmio, quase 1 é o último, e cada faixa cai no seu", () => {
    assert.equal(rollPrize(random, () => 0).id, random.prizes[0].id);
    assert.equal(rollPrize(random, () => 0.999999).id, random.prizes.at(-1).id);

    for (const prize of random.prizes) {
        assert.equal(rollPrize(random, () => aim(prize.id)).id, prize.id);
    }
});

test("rollPrize em 100 mil sorteios acompanha os pesos da tabela", () => {
    // gerador simples e fixo (mulberry32): o teste dá sempre o mesmo resultado
    let state = 20261112;

    const rng = () => {
        state = (state + 0x6D2B79F5) | 0;

        let t = Math.imul(state ^ (state >>> 15), 1 | state);

        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const rolls = 100_000;

    const count = new Map();

    for (let i = 0; i < rolls; i++) {
        const prize = rollPrize(random, rng);

        count.set(prize.id, (count.get(prize.id) ?? 0) + 1);
    }

    const total = random.prizes.reduce((sum, prize) => sum + prize.weight, 0);

    for (const prize of random.prizes) {
        const seen = (count.get(prize.id) ?? 0) / rolls;

        assert.ok(Math.abs(seen - prize.weight / total) < 0.008, `${prize.id}: saiu ${(seen * 100).toFixed(2)}% e devia ser ${((prize.weight / total) * 100).toFixed(2)}%`);
    }
});

// ==========================================
// ABRIR A CAIXA SORTEADA (o serviço; o comando ainda não a abre)
// ==========================================

const openRandom = (g, quantity, options) => openBoxes(g, ME, "mystery_box", quantity, options);

test("caixa, dinheiro: gasta a caixa, entra na carteira e no extrato (box_open), do mínimo ao máximo", () => {
    const g = setup(2, "mystery_box");

    const before = wallet(g);

    const low = openRandom(g, 1, { random: script(...cash("cash_small", 0)) });

    assert.equal(low.kind, "random");
    assert.equal(low.opened, 1);
    assert.equal(low.remaining, 1);
    assert.equal(low.money, 5000, "o mínimo: R$ 50,00");
    assert.equal(low.lost, 0);
    assert.equal(low.wallet, before + 5000);
    assert.equal(wallet(g), before + 5000);
    assert.equal(getItemQuantity(g, ME, "mystery_box"), 1);

    assert.deepEqual(ledger(g), [{ type: "box_open", amount: 5000 }]);

    const high = openRandom(g, 1, { random: script(...cash("cash_small", 0.999999)) });

    assert.equal(high.money, 8000, "o máximo: R$ 80,00");
    assert.equal(getItemQuantity(g, ME, "mystery_box"), 0, "a caixa acabou");
});

test("caixa: o dinheiro sai sempre em reais inteiros, em qualquer ponto da faixa", () => {
    for (const prize of random.prizes.filter(p => p.money)) {
        const g = setup(25, "mystery_box");

        for (let step = 0; step <= 24; step++) {
            const result = openRandom(g, 1, { random: script(aim(prize.id), step === 24 ? 0.999999 : step / 24) });

            assert.equal(result.money % 100, 0, `${prize.id}: ${result.money}`);
            assert.ok(result.money >= prize.money[0] && result.money <= prize.money[1], `${prize.id}: ${result.money}`);
        }
    }
});

test("caixa, item: entra no inventário, a comida começa a vencer na hora da abertura e a carteira não muda", () => {
    const g = setup(1, "mystery_box");

    const before = wallet(g);

    const result = openRandom(g, 1, { random: script(aim("coffees")), now: 1_800_000_000 });

    assert.equal(result.money, 0);
    assert.equal(wallet(g), before);
    assert.equal(getItemQuantity(g, ME, "coffee"), 2);
    assert.equal(result.prizes[0].items, 2);
    assert.equal(result.prizes[0].converted, 0);
    assert.deepEqual(result.received.map(entry => [entry.item.id, entry.quantity]), [["coffee", 2]]);

    const batch = get("SELECT bought_at, quantity FROM food_batches WHERE guild_id = ? AND user_id = ? AND item_id = 'coffee'", g, ME);

    assert.deepEqual({ ...batch }, { bought_at: 1_800_000_000, quantity: 2 });

    assert.deepEqual(ledger(g), [], "sem dinheiro, sem linha no extrato");
});

test("caixa: item que não cabe (já no máximo) vira o dinheiro de reserva, tudo ou nada", () => {
    const g = setup(2, "mystery_box");

    const max = getItem("coffee").maxStack;

    tx(() => addItem(g, ME, "coffee", max));

    const before = wallet(g);

    const full = openRandom(g, 1, { random: script(aim("coffees")) });

    assert.equal(getItemQuantity(g, ME, "coffee"), max, "nada entrou");
    assert.equal(full.prizes[0].converted, 1);
    assert.equal(full.prizes[0].items, 0);
    assert.equal(full.money, 700, "R$ 7,00 no lugar dos 2 cafés");
    assert.equal(wallet(g), before + 700);

    // faltando espaço para só um dos dois, também não entra pela metade
    tx(() => db.prepare("UPDATE inventory SET quantity = ? WHERE guild_id = ? AND user_id = ? AND item_id = 'coffee'").run(max - 1, g, ME));

    const almost = openRandom(g, 1, { random: script(aim("coffees")) });

    assert.equal(getItemQuantity(g, ME, "coffee"), max - 1);
    assert.equal(almost.prizes[0].converted, 1);
});

test("caixa, troféu da lendária: entra se couber e, se não couber, vira dinheiro (não se vende, não pode sumir)", () => {
    const g = setup(1, "mystery_box");

    const first = openRandom(g, 1, { random: script(aim("worker_medal")) });

    assert.equal(getItemQuantity(g, ME, "worker_medal"), 1);
    assert.equal(first.prizes[0].prize.tier, "legendary");

    const h = setup(1, "mystery_box");

    tx(() => addItem(h, ME, "worker_medal", getItem("worker_medal").maxStack));

    const second = openRandom(h, 1, { random: script(aim("worker_medal")) });

    assert.equal(second.money, 5000);
    assert.equal(getItemQuantity(h, ME, "worker_medal"), getItem("worker_medal").maxStack);
});

test("caixa, várias de uma vez: junta os iguais, ordena da mais rara para a mais comum e faz um extrato só", () => {
    const g = setup(4, "mystery_box");

    const before = wallet(g);

    const result = openRandom(g, 4, {
        random: script(
            ...cash("cash_small", 0),
            aim("coffees"),
            ...cash("cash_jackpot"),
            ...cash("cash_small", 0.999999)
        )
    });

    assert.equal(result.opened, 4);
    assert.equal(result.remaining, 0);

    assert.deepEqual(
        result.prizes.map(entry => [entry.prize.id, entry.count, entry.money, entry.items]),
        [
            ["cash_jackpot", 1, 250_000, 0],
            ["cash_small", 2, 13_000, 0],
            ["coffees", 1, 0, 2]
        ]
    );

    assert.equal(result.money, 263_000);
    assert.equal(wallet(g), before + 263_000);
    assert.deepEqual(ledger(g), [{ type: "box_open", amount: 263_000 }]);
    assert.equal(getItemQuantity(g, ME, "coffee"), 2);
});

test("caixa: se o sorteio falhar no meio, nada muda (caixas, itens e carteira ficam como estavam)", () => {
    const g = setup(3, "mystery_box");

    const before = wallet(g);

    // o 1º prêmio (café) já entrou no inventário; no 2º, depois de escolher o dinheiro, o sorteio estoura
    let calls = 0;

    const failing = () => {
        calls += 1;

        if (calls === 3) {
            throw new Error("o sorteio estourou");
        }

        return calls === 1 ? aim("coffees") : aim("cash_small");
    };

    assert.throws(() => openRandom(g, 3, { random: failing }), /o sorteio estourou/);

    assert.equal(calls, 3, "chegou a sortear até o ponto da falha");
    assert.equal(db.isTransaction, false, "a transação foi desfeita");
    assert.equal(getItemQuantity(g, ME, "mystery_box"), 3);
    assert.equal(getItemQuantity(g, ME, "coffee"), 0);
    assert.equal(wallet(g), before);
    assert.deepEqual(ledger(g), []);
});

test("caixa, carteira no teto: entra só o que cabe, o resto se perde e vem avisado; no teto exato não grava extrato", () => {
    const g = setup(1, "mystery_box");

    set("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?", MAX_CENTS - 1000, g, ME);

    const result = openRandom(g, 1, { random: script(...cash("cash_small", 0)) });

    assert.equal(result.money, 1000);
    assert.equal(result.lost, 4000);
    assert.equal(wallet(g), MAX_CENTS);
    assert.deepEqual(ledger(g), [{ type: "box_open", amount: 1000 }]);

    const h = setup(1, "mystery_box");

    set("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?", MAX_CENTS, h, ME);

    const none = openRandom(h, 1, { random: script(...cash("cash_small", 0)) });

    assert.equal(none.money, 0);
    assert.equal(none.lost, 5000);
    assert.deepEqual(ledger(h), [], "amount > 0 é regra da tabela: sem dinheiro, sem linha");
});

// ==========================================
// ABRIR O PACOTE
// ==========================================

test("pacote: gasta 1, entrega 3 maçãs + 2 cafés + 1 energético, sem sorteio e sem mexer na carteira", () => {
    const g = setup(2);

    const before = wallet(g);

    // sem sorteio nenhum: se o código sortear, o sorteio combinado falha
    const result = openBoxes(g, ME, "supply_pack", 1, { random: script(), now: 1_800_000_000 });

    assert.equal(result.kind, "fixed");
    assert.equal(result.opened, 1);
    assert.equal(result.remaining, 1);
    assert.equal(result.money, 0);
    assert.deepEqual(result.prizes, []);
    assert.deepEqual(result.received.map(entry => [entry.item.id, entry.quantity]), [["apple", 3], ["coffee", 2], ["energy_drink", 1]]);

    assert.equal(getItemQuantity(g, ME, "supply_pack"), 1);
    assert.equal(getItemQuantity(g, ME, "apple"), 3);
    assert.equal(getItemQuantity(g, ME, "coffee"), 2);
    assert.equal(getItemQuantity(g, ME, "energy_drink"), 1);
    assert.equal(wallet(g), before);
    assert.deepEqual(ledger(g), []);

    // a comida começa a vencer na hora da abertura
    const batches = db.prepare("SELECT item_id, bought_at, quantity FROM food_batches WHERE guild_id = ? AND user_id = ? ORDER BY item_id").all(g, ME).map(row => ({ ...row }));

    assert.deepEqual(batches, [
        { item_id: "apple", bought_at: 1_800_000_000, quantity: 3 },
        { item_id: "coffee", bought_at: 1_800_000_000, quantity: 2 }
    ]);
});

test("pacote: várias de uma vez multiplicam o conteúdo, e \"max\" abre todos (até 25)", () => {
    const g = setup(5);

    const result = openBoxes(g, ME, "supply_pack", 3);

    assert.deepEqual(result.received.map(entry => [entry.item.id, entry.quantity]), [["apple", 9], ["coffee", 6], ["energy_drink", 3]]);
    assert.equal(result.remaining, 2);
    assert.equal(getItemQuantity(g, ME, "apple"), 9);

    const all = openBoxes(g, ME, "supply_pack", "max");

    assert.equal(all.opened, 2);
    assert.equal(all.remaining, 0);
    assert.equal(getItemQuantity(g, ME, "apple"), 15);

    const h = setup(MAX_OPEN_AT_ONCE);

    const full = openBoxes(h, ME, "supply_pack", "max");

    assert.equal(full.opened, MAX_OPEN_AT_ONCE);
    assert.equal(getItemQuantity(h, ME, "apple"), 75);
    assert.equal(getItemQuantity(h, ME, "energy_drink"), 25);
});

test("pacote: se algum item do conteúdo não cabe, nada abre e nada se perde; avisa quanto dá para abrir", async () => {
    const g = setup(3);

    // energético em 49/50: cabe 1 de cada vez, mas não 3 (precisaria de 3)
    tx(() => addItem(g, ME, "energy_drink", 48));

    assert.equal(packRoom(g, ME, pack), 2);

    const partial = await blocked(() => openBoxes(g, ME, "supply_pack", 3));

    assert.equal(partial.title, "Não cabe no inventário");
    assert.match(partial.message, /só dá para abrir \*\*2\*\*/);
    assert.match(partial.message, /Energético/);

    assert.equal(getItemQuantity(g, ME, "supply_pack"), 3, "os pacotes continuam lá");
    assert.equal(getItemQuantity(g, ME, "apple"), 0, "nada entrou pela metade");
    assert.equal(getItemQuantity(g, ME, "energy_drink"), 48);

    // o que cabe, abre
    assert.equal(openBoxes(g, ME, "supply_pack", 2).opened, 2);

    // agora o energético está em 50/50: não abre nenhum
    const none = await blocked(() => openBoxes(g, ME, "supply_pack", 1));

    assert.equal(none.title, "Não cabe no inventário");
    assert.match(none.message, /Você não tem espaço para abrir/);
    assert.match(none.message, /50\/50/);

    assert.equal(getItemQuantity(g, ME, "supply_pack"), 1);
});

test("o pacote se compra na loja, e a caixa misteriosa não", async () => {
    const g = setup(0);

    set("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?", 1_000_000, g, ME);

    const bought = buyItem(g, ME, "supply_pack", 2);

    assert.equal(bought.total, 6800, "2 × R$ 34,00");
    assert.equal(getItemQuantity(g, ME, "supply_pack"), 2);

    assert.throws(() => buyItem(g, ME, "mystery_box", 1));
    assert.equal(getItemQuantity(g, ME, "mystery_box"), 0);

    // e o pacote comprado abre
    assert.equal(openBoxes(g, ME, "supply_pack", 2).opened, 2);
});

// ==========================================
// RECUSAS
// ==========================================

test("recusas: sem unidade, quantidade inválida, mais do que tem e o que não abre; nada muda", async () => {
    const g = setup(0);

    const before = wallet(g);

    const missing = await blocked(() => openBoxes(g, ME, "supply_pack"));

    assert.equal(missing.title, "Você não tem esse item");
    assert.match(missing.message, /Compre na `\/loja`/, "o pacote está à venda: manda para a loja");

    const noHint = await blocked(() => openBoxes(g, ME, "mystery_box"));

    assert.doesNotMatch(noHint.message, /loja/, "a caixa não se compra: não manda para a loja");

    tx(() => addItem(g, ME, "supply_pack", 3));

    for (const bad of [0, -1, 1.5, "abc", NaN, null]) {
        assert.equal((await blocked(() => openBoxes(g, ME, "supply_pack", bad))).title, "Quantidade inválida", String(bad));
    }

    const tooMany = await blocked(() => openBoxes(g, ME, "supply_pack", 4));

    assert.equal(tooMany.title, "Quantidade inválida");
    assert.match(tooMany.message, /Você tem \*\*3\*\*/);

    assert.equal((await blocked(() => openBoxes(g, ME, "apple"))).title, "Isso não abre");
    assert.equal((await blocked(() => openBoxes(g, ME, "nao-existe"))).title, "Isso não abre");

    assert.equal(getItemQuantity(g, ME, "supply_pack"), 3, "os pacotes continuam lá");
    assert.equal(wallet(g), before);
    assert.deepEqual(ledger(g), []);

    const full = setup(MAX_OPEN_AT_ONCE);

    assert.equal((await blocked(() => openBoxes(full, ME, "supply_pack", MAX_OPEN_AT_ONCE + 1))).title, "Quantidade inválida");
});

test("/usaritem avisa que o pacote se abre com /abrir, e a caixa sorteada não promete isso", async () => {
    const g = setup(1);

    const pack = await blocked(() => useItem(g, ME, "supply_pack"));

    assert.equal(pack.title, "Item não usável");
    assert.match(pack.message, /\/abrir/);

    tx(() => addItem(g, ME, "mystery_box", 1));

    const box = await blocked(() => useItem(g, ME, "mystery_box"));

    assert.doesNotMatch(box.message, /\/abrir/);
});

// ==========================================
// O COMANDO /ABRIR
// ==========================================

const command = resolverComando(comandos, "abrir");

const slash = (g, options = {}, userId = ME) => ({
    id: "box-" + (++counter),
    guildId: g,
    channelId: "c1",
    user: { id: userId, username: "ana", displayName: "Ana" },
    data: { options }
});

const open = (g, options) => silently(() => command.execute(slash(g, options)));

const embedOf = response => response.data.embeds[0];

const descriptionOf = response => embedOf(response).description;

const texto = response => JSON.stringify(response.data);

test("o comando: nome, uma opção, sem alias (não gasta vaga), bloqueado na prisão e no catálogo", () => {
    assert.ok(command, "/abrir existe");
    assert.equal(command.name, "abrir");
    assert.equal(command.aliases, undefined, "alias gasta vaga de comando de barra");
    assert.deepEqual(command.options.map(option => option.name), ["quantidade"]);
    assert.equal(command.options[0].required, false);
    assert.ok(command.description.length <= 70, "sobra espaço para a etiqueta da categoria");

    assert.ok(PRISON_BLOCKED_COMMANDS.has("abrir"), "preso não abre");
    assert.match(getItem("supply_pack").description, /\/abrir/);
});

test("/abrir: recibo do pacote com o conteúdo e quantos ainda tem", async () => {
    const g = setup(2);

    const response = await open(g);

    assert.match(texto(response), /Pacote aberto/);
    assert.match(descriptionOf(response), /Você abriu 📦 \*\*Pacote de suprimentos\*\* e recebeu:/);
    assert.match(descriptionOf(response), /> 🍎 \*\*Maçã\*\* ×3/);
    assert.match(descriptionOf(response), /> ☕ \*\*Café\*\* ×2/);
    assert.match(descriptionOf(response), /> ⚡ \*\*Energético\*\* ×1/);

    assert.equal(receiptOf(response)["Ainda tem"], "1 pacote");

    assert.match(texto(response), /mood-feliz/);
    assert.equal(getItemQuantity(g, ME, "apple"), 3);
});

test("/abrir 3 e /abrir max: título no plural, conteúdo multiplicado", async () => {
    const g = setup(5);

    const three = await open(g, { quantidade: "3" });

    assert.match(texto(three), /Pacotes abertos/);
    assert.match(descriptionOf(three), /Você abriu \*\*3\*\* pacotes\. Recebeu:/);
    assert.match(descriptionOf(three), /> 🍎 \*\*Maçã\*\* ×9/);
    assert.equal(receiptOf(three)["Ainda tem"], "2 pacotes");

    const all = await open(g, { quantidade: "max" });

    assert.match(descriptionOf(all), /Você abriu \*\*2\*\* pacotes/);
    assert.equal(receiptOf(all)["Ainda tem"], "0 pacotes");
    assert.equal(getItemQuantity(g, ME, "supply_pack"), 0);
});

test("/abrir recusa quantidade inválida, falta de pacote, falta de espaço e conta sem servidor, sem mexer em nada", async () => {
    const g = setup(1);

    for (const bad of ["abc", "metade", "0", "-2"]) {
        assert.match(texto(await open(g, { quantidade: bad })), /Quantidade inválida/, bad);
    }

    const none = await open(setup(0));

    assert.match(texto(none), /Você não tem esse item/);
    assert.match(texto(none), /Compre na `\/loja`/);

    assert.match(texto(await open(g, { quantidade: "5" })), /Você tem \*\*1\*\*/);

    const noGuild = await silently(() => command.execute({ id: "x", user: { id: ME }, data: { options: {} } }));

    assert.match(texto(noGuild), /identificar sua conta/);

    const crowded = setup(1);

    tx(() => addItem(crowded, ME, "energy_drink", getItem("energy_drink").maxStack));

    assert.match(texto(await open(crowded)), /Não cabe no inventário/);

    assert.equal(getItemQuantity(g, ME, "supply_pack"), 1);
    assert.equal(getItemQuantity(crowded, ME, "supply_pack"), 1);
});

test("/abrir não abre a caixa misteriosa (sorteio): quem só tem caixa é avisado como quem não tem pacote", async () => {
    const g = setup(2, "mystery_box");

    const response = await open(g);

    assert.match(texto(response), /Você não possui 📦 \*\*Pacote de suprimentos\*\*/);
    assert.equal(getItemQuantity(g, ME, "mystery_box"), 2, "as caixas ficam guardadas");
    assert.equal(wallet(g), get("SELECT wallet FROM players WHERE guild_id = ? AND user_id = ?", g, ME).wallet);
    assert.deepEqual(ledger(g), []);
});

// ==========================================
// A TELA DA CAIXA SORTEADA (pronta para quando ela abrir)
// ==========================================

const randomView = (boxes, rolls, wallet0) => {
    const g = setup(boxes, "mystery_box");

    if (wallet0 !== undefined) {
        set("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?", wallet0, g, ME);
    }

    return { g, response: openedResponse(openRandom(g, boxes, { random: script(...rolls) })) };
};

test("tela da caixa, dinheiro: recibo com o que ganhou, a carteira e quantas caixas ainda tem", () => {
    const g = setup(2, "mystery_box");

    const before = wallet(g);

    const response = openedResponse(openRandom(g, 1, { random: script(...cash("cash_medium", 0)) }));

    assert.match(texto(response), /Caixa aberta/);
    assert.match(descriptionOf(response), /Você abriu 🎁 \*\*Caixa misteriosa\*\* e encontrou:/);
    assert.match(descriptionOf(response), /> 🟢 💵 \*\*R\$\s80,00\*\*/);

    const rows = receiptOf(response);

    assert.match(rows["Dinheiro"], /^\+R\$\s80,00$/);
    // o recibo troca o espaço não separável do dinheiro por um espaço comum
    assert.equal(rows["Carteira"], formatMoney(before + 8000).replace(/\s/g, " "));
    assert.equal(rows["Ainda tem"], "1 caixa");

    assert.match(texto(response), /mood-dinheiro/);
});

test("tela da caixa, item: mostra o item e a quantidade, e não tem linha de dinheiro", () => {
    const { response } = randomView(1, [aim("energy_three")]);

    assert.match(descriptionOf(response), /> 🟢 ⚡ \*\*Energético\*\* ×3/);
    assert.equal(receiptOf(response)["Dinheiro"], undefined);
    assert.equal(receiptOf(response)["Ainda tem"], "0 caixas");
});

test("tela da caixa, item que não coube: explica que virou dinheiro", () => {
    const g = setup(1, "mystery_box");

    tx(() => addItem(g, ME, "coffee", getItem("coffee").maxStack));

    const response = openedResponse(openRandom(g, 1, { random: script(aim("coffees")) }));

    assert.match(descriptionOf(response), /> ⚪ 💵 \*\*R\$\s7,00\*\* \(não coube na mochila e virou dinheiro\)/);
    assert.match(receiptOf(response)["Dinheiro"], /^\+R\$\s7,00$/);
});

test("tela da caixa, várias: lista cada tipo de prêmio com a contagem; lendária traz o humor de festa", () => {
    const { response } = randomView(3, [...cash("cash_small", 0), ...cash("cash_small", 0), aim("apples")]);

    assert.match(texto(response), /Caixas abertas/);
    assert.match(descriptionOf(response), /Você abriu \*\*3\*\* caixas\. Saiu:/);
    assert.match(descriptionOf(response), /> ⚪ 2× 💵 \*\*R\$\s100,00\*\*/);
    assert.match(descriptionOf(response), /> ⚪ 🍎 \*\*Maçã\*\* ×3/);

    const jackpot = randomView(2, [...cash("cash_jackpot"), ...cash("cash_small", 0)]).response;

    assert.match(descriptionOf(jackpot), /> 🟡 💵 \*\*R\$\s2\.500,00\*\*/);
    assert.match(texto(jackpot), /mood-festa/);
});

test("tela da caixa, carteira no teto: avisa quanto se perdeu", () => {
    const { response } = randomView(1, cash("cash_small", 0), MAX_CENTS - 1000);

    assert.match(descriptionOf(response), /A carteira chegou ao limite: R\$\s40,00 se perderam\./);
});

// ==========================================
// EM INGLÊS
// ==========================================

const english = response => JSON.stringify(localizeResponse(response, "en-US").data);

const PORTUGUESE = /caixa|pacote|Pacote|Você|encontrou|recebeu|Recebeu|Saiu|Carteira|Dinheiro|Ainda tem|couberam|coube|mochila|virou|viraram|perderam|Compre|Maçã|Café|Energético|inventário/;

test("em inglês: o pacote e os avisos saem traduzidos", async () => {
    const one = english(await open(setup(2)));

    assert.match(one, /Pack opened/);
    assert.match(one, /You opened 📦 \*\*Supply pack\*\* and got:/);
    assert.match(one, /🍎 \*\*Apple\*\* ×3/);
    assert.match(one, /☕ \*\*Coffee\*\* ×2/);
    assert.match(one, /⚡ \*\*Energy drink\*\* ×1/);
    assert.match(one, /Still have/);
    assert.match(one, /1 pack/);
    assert.match(one, /Buy more packs in \/loja/);
    assert.doesNotMatch(one, PORTUGUESE);

    const many = english(await open(setup(4), { quantidade: "3" }));

    assert.match(many, /Packs opened/);
    assert.match(many, /You opened \*\*3\*\* packs\. You got:/);
    assert.match(many, /1 pack|1 packs/);
    assert.doesNotMatch(many, PORTUGUESE);

    const refused = english(await open(setup(0)));

    assert.match(refused, /You don't have 📦 \*\*Supply pack\*\*\. Buy one in `\/loja`\./);

    assert.match(english(await open(setup(1), { quantidade: "abc" })), /Invalid quantity/);

    const crowded = setup(1);

    tx(() => addItem(crowded, ME, "energy_drink", getItem("energy_drink").maxStack));

    const noRoom = english(await open(crowded));

    assert.match(noRoom, /Doesn't fit in your inventory/);
    assert.match(noRoom, /You don't have room to open 📦 \*\*Supply pack\*\*: ⚡ Energy drink is already at 50\/50\./);
    assert.doesNotMatch(noRoom, PORTUGUESE);

    const partial = setup(3);

    tx(() => addItem(partial, ME, "energy_drink", 48));

    const some = english(await open(partial, { quantidade: "3" }));

    assert.match(some, /Right now you can only open \*\*2\*\* of 📦 Supply pack: ⚡ Energy drink doesn't fit any more than that\./);
    assert.doesNotMatch(some, PORTUGUESE);
});

test("em inglês: a tela da caixa sorteada (dinheiro, item, conversão em dinheiro, várias) sai traduzida", () => {
    const money = english(randomView(1, cash("cash_medium", 0)).response);

    assert.match(money, /Box opened/);
    assert.match(money, /You opened 🎁 \*\*Mystery box\*\* and found:/);
    assert.match(money, /Money/);
    assert.match(money, /Wallet/);
    assert.match(money, /0 boxes/);
    assert.doesNotMatch(money, PORTUGUESE);

    const item = english(randomView(1, [aim("coffees")]).response);

    assert.match(item, /☕ \*\*Coffee\*\* ×2/);
    assert.doesNotMatch(item, PORTUGUESE);

    const full = setup(1, "mystery_box");

    tx(() => addItem(full, ME, "coffee", getItem("coffee").maxStack));

    const converted = english(openedResponse(openRandom(full, 1, { random: script(aim("coffees")) })));

    assert.match(converted, /didn't fit in your backpack and turned into money/);
    assert.doesNotMatch(converted, PORTUGUESE);

    const many = english(randomView(3, [...cash("cash_small", 0), aim("apples"), aim("apples")]).response);

    assert.match(many, /Boxes opened/);
    assert.match(many, /You opened \*\*3\*\* boxes\. You got:/);
    assert.match(many, /🍎 \*\*Apple\*\* ×6/);
    assert.doesNotMatch(many, PORTUGUESE);

    const lost = english(randomView(1, cash("cash_small", 0), MAX_CENTS - 1000).response);

    assert.match(lost, /Your wallet hit its limit: R\$\s40,00 was lost\./);
});

test("o catálogo: o pacote e a caixa existem, e só eles são da categoria caixa", () => {
    assert.deepEqual(Object.keys(BOXES).sort(), ["mystery_box", "supply_pack"]);
    assert.deepEqual(ITEMS.filter(item => item.category === "box").map(item => item.id).sort(), ["mystery_box", "supply_pack"]);
});
