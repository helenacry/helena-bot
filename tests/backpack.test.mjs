import { db, getPlayer } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// A mochila: o limite TOTAL do inventário (config/inventory.mjs, services/economy/backpack.mjs) e onde ele vale:
// addItem, loja, pacotes, pesca e as telas.

const { INVENTORY_CONFIG } = await import("../config/inventory.mjs");
const { ITEMS, getItem } = await import("../config/items.mjs");
const { inventoryCapacity, inventoryRoom, inventorySpace, inventoryUsed } = await import("../services/economy/backpack.mjs");
const { addItem, getItemQuantity, removeItem } = await import("../services/economy/inventory.mjs");
const { buyItem } = await import("../services/economy/shop.mjs");
const { openBoxes } = await import("../services/economy/boxes.mjs");
const { fish } = await import("../services/economy/fishing.mjs");
const { FISHING_TABLE } = await import("../config/fishing.mjs");
const { buildInventoryView } = await import("../services/panels/inventory-view.mjs");
const { affordability } = await import("../services/panels/shop-view.mjs");
const { handleModalSubmit } = await import("../services/panels/panels.mjs");
const { carregarComandos } = await import("../command-registry.mjs");
const { localizeData } = await import("../services/platform/i18n.mjs");
const { GameBlocked } = await import("../utils/game-error.mjs");
const { tx } = await import("../services/combat/combat.mjs");

const ME = "111111111111111111";

let counter = 0;

const guild = () => `g-bag-${++counter}`;

function setup(wallet = 10_000_000) {
    const g = guild();

    getPlayer(g, ME);

    db.prepare("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?").run(wallet, g, ME);

    return g;
}

const give = (g, item, quantity, options) => tx(() => addItem(g, ME, item, quantity, options));

const BASE = INVENTORY_CONFIG.baseCapacity;

// Enche a mochila com comida até sobrarem "left" espaços (cada item tem o seu limite: maçã e café 99, energético 50).
function fill(g, left, items = ["apple", "coffee", "energy_drink"]) {
    let need = inventoryRoom(g, ME) - left;

    for (const item of items) {
        const quantity = Math.min(need, getItem(item).maxStack - getItemQuantity(g, ME, item));

        if (quantity > 0) {
            give(g, item, quantity);

            need -= quantity;
        }
    }

    assert.equal(inventoryRoom(g, ME), left, "preparou o espaço");
}

// ==========================================
// A CONTA
// ==========================================

test("o espaço: a base para todo mundo, e só a maior mochila soma (as menores não)", () => {
    const g = setup();

    assert.deepEqual(inventoryCapacity(g, ME), { base: BASE, bonus: 0, total: BASE, backpack: null });
    assert.equal(inventoryUsed(g, ME), 0);

    give(g, "backpack", 1);

    assert.equal(inventoryCapacity(g, ME).total, BASE + getItem("backpack").capacity);
    assert.equal(inventoryCapacity(g, ME).backpack.id, "backpack");

    give(g, "hiking_backpack", 1);

    assert.equal(inventoryCapacity(g, ME).total, BASE + getItem("hiking_backpack").capacity, "vale a maior, não a soma");

    give(g, "expedition_backpack", 1);

    assert.equal(inventoryCapacity(g, ME).total, BASE + getItem("expedition_backpack").capacity);

    // vendendo a maior, volta a valer a seguinte
    tx(() => removeItem(g, ME, "expedition_backpack", 1));

    assert.equal(inventoryCapacity(g, ME).backpack.id, "hiking_backpack");

    // a mochila também ocupa 1 espaço
    assert.equal(inventoryUsed(g, ME), 2);
});

test("as mochilas: cada uma maior e mais cara que a anterior, uma só de cada, e vendem pela metade", () => {
    const bags = ITEMS.filter(item => item.capacity).sort((a, b) => a.capacity - b.capacity);

    assert.deepEqual(bags.map(item => item.id), ["backpack", "hiking_backpack", "expedition_backpack"]);

    for (let index = 0; index < bags.length; index += 1) {
        assert.equal(bags[index].maxStack, 1);
        assert.equal(bags[index].category, "equipment");
        assert.equal(bags[index].sellPrice, bags[index].buyPrice / 2);

        if (index > 0) {
            assert.ok(bags[index].capacity > bags[index - 1].capacity);
            assert.ok(bags[index].buyPrice > bags[index - 1].buyPrice);
        }
    }

    // a descrição diz o que a mochila faz, com o número certo
    for (const bag of bags) {
        assert.match(bag.description, new RegExp(String(bag.capacity)));
    }
});

