import {
    db, getPlayer, set, blockedTitle
} from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// Comida que vence: o prazo de cada unidade, quem sai primeiro, o que passa do prazo e as telas.

const food = await import("../services/economy/food.mjs");
const { buyItem } = await import("../services/economy/shop.mjs");
const { addItem, getItemQuantity } = await import("../services/economy/inventory.mjs");
const { useItem, describeUse } = await import("../services/economy/use-item.mjs");
const { buildInventoryView } = await import("../services/panels/inventory-view.mjs");
const { buildUseView } = await import("../services/panels/use-panel.mjs");
const { buildShopView } = await import("../services/panels/shop-view.mjs");
const { tx } = await import("../services/combat/combat.mjs");
const { getItem, ITEMS } = await import("../config/items.mjs");

const G = "g-food";
const ME = "111111111111111111";
const T0 = 1_800_000_000;
const H = 3600;

const quantity = itemId => getItemQuantity(G, ME, itemId);
const batches = itemId => db.prepare("SELECT bought_at, quantity FROM food_batches WHERE guild_id=? AND user_id=? AND item_id=? ORDER BY bought_at, rowid").all(G, ME, itemId).map(row => ({ ...row }));

function reset({ wallet = 1_000_000, energy = 10 } = {}) {
    for (const table of ["players", "inventory", "food_batches", "transactions", "combat_players", "combat_gear", "equipped_items"]) {
        db.exec(`DELETE FROM ${table}`);
    }

    getPlayer(G, ME);

    set("UPDATE players SET wallet = ?, energy = ?, energy_updated_at = ? WHERE guild_id = ? AND user_id = ?", wallet, energy, T0, G, ME);
}

const buy = (itemId, count, now) => buyItem(G, ME, itemId, count, { now });

// ==========================================
// O QUE VENCE
// ==========================================

test("maçã vence em 24 h, café em 12 h e o energético não vence", () => {
    assert.equal(food.shelfLifeOf(getItem("apple")), 24 * H);
    assert.equal(food.shelfLifeOf(getItem("coffee")), 12 * H);
    assert.equal(food.shelfLifeOf(getItem("energy_drink")), null);

    assert.deepEqual(food.PERISHABLE.map(item => item.id).sort(), ["apple", "coffee"]);

    // só comida usável vence: nada de arma ou caixa com prazo
    for (const item of food.PERISHABLE) {
        assert.equal(item.category, "consumable");
        assert.ok(item.use, `${item.id} é de comer ou beber`);
    }

    assert.ok(ITEMS.filter(item => item.category === "weapon").every(item => food.shelfLifeOf(item) === null));
});

test("os textos do prazo: 12h, 24h, 1h 30min e a linha da loja", () => {
    assert.equal(food.shelfLifeText(12 * H), "12h");
    assert.equal(food.shelfLifeText(24 * H), "24h");
    assert.equal(food.shelfLifeText(90 * 60), "1h 30min");
    assert.equal(food.shelfLifeText(30), "menos de 1 min");

    assert.equal(food.shelfLifeNote(getItem("coffee")), "⏳ Vence 12h depois da compra");
    assert.equal(food.shelfLifeNote(getItem("apple")), "⏳ Vence 24h depois da compra");
    assert.equal(food.shelfLifeNote(getItem("energy_drink")), null);

    assert.equal(food.remainingText(3 * H + 20 * 60), "vence em 3h 20min");
    assert.equal(food.remainingText(45 * 60), "vence em 45min");
    assert.equal(food.remainingText(20), "vence em menos de 1 min");
    assert.equal(food.remainingText(0), "vence agora");
});

// ==========================================
// COMPRA E PRAZO
// ==========================================

test("cada compra grava a hora, e o prazo é contado a partir dela", () => {
    reset();

    buy("apple", 3, T0);

    assert.deepEqual(batches("apple"), [{ bought_at: T0, quantity: 3 }]);

    const { expired, deadlines } = food.foodStatus(G, ME, { now: T0 + 2 * H });

    assert.deepEqual(expired, []);
    assert.deepEqual(deadlines.apple, { expiresAt: T0 + 24 * H, remaining: 22 * H, units: 3 });
    assert.equal(quantity("apple"), 3);
});

test("comprar item que não vence não cria lote", () => {
    reset();

    buy("energy_drink", 2, T0);

    assert.equal(db.prepare("SELECT COUNT(*) c FROM food_batches").get().c, 0);
    assert.deepEqual(food.foodStatus(G, ME, { now: T0 + 1000 * H }).deadlines, {});
    assert.equal(quantity("energy_drink"), 2, "o energético não vence nunca");
});

