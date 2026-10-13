import {
    db, getPlayer, set, get, createPrefixRunner
} from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { handlePanelClick, handleModalSubmit } = await import("../services/panels.mjs");
const { buildShopView, buildShopHome, shopCategories, SHOP_PAGE_SIZE } = await import("../services/shop-view.mjs");
const { buildInventoryView, INVENTORY_PAGE_SIZE } = await import("../services/inventory-view.mjs");
const { prepareDiscard } = await import("../services/discard.mjs");
const { addItem } = await import("../services/inventory.mjs");
const { equipWeapon, getEquippedWeapon } = await import("../services/equipment.mjs");
const { tx } = await import("../services/combat.mjs");
const { imprison } = await import("../services/prison.mjs");
const { carregarComandos, resolverComando } = await import("../command-registry.mjs");
const { ITEMS } = await import("../config/items.mjs");

const G = "g-shop";
const ME = "111111111111111111";
const OTHER = "222222222222222222";

const silently = async fn => {
    const log = console.log;
    const error = console.error;
    console.log = () => {};
    console.error = () => {};

    try { return await fn(); } finally { console.log = log; console.error = error; }
};

const comandos = await silently(() => carregarComandos());

// ==========================================
// FERRAMENTAS
// ==========================================

let sequence = 0;

const user = id => ({ id, username: "eu", displayName: "Eu Mesmo" });

const click = (customId, { userId = ME, values } = {}) => ({
    id: "c" + (++sequence), guildId: G, channelId: "c1",
    user: user(userId), data: { customId, ...(values ? { values } : {}) }
});

const submit = (customId, fields, userId = ME) => ({
    id: "s" + (++sequence), guildId: G, channelId: "c1", user: user(userId),
    data: {
        customId,
        fields: Object.entries(fields).map(([id, value]) => ({ customId: id, value }))
    }
});

const send = interaction => silently(() => handleModalSubmit(interaction, comandos));

const wallet = () => get("SELECT wallet w FROM players WHERE guild_id=? AND user_id=?", G, ME).w;
const owned = id => get("SELECT quantity q FROM inventory WHERE guild_id=? AND user_id=? AND item_id=?", G, ME, id)?.q ?? 0;

const giveItem = (id, qty = 1) => tx(() => addItem(G, ME, id, qty));

function reset(money = 0) {
    for (const table of [
        "players", "combat_players", "combat_gear", "inventory",
        "equipped_items", "crime_players", "prison_players", "transactions"
    ]) {
        db.exec(`DELETE FROM ${table}`);
    }

    db.exec("DELETE FROM global_users");

    getPlayer(G, ME);

    set("UPDATE players SET wallet = ? WHERE guild_id=? AND user_id=?", money, G, ME);
}

const allButtons = components => components.flatMap(r => r.components).filter(c => c.type === "button");
const ids = components => components.flatMap(r => r.components).map(c => c.customId);
const titleOf = response => response.data.embeds?.[0]?.title ?? "";
const textOf = response => JSON.stringify(response.data);

// ==========================================
// LOJA: TELA
// ==========================================

test("categorias: só as que têm itens à venda, com contagem", () => {
    const categories = shopCategories();

    assert.equal(categories[0].value, "todas");
    assert.equal(categories[0].count, ITEMS.filter(i => i.buyPrice > 0).length);

    assert.ok(categories.every(c => c.count > 0));
    assert.ok(!categories.some(c => c.value === "collectible"), "categoria vazia não aparece");
    assert.equal(
        categories.slice(1).reduce((sum, c) => sum + c.count, 0),
        categories[0].count,
        "as contagens batem com o total"
    );
});

test("a loja mostra 5 itens numerados por página", () => {
    const view = buildShopView({ ownerId: ME, category: "todas", page: 1, wallet: 123456 });

    assert.equal(view.items.length, SHOP_PAGE_SIZE);
    assert.deepEqual(
        view.embed.fields.map(f => f.name.slice(0, 3)),
        ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"].map(k => k.slice(0, 3))
    );
    assert.deepEqual(
        view.components[1].components.map(b => b.label.slice(0, 2)),
        ["1.", "2.", "3.", "4.", "5."],
        "os botões têm os mesmos números dos cartões"
    );
    assert.match(view.embed.description, /1\.234,56/, "mostra a carteira");
    assert.match(view.embed.footer.text, new RegExp(`Página 1/${view.pages}`));
    assert.equal(view.pages, Math.ceil(ITEMS.filter(i => i.buyPrice > 0).length / SHOP_PAGE_SIZE));
});