test("o espaço nunca é negativo: quem já passava do limite quando a regra entrou não perde nada", () => {
    const g = setup();

    give(g, "apple", 99);
    give(g, "coffee", 99, { ignoreCapacity: true });

    assert.equal(inventoryUsed(g, ME), 198);
    assert.equal(inventoryRoom(g, ME), 0);
    assert.deepEqual(inventorySpace(g, ME), { used: 198, total: BASE, room: 0, backpack: null });

    assert.equal(getItemQuantity(g, ME, "coffee"), 99, "o que tinha continua");

    // não entra mais nada, mas vender libera
    assert.throws(() => give(g, "energy_drink", 1), /mochila está cheia/);

    tx(() => removeItem(g, ME, "coffee", 99));
    tx(() => removeItem(g, ME, "apple", 50));

    assert.equal(inventoryRoom(g, ME), BASE - 49);

    give(g, "energy_drink", 1);
});

// ==========================================
// addItem
// ==========================================

test("addItem: recusa o que não cabe, aceita o que cabe, e a mensagem diz quanto ocupa e quanto sobra", () => {
    const g = setup();

    fill(g, 5);

    assert.throws(() => give(g, "energy_drink", 6), error => {
        assert.match(error.message, new RegExp(`mochila está cheia \\(${BASE - 5}/${BASE}\\): cabem mais 5 unidade`));
        assert.match(error.message, /compre uma mochila maior/);

        return true;
    });

    assert.equal(getItemQuantity(g, ME, "energy_drink"), 0, "nada entrou");

    give(g, "energy_drink", 5);

    assert.equal(inventoryRoom(g, ME), 0);
});

test("addItem: a mochila entra mesmo com tudo cheio (senão ninguém compraria uma maior), e o dono pode ignorar o limite", () => {
    const g = setup();

    fill(g, 0);

    give(g, "backpack", 1);

    assert.equal(inventoryCapacity(g, ME).total, BASE + 100);
    assert.equal(inventoryRoom(g, ME), 100 - 1, "a mochila ocupou 1 e somou 100");

    // outro jogador cheio recebe do dono
    const other = setup();

    fill(other, 0);

    give(other, "energy_drink", 3, { ignoreCapacity: true });

    assert.equal(getItemQuantity(other, ME, "energy_drink"), 3);
});

// ==========================================
// A LOJA
// ==========================================

test("a loja: recusa comprar além do espaço, deixa comprar o que cabe e a mochila se compra sempre", () => {
    const g = setup();

    fill(g, 2);

    assert.throws(() => buyItem(g, ME, "energy_drink", 3, { now: 1_800_000_000 }), /mochila está cheia/);

    const before = db.prepare("SELECT wallet FROM players WHERE guild_id = ? AND user_id = ?").get(g, ME).wallet;

    assert.equal(db.prepare("SELECT wallet FROM players WHERE guild_id = ? AND user_id = ?").get(g, ME).wallet, before, "não cobrou");

    buyItem(g, ME, "energy_drink", 2, { now: 1_800_000_000 });

    assert.equal(inventoryRoom(g, ME), 0);

    // cheio, ainda dá para comprar a mochila
    buyItem(g, ME, "backpack", 1, { now: 1_800_000_000 });

    assert.equal(inventoryCapacity(g, ME).bonus, 100);
});

test("a vitrine: mostra 'Mochila cheia' quando não cabe nada, e a mochila segue comprável", () => {
    assert.equal(affordability(getItem("apple"), 100_000, 0, 0).text, "🎒 Mochila cheia");
    assert.equal(affordability(getItem("apple"), 100_000, 0, 0).max, 0);

    assert.equal(affordability(getItem("apple"), 100_000, 0, 4).max, 4, "o espaço limita a quantidade");
    assert.equal(affordability(getItem("backpack"), 100_000, 0, 0).max, 1, "a mochila ignora o espaço");
});

test("comprar 'max' pelo formulário da loja respeita o espaço da mochila, e avisa quando não cabe nada", async () => {
    const log = console.log;
    const error = console.error;

    console.log = () => {};
    console.error = () => {};

    const comandos = await carregarComandos();

    console.log = log;
    console.error = error;

    const g = setup();

    fill(g, 7, ["apple", "coffee"]);

    const submit = fields => ({
        id: "s" + Math.random(),
        guildId: g,
        channelId: "c1",
        user: { id: ME, username: "mochileiro" },
        data: {
            customId: "loja:comprar:energy_drink",
            fields: Object.entries(fields).map(([id, value]) => ({ customId: id, value }))
        }
    });

    const quiet = async fn => {
        console.log = () => {};
        console.error = () => {};

        try { return await fn(); } finally { console.log = log; console.error = error; }
    };

    const answer = await quiet(() => handleModalSubmit(submit({ quantidade: "max" }), comandos));

    assert.equal(getItemQuantity(g, ME, "energy_drink"), 7, "comprou 7: o que cabia (e a carteira dava para muito mais)");
    assert.equal(inventoryRoom(g, ME), 0);
    assert.ok(answer);

    const none = await quiet(() => handleModalSubmit(submit({ quantidade: "max" }), comandos));

    assert.match(JSON.stringify(none), /mochila está cheia/);
    assert.equal(getItemQuantity(g, ME, "energy_drink"), 7, "nada mais entrou");
});

