process.env.HELENA_OWNER_ID = "777000000000000001";

import { set, getPlayer, createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const {
    buildShopHome, buildShopView, shopCategories, buyableItems, ALL_CATEGORIES, SHOP_PAGE_SIZE
} = await import("../services/panels/shop-view.mjs");

const { layoutProblems, countComponents, toV2Data } = await import("../utils/components-v2.mjs");
const { handlePanelClick } = await import("../services/panels/panels.mjs");

const G = "900000000000000001";
const OWNER = "111111111111111111";
const ME = { id: OWNER, username: "eu", displayName: "Eu Mesmo", avatarUrl: "https://cdn.exemplo.test/eu.png" };

const sectionsOf = layout => layout[0].components.filter(component => component.type === "section");
const rowsOf = layout => layout[0].components.filter(component => component.type === "row");
const buttonsOf = layout => JSON.stringify(layout).match(/"customId":"[^"]+"/g).map(text => text.slice(12, -1));

// ==========================================
// VITRINE
// ==========================================

test("vitrine no V2: título com a imagem da Helena, quem olha, carteira e gemas, e uma seção por prateleira", () => {
    const view = buildShopHome({ ownerId: OWNER, wallet: 1_000, gems: 26 });

    assert.deepEqual(layoutProblems(view.layout), []);

    const [head, ...rest] = view.layout[0].components;

    assert.equal(head.type, "section");
    assert.equal(head.texts[0], "## 🛒 Loja da Helena");
    assert.equal(head.texts[1], "Escolha uma prateleira.");
    assert.equal(head.texts[2], `👛 ${"R$ 10,00".replace(" ", " ")} · 💎 26`);
    assert.equal(head.accessory.type, "thumbnail");
    assert.match(head.accessory.url, /^https:\/\/.*\/assets\/img\/apple-touch-icon\.png$/);

    // uma seção por prateleira (sem a "Todas"), cada uma com o botão Entrar à direita
    const shelves = shopCategories().slice(1);
    const sections = sectionsOf(view.layout).slice(1);

    assert.equal(sections.length, shelves.length);

    sections.forEach((section, index) => {
        const shelf = shelves[index];

        assert.equal(section.texts[0], `**${shelf.emoji} ${shelf.label}**`);
        assert.match(section.texts[1], /^\d+ (item|itens) · a partir de R\$/);
        assert.equal(section.accessory.type, "button");
        assert.equal(section.accessory.label, "Entrar");
        assert.equal(section.accessory.customId, `loja:pg:${OWNER}:${shelf.value}:1`, "o mesmo clique do desenho clássico");
    });

    // embaixo: ver tudo, por nome, vender e fechar
    const tools = rowsOf(view.layout)[0].components;

    assert.deepEqual(tools.map(component => component.label), ["Ver tudo", "Por nome", "Vender", "Fechar"]);
    assert.equal(tools[0].customId, `loja:pg:${OWNER}:${ALL_CATEGORIES}:1`);
});

test("a vitrine continua com o embed e o menu de antes (o clássico não muda)", () => {
    const view = buildShopHome({ ownerId: OWNER, wallet: 1_000, gems: 0 });

    assert.equal(view.embed.title, "🛒 Helena Loja");
    assert.equal(view.components[0].components[0].type, "select");
    assert.ok(view.layout, "e traz o layout V2");
});

// ==========================================
// PRATELEIRAS
// ==========================================

test("toda prateleira e toda página cabem nas regras do V2 (40 componentes, IDs únicos)", () => {
    for (const shelf of shopCategories()) {
        const pages = Math.max(1, Math.ceil(buyableItems(shelf.value).length / SHOP_PAGE_SIZE));

        for (let page = 1; page <= pages; page++) {
            const view = buildShopView({ ownerId: OWNER, category: shelf.value, page, wallet: 500_000, gems: 3 });

            assert.deepEqual(layoutProblems(view.layout), [], `${shelf.value} página ${page}`);
            assert.ok(countComponents(view.layout) <= 40, `${shelf.value} página ${page}: ${countComponents(view.layout)} componentes`);

            const ids = buttonsOf(view.layout);

            assert.equal(new Set(ids).size, ids.length, "customId repetido");
        }
    }
});

test("prateleira: um item por seção, com o Comprar à direita e o preço e o que a carteira permite", () => {
    const view = buildShopView({ ownerId: OWNER, category: "consumable", page: 1, wallet: 500, gems: 0, owned: { apple: 2 } });

    const items = sectionsOf(view.layout);

    assert.equal(items.length, buyableItems("consumable").length);

    const apple = items.find(section => section.texts[0].includes("Maçã"));

    assert.match(apple.texts[0], /^\*\*.+ Maçã\*\* · \*\*R\$\s3,00\*\*$/);
    assert.match(apple.texts[1], /Você pode comprar até \*\*\d+\*\*/);
    assert.match(apple.texts[1], /🎒 2\/99/);
    assert.equal(apple.accessory.customId, `loja:item:${OWNER}:apple`, "abre o mesmo modal de quantidade de antes");
    assert.equal(apple.accessory.label, "Comprar");
    assert.equal(apple.accessory.style, "success");

    // sem dinheiro o botão fica discreto (continua abrindo o modal, que explica o que falta)
    const poor = buildShopView({ ownerId: OWNER, category: "consumable", page: 1, wallet: 0, gems: 0 });
    const poorApple = sectionsOf(poor.layout).find(section => section.texts[0].includes("Maçã"));

    assert.equal(poorApple.accessory.style, "secondary");
    assert.match(poorApple.texts[1], /Faltam/);
});

test("armas mostram o dano; a navegação desliga Anterior na primeira página e Próxima na última", () => {
    const first = buildShopView({ ownerId: OWNER, category: "weapon", page: 1, wallet: 0, gems: 0 });

    assert.match(JSON.stringify(first.layout), /⚔️ Dano: /);

    const nav = rowsOf(first.layout)[0].components;

    assert.equal(nav[0].disabled, true, "Anterior desligado na página 1");
    assert.equal(nav[2].disabled, false);
    assert.equal(nav[1].label, "1/3");

    const last = buildShopView({ ownerId: OWNER, category: "weapon", page: 3, wallet: 0, gems: 0 });

    assert.equal(rowsOf(last.layout)[0].components[2].disabled, true, "Próxima desligada na última");
    assert.equal(rowsOf(last.layout)[1].components[0].customId, `loja:home:${OWNER}`);
});

// ==========================================
// DO COMANDO AO CLIQUE
// ==========================================

test("pelo prefixo, com o V2 ligado, a loja sai como seções com botão; desligado, como sempre", async () => {
    const run = await createPrefixRunner({ guildId: G, author: ME });

    const classic = (await run("hloja")).sent[0];

    assert.ok(!("layout" in classic), "o clássico nunca leva o layout");
    assert.equal(classic.embeds[0].title, "🛒 Helena Loja");

    const before = process.env.HELENA_V2;

    process.env.HELENA_V2 = "on";

    try {
        const v2 = (await run("hloja")).sent[0];

        assert.ok(!v2.embeds, "sem embed no V2");
        assert.equal(v2.components[0].type, "container");
        assert.ok(v2.components[0].components.some(component => component.type === "section" && component.accessory.label === "Entrar"));
        assert.deepEqual(layoutProblems(v2.components), []);

    } finally {
        if (before === undefined) delete process.env.HELENA_V2;
        else process.env.HELENA_V2 = before;
    }
});

test("entrar numa prateleira pelo botão atualiza a mesma mensagem, com o layout novo e o clássico", () => {
    getPlayer(G, OWNER);

    set("UPDATE players SET wallet = 50000 WHERE guild_id = ? AND user_id = ?", G, OWNER);

    const click = handlePanelClick({
        guildId: G,
        user: ME,
        data: { customId: `loja:pg:${OWNER}:consumable:1` }
    });

    assert.equal(click.type, "update");
    assert.ok(Array.isArray(click.data.layout));
    assert.match(click.data.embeds[0].title, /Consumíveis/);

    // e no V2 o update leva só o layout (o clássico antigo é esvaziado)
    const v2 = toV2Data(click.data, { clear: true });

    assert.equal(v2.body, "");
    assert.deepEqual(v2.embeds, []);
    assert.equal(v2.components[0].type, "container");
    assert.ok(!("layout" in v2));
});