test("a página é limitada ao que existe", () => {
    const view = (page) => buildShopView({ ownerId: ME, category: "todas", page, wallet: 0 });

    assert.equal(view(999).page, view(1).pages);
    assert.equal(view(0).page, 1);
    assert.equal(view(-3).page, 1);
    assert.equal(view("abc").page, 1);
});

test("os botões da loja respeitam os limites e os IDs são únicos", () => {
    for (const category of shopCategories().map(c => c.value)) {
        const view = buildShopView({ ownerId: ME, category, page: 1, wallet: 0 });

        assert.ok(view.components.length <= 5, "no máximo 5 fileiras");

        for (const r of view.components) {
            if (r.components[0].type === "button") {
                assert.ok(r.components.length <= 5, "no máximo 5 botões por fileira");
            }
        }

        const all = ids(view.components);

        assert.equal(new Set(all).size, all.length, `IDs únicos em ${category}`);
        assert.ok(all.every(id => id.length <= 100), "customId até 100 caracteres");

        for (const b of allButtons(view.components)) {
            assert.ok(b.label || b.emoji, "todo botão tem rótulo ou emoji");
            assert.ok((b.label ?? "").length <= 80);
        }

        const select = view.components[0].components[0];

        assert.equal(select.type, "select");
        assert.ok(select.options.length <= 25);
        assert.equal(select.options.filter(o => o.default).length, 1, "uma categoria marcada");
    }
});

test("Anterior/Próxima são desligados nas pontas", () => {
    const first = buildShopView({ ownerId: ME, category: "todas", page: 1, wallet: 0 });
    const last = buildShopView({ ownerId: ME, category: "todas", page: first.pages, wallet: 0 });

    const nav = view => Object.fromEntries(
        allButtons(view.components)
            .filter(b => b.customId.startsWith("loja:pg:"))
            .map(b => [b.label, b.disabled])
    );

    assert.deepEqual(nav(first), { Anterior: true, "Próxima": false });
    assert.deepEqual(nav(last), { Anterior: false, "Próxima": true });
});

test("categoria sem itens mostra o aviso e não tem botões de compra", () => {
    const view = buildShopView({ ownerId: ME, category: "collectible", page: 1, wallet: 0 });

    assert.match(view.embed.fields[0].name, /Nenhum item/);
    assert.ok(!ids(view.components).some(id => id.startsWith("loja:item:")));
});

// ==========================================
// LOJA: VISUAL
// ==========================================

test("a vitrine mostra uma prateleira por categoria, com contagem e menor preço", () => {
    const view = buildShopHome({ ownerId: ME, wallet: 123456, gems: 7 });

    const categories = shopCategories().slice(1);

    assert.equal(view.embed.title, "🛒 Helena Loja");
    assert.match(view.embed.description, /1\.234,56/, "carteira");
    assert.match(view.embed.description, /Gemas:\*\* 7/, "gemas");

    const shelves = view.embed.fields.filter(f => f.inline);

    assert.equal(shelves.length, categories.length);
    assert.ok(shelves.every(f => /\d+ (?:item|itens)\nA partir de \*\*R\$/.test(f.value)));
    assert.match(shelves[0].name, /Consumíveis/);
    assert.match(shelves[0].value, /3 itens\nA partir de \*\*R\$\s?3,00\*\*/);

    assert.match(
        view.embed.footer.text,
        new RegExp(`${ITEMS.filter(i => i.buyPrice > 0).length} itens à venda`)
    );

    // menu sem prateleira marcada + botões; nada de itens soltos
    const select = view.components[0].components[0];

    assert.equal(select.options.filter(o => o.default).length, 0);
    assert.ok(select.options.every(o => /A partir de R\$/.test(o.description)));

    assert.deepEqual(
        allButtons(view.components).map(b => b.customId),
        [`loja:pg:${ME}:todas:1`, `loja:nome:${ME}`, `loja:vender:${ME}`, `loja:fechar:${ME}`]
    );
});