test("a compra que falha (sem dinheiro) não deixa lote", () => {
    reset({ wallet: 100 });

    assert.throws(() => buy("apple", 1, T0));
    assert.equal(db.prepare("SELECT COUNT(*) c FROM food_batches").get().c, 0);
});

test("o prazo mostrado é o da unidade mais antiga, e vence em lotes", () => {
    reset();

    buy("coffee", 2, T0);
    buy("coffee", 3, T0 + 5 * H);

    const early = food.foodStatus(G, ME, { now: T0 + 10 * H });

    assert.deepEqual(early.expired, []);
    assert.equal(early.deadlines.coffee.remaining, 2 * H, "o primeiro lote vence em 2 h");
    assert.equal(early.deadlines.coffee.units, 2);

    // passou o primeiro lote (12 h), o segundo (17 h) ainda vale
    const later = food.foodStatus(G, ME, { now: T0 + 13 * H });

    assert.equal(later.expired.length, 1);
    assert.equal(later.expired[0].item.id, "coffee");
    assert.equal(later.expired[0].quantity, 2);
    assert.equal(quantity("coffee"), 3);
    assert.equal(later.deadlines.coffee.remaining, 4 * H);

    // e depois o segundo
    const last = food.foodStatus(G, ME, { now: T0 + 18 * H });

    assert.equal(last.expired[0].quantity, 3);
    assert.equal(quantity("coffee"), 0);
    assert.deepEqual(last.deadlines, {});
    assert.equal(db.prepare("SELECT COUNT(*) c FROM food_batches").get().c, 0);
});

test("o prazo exato: um segundo antes ainda vale, no segundo certo já venceu", () => {
    reset();

    buy("coffee", 1, T0);

    assert.equal(food.foodStatus(G, ME, { now: T0 + 12 * H - 1 }).expired.length, 0);
    assert.equal(food.foodStatus(G, ME, { now: T0 + 12 * H }).expired.length, 1);
});

// ==========================================
// COMIDA QUE NÃO VEIO PELA COMPRA
// ==========================================

test("comida que já estava no inventário (ou veio de um comando de admin) ganha o prazo completo na primeira vez que alguém olha", () => {
    reset();

    tx(() => addItem(G, ME, "apple", 4));

    assert.equal(db.prepare("SELECT COUNT(*) c FROM food_batches").get().c, 0, "sem lote até alguém olhar");

    const first = food.foodStatus(G, ME, { now: T0 });

    assert.deepEqual(first.expired, []);
    assert.equal(first.deadlines.apple.remaining, 24 * H);
    assert.deepEqual(batches("apple"), [{ bought_at: T0, quantity: 4 }]);

    // o relógio dela começou na primeira olhada, não anda para trás
    assert.equal(food.foodStatus(G, ME, { now: T0 + 23 * H }).deadlines.apple.remaining, H);
    assert.equal(food.foodStatus(G, ME, { now: T0 + 24 * H }).expired[0].quantity, 4);
});

test("comida que chega depois (admin) vira um lote novo sem mexer no relógio das anteriores", () => {
    reset();

    buy("apple", 2, T0);

    tx(() => addItem(G, ME, "apple", 3));

    const status = food.foodStatus(G, ME, { now: T0 + 10 * H });

    assert.deepEqual(batches("apple"), [
        { bought_at: T0, quantity: 2 },
        { bought_at: T0 + 10 * H, quantity: 3 }
    ]);

    assert.equal(status.deadlines.apple.remaining, 14 * H, "o prazo mostrado é o da compra de verdade");
});

// ==========================================
// GASTAR, VENDER, DESCARTAR
// ==========================================

test("comer gasta primeiro a que vence antes", () => {
    reset();

    buy("apple", 2, T0);
    buy("apple", 3, T0 + 3 * H);

    const used = useItem(G, ME, "apple", 2, { now: T0 + 4 * H });

    assert.equal(used.used, 2);
    assert.equal(quantity("apple"), 3);

    const status = food.foodStatus(G, ME, { now: T0 + 4 * H });

    assert.equal(status.deadlines.apple.expiresAt, T0 + 3 * H + 24 * H, "sobraram as unidades mais novas");
    assert.equal(status.deadlines.apple.units, 3);
    assert.deepEqual(batches("apple"), [{ bought_at: T0 + 3 * H, quantity: 3 }]);
});

test("vender ou descartar também tira a mais antiga, e zerar limpa os lotes", () => {
    reset();

    buy("apple", 2, T0);
    buy("apple", 2, T0 + H);

    tx(() => db.prepare("UPDATE inventory SET quantity = 3 WHERE guild_id=? AND user_id=? AND item_id='apple'").run(G, ME));

    food.foodStatus(G, ME, { now: T0 + 2 * H });

    assert.deepEqual(batches("apple"), [{ bought_at: T0, quantity: 1 }, { bought_at: T0 + H, quantity: 2 }]);

    tx(() => db.prepare("DELETE FROM inventory WHERE guild_id=? AND user_id=? AND item_id='apple'").run(G, ME));

    food.foodStatus(G, ME, { now: T0 + 2 * H });

    assert.deepEqual(batches("apple"), []);
});