// ==========================================
// PACOTES
// ==========================================

test("pacote: o conteúdo todo precisa caber na mochila (tudo ou nada) e a mensagem diz quanto sobra", () => {
    const g = setup();

    give(g, "supply_pack", 25);

    // cada pacote tem 6 unidades e libera 1: pede 5 espaços livres
    fill(g, 12);

    assert.throws(() => openBoxes(g, ME, "supply_pack", 3), error => {
        assert.ok(error instanceof GameBlocked);
        assert.match(error.message, /só dá para abrir \*\*2\*\*/);

        return true;
    });

    assert.equal(getItemQuantity(g, ME, "supply_pack"), 25, "nada foi aberto");

    const opened = openBoxes(g, ME, "supply_pack", 2);

    assert.equal(opened.opened, 2);
    assert.equal(inventoryRoom(g, ME), 2, "12 - 2 pacotes x 5 = 2");

    // sem espaço nenhum para o conteúdo
    assert.throws(() => openBoxes(g, ME, "supply_pack", 1), error => {
        assert.equal(error.title, "Sua mochila está cheia");
        assert.match(error.message, /não tem espaço/);

        return true;
    });
});

// ==========================================
// PESCA
// ==========================================

test("pesca: sem espaço na mochila o peixe é vendido na hora, e com espaço entra", () => {
    const g = setup(0);

    give(g, "fishing_rod", 1);

    const aim = id => {
        const total = FISHING_TABLE.reduce((sum, entry) => sum + entry.weight, 0);

        let start = 0;

        for (const entry of FISHING_TABLE) {
            if (entry.id === id) return (start + entry.weight / 2) / total;

            start += entry.weight;
        }

        throw new Error(id);
    };

    fill(g, 0);

    const full = fish(g, ME, { now: 1_800_000_000, random: () => aim("tilapia") });

    assert.equal(full.sold, 1);
    assert.equal(full.stored, 0);
    assert.equal(full.money, getItem("tilapia").sellPrice);
    assert.equal(getItemQuantity(g, ME, "tilapia"), 0);

    tx(() => removeItem(g, ME, "apple", 1));

    const roomy = fish(g, ME, { now: 1_800_000_000 + 700, random: () => aim("tilapia") });

    assert.equal(roomy.sold, 0);
    assert.equal(roomy.stored, 1);
    assert.equal(getItemQuantity(g, ME, "tilapia"), 1);
});

// ==========================================
// AS TELAS
// ==========================================

test("o inventário mostra o espaço (ocupado/total) e avisa quando está cheia", () => {
    const g = setup();

    give(g, "apple", 20);

    const view = buildInventoryView({ ownerId: ME, guildId: g, userId: ME, username: "mochileiro" });

    assert.match(JSON.stringify(view.embed), new RegExp(`Mochila \\*\\*20/${BASE}\\*\\*`));
    assert.doesNotMatch(JSON.stringify(view.embed), /cheia/);

    fill(g, 0);

    const full = buildInventoryView({ ownerId: ME, guildId: g, userId: ME, username: "mochileiro" });

    assert.match(JSON.stringify(full.embed), new RegExp(`Mochila \\*\\*${BASE}/${BASE}\\*\\* · cheia`));

    give(g, "backpack", 1);

    const bigger = buildInventoryView({ ownerId: ME, guildId: g, userId: ME, username: "mochileiro" });

    assert.match(JSON.stringify(bigger.embed), new RegExp(`Mochila \\*\\*${BASE + 1}/${BASE + 100}\\*\\*`));
});

test("em inglês, as mensagens da mochila saem traduzidas", () => {
    const space = `(${BASE}/${BASE})`;

    const english = localizeData({
        body: "",
        embeds: [{
            title: "Sua mochila está cheia",
            description: [
                `Sua mochila está cheia ${space}: cabem mais 0 unidade(s). Venda ou descarte itens, ou compre uma mochila maior.`,
                `Você não tem espaço para abrir 📦 **Pacote de suprimentos** ${space}. Venda ou descarte itens, ou compre uma mochila maior.`,
                `Agora só dá para abrir **3** de 📦 Pacote de suprimentos: a mochila está em 90/${BASE}.`,
                "🎒 Mochila cheia",
                `🎒 Mochila **${BASE}/${BASE}** · cheia`
            ].join("\n")
        }]
    }, "en-US");

    const text = JSON.stringify(english);

    assert.match(text, /Your backpack is full/);
    assert.match(text, /You don't have room to open/);
    assert.match(text, /Right now you can only open \*\*3\*\*/);
    assert.match(text, /Backpack full/);
    assert.match(text, /Backpack \*\*100\/100\*\* · full/);

    assert.doesNotMatch(text, /Sua mochila|mochila maior|cheia/);
});