test("o cartão do item diz o que dá para comprar, o que falta e o limite", () => {
    const view = (wallet, owned = {}) =>
        buildShopView({ ownerId: ME, category: "consumable", page: 1, wallet, gems: 0, owned });

    // Em centavos: Maçã R$ 3,00 / Café R$ 7,00 / Energético R$ 15,00
    const rich = view(100000, { apple: 4 });

    assert.match(rich.embed.fields[0].value, /Você pode comprar até \*\*95\*\*/, "limite 99 menos os 4 que já tem");
    assert.match(rich.embed.fields[0].value, /Você tem \*\*4\*\*\/99/);
    assert.match(rich.embed.fields[1].value, /Você tem \*\*0\*\*\/99/);

    assert.match(view(100000).embed.fields[0].value, /Você pode comprar até \*\*99\*\*/, "teto de 99 por compra");

    const poor = view(1000);

    assert.match(poor.embed.fields[0].value, /Você pode comprar até \*\*3\*\*/);
    assert.match(poor.embed.fields[1].value, /Você pode comprar até \*\*1\*\*/);
    assert.match(poor.embed.fields[2].value, /Faltam \*\*R\$\s?5,00\*\*/);

    assert.match(view(1000, { apple: 99 }).embed.fields[0].value, /Limite do item atingido/);

    // botão verde = cabe na carteira; cinza = não cabe ou no limite
    const styles = response => response.components[1].components.map(b => b.style);

    assert.deepEqual(styles(poor), ["success", "success", "secondary"]);
    assert.deepEqual(styles(view(0)), ["secondary", "secondary", "secondary"]);
    assert.deepEqual(styles(view(1000, { apple: 99 })), ["secondary", "success", "secondary"]);
});

test("o cartão de arma mostra o dano e a prateleira tem emoji", () => {
    const view = buildShopView({ ownerId: ME, category: "weapon", page: 1, wallet: 0 });

    assert.match(view.embed.title, /Helena Loja • ⚔️ Armas/);
    assert.match(view.embed.fields[0].value, /⚔️ Dano: \d+ • Arma/);
    assert.match(view.embed.description, /Prateleira:\*\* ⚔️ Armas • 14 itens/);
});

test("a prateleira tem Início e Fechar, e os botões cabem nos limites", () => {
    const view = buildShopView({ ownerId: ME, category: "todas", page: 1, wallet: 0 });

    const last = view.components.at(-1).components;

    assert.deepEqual(
        last.map(b => b.customId),
        [`loja:home:${ME}`, `loja:nome:${ME}`, `loja:vender:${ME}`, `loja:fechar:${ME}`]
    );

    assert.equal(last.at(-1).style, "danger");
    assert.equal(view.components.length, 4);
});

test("a loja mostra a carteira e as gemas de quem abriu", () => {
    reset(250000);

    set("UPDATE global_users SET gems = 12 WHERE user_id = ?", ME);

    const home = handlePanelClick(click(`loja:home:${ME}`));

    assert.equal(home.type, "update");
    assert.match(home.data.embeds[0].description, /2\.500,00/);
    assert.match(home.data.embeds[0].description, /Gemas:\*\* 12/);

    const shelf = handlePanelClick(click(`loja:cat:${ME}`, { values: ["consumable"] }));

    assert.match(shelf.data.embeds[0].description, /Gemas:\*\* 12/);
});

test("o cartão usa o que o jogador já tem no inventário", () => {
    reset(100000);
    giveItem("apple", 5);

    const response = handlePanelClick(click(`loja:cat:${ME}`, { values: ["consumable"] }));

    assert.match(response.data.embeds[0].fields[0].value, /Você tem \*\*5\*\*\/99/);
});

// ==========================================
// LOJA: NAVEGAÇÃO
// ==========================================