test("comer comida vencida: ela sai, o uso é recusado, e a mochila fica em dia", async () => {
    reset();

    buy("coffee", 2, T0);

    const late = T0 + 13 * H;

    assert.equal(await blockedTitle(() => useItem(G, ME, "coffee", 1, { now: late })), "Você não tem esse item");

    assert.equal(quantity("coffee"), 0, "mesmo recusado, o que venceu já saiu");
    assert.deepEqual(batches("coffee"), []);
});

test("usar comida boa avisa da vencida que saiu junto", () => {
    reset();

    buy("coffee", 1, T0);
    buy("apple", 1, T0 + 5 * H);
    buy("coffee", 1, T0 + 5 * H);

    // a energia só começa a voltar daqui: senão 13 h depois ela já estaria cheia e o uso seria recusado
    set("UPDATE players SET energy_updated_at = ? WHERE guild_id = ? AND user_id = ?", T0 + 13 * H, G, ME);

    const used = useItem(G, ME, "apple", 1, { now: T0 + 13 * H });

    assert.equal(used.expired.length, 1);
    assert.equal(used.expired[0].item.id, "coffee");
    assert.match(describeUse(used), /🗑️ \*\*Comida vencida\*\* saiu da mochila: 1× ☕ Café\./);

    assert.equal(quantity("coffee"), 1, "o café de 8 h atrás continua bom");
});

// ==========================================
// AS TELAS
// ==========================================

const textOf = view => JSON.stringify(view.embed ?? view.embeds);

test("o inventário mostra quando cada comida vence e limpa a vencida com um aviso", () => {
    reset();

    const now = Math.floor(Date.now() / 1000);

    buy("apple", 3, now - 2 * H);
    buy("coffee", 1, now - 13 * H);
    buy("energy_drink", 1, now);

    const view = buildInventoryView({ ownerId: ME, guildId: G, userId: ME, username: "Eu" });

    const description = view.embed.description;

    // 24 h de prazo menos as 2 h desde a compra (um segundo a mais no relógio vira "21h 59min")
    assert.match(description, /🍎 \*\*Maçã\*\* ×3.*· ⏳ vence em (22h|21h 59min)/);
    assert.doesNotMatch(description, /☕ \*\*Café\*\*/, "o café venceu e saiu da lista (só o aviso o cita)");
    assert.match(description, /🗑️ \*\*Comida vencida\*\* saiu da mochila: 1× ☕ Café\./);
    assert.doesNotMatch(description, /Energético.*⏳/, "o energético não vence");

    assert.equal(quantity("coffee"), 0);

    // o V2 mostra o mesmo
    assert.match(JSON.stringify(view.layout), /vence em (22h|21h 59min)/);

    // abrir de novo não repete o aviso
    const again = buildInventoryView({ ownerId: ME, guildId: G, userId: ME, username: "Eu" });

    assert.doesNotMatch(again.embed.description, /Comida vencida/);
});

test("o painel de uso mostra o prazo embaixo de cada comida e o aviso do que venceu", () => {
    reset();

    const now = Math.floor(Date.now() / 1000);

    buy("apple", 2, now - 3 * H);
    buy("coffee", 2, now - 20 * H);

    const view = buildUseView({ ownerId: ME, guildId: G, userId: ME });

    // 24 h de prazo menos as 3 h desde a compra
    assert.match(view.embed.description, /🍎 \*\*Maçã\*\* ×2 — Comer \(\+10 de energia\) · ⏳ vence em (21h|20h 59min)/);
    assert.match(view.embed.description, /🗑️ \*\*Comida vencida\*\* saiu da mochila: 2× ☕ Café\./);
    assert.doesNotMatch(view.embed.description, /☕ \*\*Café\*\* ×/);

    assert.match(JSON.stringify(view.layout), /Comer · \+10 de energia · ⏳ vence em (21h|20h 59min)/);
});

test("a loja diz o prazo antes de pagar, só nas comidas que vencem", () => {
    reset();

    const view = buildShopView({ ownerId: ME, guildId: G, userId: ME, category: "consumable" });

    const all = textOf(view) + JSON.stringify(view.layout ?? "");

    assert.match(all, /⏳ Vence 24h depois da compra/);
    assert.match(all, /⏳ Vence 12h depois da compra/);

    // uma linha por comida que vence: duas, e nenhuma para o energético
    assert.equal((textOf(view).match(/Vence \d+h depois da compra/g) ?? []).length, 2);
});