test("Início volta para a vitrine e Fechar encerra o painel", () => {
    reset(5000);

    const home = handlePanelClick(click(`loja:home:${ME}`));

    assert.equal(home.type, "update");
    assert.equal(home.data.embeds[0].title, "🛒 Helena Loja");
    assert.equal(home.data.embeds[0].fields.filter(f => f.inline).length, shopCategories().length - 1);

    const closed = handlePanelClick(click(`loja:fechar:${ME}`));

    assert.equal(closed.type, "update");
    assert.match(closed.data.embeds[0].title, /Loja fechada/);
    assert.deepEqual(closed.data.components, [], "sem botões");
});

test("o menu troca de categoria e volta para a página 1", () => {
    reset(5000);

    const response = handlePanelClick(click(`loja:cat:${ME}`, { values: ["weapon"] }));

    assert.equal(response.type, "update");
    assert.match(response.data.embeds[0].description, /Armas/);

    const select = response.data.components[0].components[0];

    assert.equal(select.options.find(o => o.default).value, "weapon");
});

test("as setas levam à página pedida", () => {
    reset(0);

    const response = handlePanelClick(click(`loja:pg:${ME}:todas:2`));

    assert.equal(response.type, "update");
    assert.match(response.data.embeds[0].footer.text, /Página 2\//);
});

test("categoria inválida avisa; o indicador de página não faz nada", () => {
    reset(0);

    assert.equal(handlePanelClick(click(`loja:cat:${ME}`, { values: ["xyz"] })).data.ephemeral, true);
    assert.equal(handlePanelClick(click(`loja:pg:${ME}:xyz:1`)).data.ephemeral, true);
    assert.deepEqual(handlePanelClick(click(`loja:noop:${ME}`)), { type: "defer_update" });
});

test("só o dono navega e compra pelo painel", () => {
    reset(0);

    for (const id of [
        `loja:cat:${ME}`, `loja:pg:${ME}:todas:2`, `loja:item:${ME}:apple`,
        `loja:nome:${ME}`, `loja:vender:${ME}`, `loja:home:${ME}`, `loja:fechar:${ME}`
    ]) {
        const response = handlePanelClick(click(id, { userId: OTHER, values: ["weapon"] }));

        assert.equal(response.type, "message", id);
        assert.equal(response.data.ephemeral, true, id);
        assert.match(titleOf(response), /de outra pessoa/, id);
    }
});

// ==========================================
// LOJA: COMPRAR
// ==========================================

test("o botão numerado abre o modal de quantidade daquele item", () => {
    reset(0);

    const modal = handlePanelClick(click(`loja:item:${ME}:apple`));

    assert.equal(modal.type, "modal");
    assert.equal(modal.data.customId, "loja:comprar:apple");
    assert.match(modal.data.title, /Maçã/);
    assert.ok(modal.data.title.length <= 45);
    assert.deepEqual(modal.data.fields.map(f => f.customId), ["quantidade"]);
    assert.equal(modal.data.fields[0].value, "1");
    assert.match(modal.data.fields[0].label, /R\$\s?3,00/, "mostra o preço");
    assert.ok(modal.data.fields[0].label.length <= 45);
});

test("botão de item que saiu da loja avisa", () => {
    reset(0);

    assert.match(titleOf(handlePanelClick(click(`loja:item:${ME}:nao_existe`))), /indisponível/);
});

test("comprar pelo botão: quantidade escolhida", async () => {
    reset(100000);

    const response = await send(submit("loja:comprar:apple", { quantidade: "4" }));

    assert.equal(response.data.ephemeral, true);
    assert.equal(owned("apple"), 4);
    assert.equal(wallet(), 100000 - 4 * 300);
});

test("quantidade vazia compra 1", async () => {
    reset(100000);

    await send(submit("loja:comprar:coffee", { quantidade: "" }));

    assert.equal(owned("coffee"), 1);
});

test("max compra o máximo que o saldo permite", async () => {
    reset(1000);   // R$10,00: cabem 3 maçãs de R$3,00

    await send(submit("loja:comprar:apple", { quantidade: "max" }));

    assert.equal(owned("apple"), 3);
    assert.equal(wallet(), 100);
});

test("max respeita o limite de 99 e o limite do item", async () => {
    reset(100_000_000);

    await send(submit("loja:comprar:apple", { quantidade: "tudo" }));
    assert.equal(owned("apple"), 99, "no máximo 99 por compra");

    await send(submit("loja:comprar:fishing_rod", { quantidade: "all" }));
    assert.equal(owned("fishing_rod"), 1, "a vara tem limite 1");

    const again = await send(submit("loja:comprar:fishing_rod", { quantidade: "max" }));
    assert.match(titleOf(again), /Não dá para comprar/, "limite já atingido");
});

test("max sem saldo avisa e não compra", async () => {
    reset(100);

    const response = await send(submit("loja:comprar:apple", { quantidade: "max" }));

    assert.match(titleOf(response), /Não dá para comprar/);
    assert.equal(owned("apple"), 0);
});

test("quantidades inválidas não compram", async () => {
    reset(100000);

    for (const quantidade of ["0", "100", "-2", "abc", "metade", "2.5"]) {
        const response = await send(submit("loja:comprar:apple", { quantidade }));

        assert.match(titleOf(response), /Quantidade inválida/, quantidade);
    }

    assert.equal(owned("apple"), 0);
    assert.equal(wallet(), 100000);
});

test("sem dinheiro, o comando recusa e nada muda", async () => {
    reset(100);

    await send(submit("loja:comprar:mystery_box", { quantidade: "1" }));

    assert.equal(owned("mystery_box"), 0);
    assert.equal(wallet(), 100);
});

// ==========================================
// LOJA: VENDER
// ==========================================

test("o botão Vender abre o modal com item e quantidade", () => {
    reset(0);

    const modal = handlePanelClick(click(`loja:vender:${ME}`));

    assert.equal(modal.data.customId, "loja:vender");
    assert.deepEqual(modal.data.fields.map(f => f.customId), ["item", "quantidade"]);
});

test("vender por nome, com número, metade e tudo", async () => {
    reset(0);
    giveItem("apple", 10);

    await send(submit("loja:vender", { item: "maca", quantidade: "2" }));
    assert.equal(owned("apple"), 8);
    assert.equal(wallet(), 2 * 150);

    await send(submit("loja:vender", { item: "Maçã", quantidade: "metade" }));
    assert.equal(owned("apple"), 4, "metade de 8");

    await send(submit("loja:vender", { item: "apple", quantidade: "tudo" }));
    assert.equal(owned("apple"), 0);
    assert.equal(wallet(), 10 * 150);
});

test("metade arredonda para cima", async () => {
    reset(0);
    giveItem("apple", 5);

    await send(submit("loja:vender", { item: "apple", quantidade: "half" }));

    assert.equal(owned("apple"), 2, "vendeu 3 de 5");
});

test("vender: item que não tem, que não vende ou quantidade demais", async () => {
    reset(0);
    giveItem("apple", 2);
    giveItem("mystery_box", 1);

    assert.match(titleOf(await send(submit("loja:vender", { item: "coffee", quantidade: "1" }))), /não tem esse item/);
    assert.match(titleOf(await send(submit("loja:vender", { item: "caixa misteriosa", quantidade: "1" }))), /não encontrado/, "não vendável");
    assert.match(titleOf(await send(submit("loja:vender", { item: "apple", quantidade: "5" }))), /Quantidade inválida/);
    assert.match(titleOf(await send(submit("loja:vender", { item: "apple", quantidade: "abc" }))), /Quantidade inválida/);
    assert.match(titleOf(await send(submit("loja:vender", { item: "", quantidade: "1" }))), /Faltou o item/);

    // armas não são vendáveis: nem aparecem na busca da venda
    assert.match(titleOf(await send(submit("loja:vender", { item: "revolver", quantidade: "1" }))), /não encontrado/);

    assert.equal(owned("apple"), 2);
    assert.equal(wallet(), 0);
});

test("preso não vende nem compra pelos formulários", async () => {
    reset(100000);
    giveItem("apple", 3);

    imprison(G, ME, 1800, "teste", Math.floor(Date.now() / 1000));

    assert.match(titleOf(await send(submit("loja:comprar:apple", { quantidade: "1" }))), /Você está preso/);
    assert.match(titleOf(await send(submit("loja:vender", { item: "apple", quantidade: "1" }))), /Você está preso/);

    assert.equal(owned("apple"), 3);
});

// ==========================================
// INVENTÁRIO: TELA
// ==========================================

const view = (extra = {}) => buildInventoryView({
    ownerId: ME, guildId: G, userId: ME, username: "Eu", ...extra
});

test("inventário vazio: aviso, uma prateleira e descarte desligado", () => {
    reset(0);

    const v = view();

    assert.match(v.embed.description, /Nenhum item/);
    assert.equal(v.pages, 1);

    const drop = allButtons(v.components).find(b => b.customId.startsWith("inv:drop:"));

    assert.equal(drop.disabled, true);
});

test("a mochila pagina de 12 em 12 e agrupa por prateleira", () => {
    reset(0);

    for (const item of ITEMS.slice(0, 20)) giveItem(item.id, 1);

    const first = view({ page: 1 });

    assert.equal(first.entries.length, INVENTORY_PAGE_SIZE);
    assert.equal(first.pages, 2);
    assert.match(first.embed.footer.text, /Página 1\/2/);
    assert.match(first.embed.description, /📂/, "títulos de prateleira");

    assert.equal(view({ page: 2 }).entries.length, 8);
    assert.equal(view({ page: 99 }).page, 2, "página limitada");
});

test("🟢 marca a arma equipada", () => {
    reset(0);
    giveItem("revolver", 1);
    giveItem("apple", 2);

    equipWeapon(G, ME, "revolver");

    const v = view();

    assert.match(v.embed.description, /🟢 .*Revólver/);
    assert.doesNotMatch(v.embed.description, /🟢 .*Maçã/);
    assert.match(v.embed.description, /🟢 = arma equipada/);
});

test("o menu de prateleiras mostra só as que têm itens, com contagem", () => {
    reset(0);
    giveItem("apple", 1);
    giveItem("coffee", 1);
    giveItem("revolver", 1);

    const select = view().components[0].components[0];

    const labels = Object.fromEntries(select.options.map(o => [o.value, o.label]));

    assert.equal(labels.todas, "Todas (3)");
    assert.equal(labels.consumable, "Consumíveis (2)");
    assert.equal(labels.weapon, "Armas (1)");
    assert.ok(!("box" in labels), "prateleira vazia não aparece");

    const filtered = view({ category: "consumable" });

    assert.equal(filtered.entries.length, 2);
    assert.equal(filtered.shelf, "consumable");
});

test("prateleira que esvaziou volta para Todas", () => {
    reset(0);
    giveItem("apple", 1);

    assert.equal(view({ category: "weapon" }).shelf, "todas");
});

test("os botões do inventário respeitam os limites", () => {
    reset(0);

    for (const item of ITEMS.slice(0, 20)) giveItem(item.id, 1);

    const all = ids(view().components);

    assert.equal(new Set(all).size, all.length);
    assert.ok(all.every(id => id.length <= 100));
    assert.ok(view().components.length <= 5);
});

// ==========================================
// INVENTÁRIO: NAVEGAÇÃO
// ==========================================

test("menu, setas e atualizar do inventário (só o dono)", () => {
    reset(0);

    for (const item of ITEMS.slice(0, 20)) giveItem(item.id, 1);

    const byShelf = handlePanelClick(click(`inv:cat:${ME}`, { values: ["weapon"] }));
    assert.equal(byShelf.type, "update");
    assert.match(byShelf.data.embeds[0].description, /Armas/);

    const page2 = handlePanelClick(click(`inv:pg:${ME}:todas:2`));
    assert.match(page2.data.embeds[0].footer.text, /Página 2\/2/);

    const refresh = handlePanelClick(click(`inv:pg:${ME}:todas:2`));
    assert.match(refresh.data.embeds[0].footer.text, /Página 2\/2/);

    assert.deepEqual(handlePanelClick(click(`inv:noop:${ME}`)), { type: "defer_update" });
    assert.match(titleOf(handlePanelClick(click(`inv:cat:${ME}`, { values: ["xyz"] }))), /inválida/);

    for (const id of [`inv:cat:${ME}`, `inv:pg:${ME}:todas:1`, `inv:drop:${ME}`, `inv:ok:${ME}:apple:1`, `inv:cancel:${ME}`]) {
        const response = handlePanelClick(click(id, { userId: OTHER, values: ["weapon"] }));

        assert.equal(response.data.ephemeral, true, id);
        assert.match(titleOf(response), /de outra pessoa/, id);
    }
});

// ==========================================
// DESCARTAR
// ==========================================

test("prepareDiscard resolve item e quantidade entre o que a pessoa tem", () => {
    reset(0);
    giveItem("apple", 10);
    giveItem("revolver", 1);

    const ok = prepareDiscard(G, ME, "Maçã", "3");

    assert.equal(ok.ok, true);
    assert.equal(ok.item.id, "apple");
    assert.equal(ok.quantity, 3);
    assert.equal(ok.owned, 10);

    assert.equal(prepareDiscard(G, ME, "apple", "metade").quantity, 5);
    assert.equal(prepareDiscard(G, ME, "maca", "tudo").quantity, 10);
    assert.equal(prepareDiscard(G, ME, "apple", "").quantity, 1);
});

test("prepareDiscard recusa o que não faz sentido", () => {
    reset(0);
    giveItem("apple", 2);
    giveItem("iron_sword", 1);
    giveItem("steel_sword", 1);

    assert.equal(prepareDiscard(G, ME, "", "1").title, "Faltou o item");
    assert.equal(prepareDiscard(G, ME, "coffee", "1").title, "Item não encontrado");
    assert.equal(prepareDiscard(G, ME, "espada", "1").title, "Mais de um item encontrado");
    assert.equal(prepareDiscard(G, ME, "apple", "3").title, "Quantidade inválida");
    assert.equal(prepareDiscard(G, ME, "apple", "0").title, "Quantidade inválida");
    assert.equal(prepareDiscard(G, ME, "apple", "abc").title, "Quantidade inválida");
});

test("descartar a última unidade da arma equipada desarma", () => {
    reset(0);
    giveItem("revolver", 1);
    equipWeapon(G, ME, "revolver");

    const prepared = prepareDiscard(G, ME, "revolver", "1");

    assert.equal(prepared.equipped, true);
    assert.equal(prepared.disarms, true);

    giveItem("apple", 1);
    assert.equal(prepareDiscard(G, ME, "apple", "1").equipped, false);
});

test("fluxo completo: botão, modal, confirmação e descarte", async () => {
    reset(0);
    giveItem("apple", 6);

    // 1) botão Descartar abre o modal
    const modal = handlePanelClick(click(`inv:drop:${ME}`));

    assert.equal(modal.type, "modal");
    assert.equal(modal.data.customId, "inv:descartar");
    assert.deepEqual(modal.data.fields.map(f => f.customId), ["item", "quantidade"]);

    // 2) o envio mostra a confirmação, com botões, só para a pessoa
    const confirm = await send(submit("inv:descartar", { item: "maca", quantidade: "metade" }));

    assert.equal(confirm.data.ephemeral, true);
    assert.match(titleOf(confirm), /Descartar itens\?/);
    assert.match(textOf(confirm), /3× 🍎 Maçã/);

    const buttons = allButtons(confirm.data.components);

    assert.deepEqual(buttons.map(b => b.customId), [`inv:ok:${ME}:apple:3`, `inv:cancel:${ME}`]);
    assert.equal(owned("apple"), 6, "nada foi descartado ainda");

    // 3) confirmar descarta
    const done = handlePanelClick(click(`inv:ok:${ME}:apple:3`));

    assert.equal(done.type, "update");
    assert.match(done.data.embeds[0].title, /descartados/);
    assert.deepEqual(done.data.components, [], "os botões somem");
    assert.equal(owned("apple"), 3);
});

test("cancelar não descarta", () => {
    reset(0);
    giveItem("apple", 2);

    const response = handlePanelClick(click(`inv:cancel:${ME}`));

    assert.match(response.data.embeds[0].title, /cancelado/);
    assert.equal(owned("apple"), 2);
});

test("confirmar depois de vender recusa, sem descontar errado", () => {
    reset(0);
    giveItem("apple", 2);

    // a pessoa abriu a confirmação de 5, mas só tem 2
    const response = handlePanelClick(click(`inv:ok:${ME}:apple:5`));

    assert.match(response.data.embeds[0].title, /Não foi possível/);
    assert.equal(owned("apple"), 2);
});

test("descartar a arma equipada tira o equipamento", () => {
    reset(0);
    giveItem("revolver", 1);
    equipWeapon(G, ME, "revolver");

    assert.ok(getEquippedWeapon(G, ME));

    handlePanelClick(click(`inv:ok:${ME}:revolver:1`));

    assert.equal(owned("revolver"), 0);
    assert.equal(getEquippedWeapon(G, ME), null);
});

test("preso, o botão de confirmar também é bloqueado", () => {
    reset(0);
    giveItem("apple", 2);

    imprison(G, ME, 1800, "teste", Math.floor(Date.now() / 1000));

    const response = handlePanelClick(click(`inv:ok:${ME}:apple:1`));

    assert.match(titleOf(response), /Você está preso/);
    assert.equal(owned("apple"), 2);
});

test("descarte inválido pelo modal não chega à confirmação", async () => {
    reset(0);
    giveItem("apple", 2);

    assert.match(titleOf(await send(submit("inv:descartar", { item: "xyz", quantidade: "1" }))), /não encontrado/);
    assert.match(titleOf(await send(submit("inv:descartar", { item: "apple", quantidade: "9" }))), /Quantidade inválida/);
    assert.match(titleOf(await send(submit("inv:descartar", { item: "", quantidade: "1" }))), /Faltou o item/);
});

// ==========================================
// COMANDOS
// ==========================================

const run = await createPrefixRunner({
    guildId: G,
    author: { id: ME, username: "eu", displayName: "Eu Mesmo" }
});

test("hloja mostra o painel; hloja categoria já abre na categoria", async () => {
    reset(5000);

    // sem categoria: a vitrine inicial, sem itens
    const home = await run("hloja");

    assert.match(home.title, /Helena Loja/);
    assert.ok(ids(home.components).includes(`loja:cat:${ME}`));
    assert.ok(ids(home.components).includes(`loja:pg:${ME}:todas:1`), "Ver tudo");
    assert.equal(allButtons(home.components).filter(b => b.customId.startsWith("loja:item:")).length, 0);

    // com categoria: já abre nas prateleiras, com os 5 itens
    const weapons = await run("hloja categoria:weapon");

    assert.match(JSON.parse(weapons.text).embeds[0].description, /Armas/);
    assert.equal(allButtons(weapons.components).filter(b => b.customId.startsWith("loja:item:")).length, 5);

    // categoria inexistente: o próprio parser do prefixo recusa
    assert.match((await run("hloja categoria:xyz")).body, /inválido/i);
});

test("hinventario e hinv mostram o painel; hdescartar pede confirmação", async () => {
    reset(0);
    giveItem("apple", 4);

    const inv = await run("hinventario");

    assert.match(inv.title, /Helena Inventário/);
    assert.ok(ids(inv.components).includes(`inv:drop:${ME}`));
    assert.equal((await run("hinv")).title, inv.title);

    const drop = await run("hdescartar maçã 2");

    assert.match(drop.title, /Descartar itens\?/);
    assert.deepEqual(
        allButtons(drop.components).map(b => b.customId),
        [`inv:ok:${ME}:apple:2`, `inv:cancel:${ME}`]
    );
    assert.equal(owned("apple"), 4, "o comando só pede confirmação");

    assert.match((await run("hdescartar xyz")).title, /Item não encontrado/);
});

test("alias store abre a mesma loja", async () => {
    assert.equal(resolverComando(comandos, "store")?.name, "loja");

    reset(5000);

    assert.equal((await run("hstore")).title, "🛒 Helena Loja");
});

test("aliases de descartar", () => {
    assert.equal(resolverComando(comandos, "dropitem")?.name, "descartar");
    assert.equal(resolverComando(comandos, "jogaritem")?.name, "descartar");
});

test("preso não usa o descartar nem por comando", async () => {
    reset(0);
    giveItem("apple", 2);

    imprison(G, ME, 1800, "teste", Math.floor(Date.now() / 1000));

    assert.match((await run("hdescartar apple")).title, /Você está preso/);
});
