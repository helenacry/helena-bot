process.env.HELENA_OWNER_ID = "777000000000000001";

import { set, getPlayer, createPrefixRunner, receiptOf } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// O desenho V2 próprio do /saldo e da central de ajuda (o clássico continua igual).

const { carregarComandos } = await import("../command-registry.mjs");
const { handlePanelClick } = await import("../services/panels/panels.mjs");
const { buildBalance } = await import("../services/economy/balance-view.mjs");
const { bankPanel } = await import("../services/panels/panels.mjs");
const { layoutProblems, countComponents, toV2Data } = await import("../utils/components-v2.mjs");
const { getCatalog } = await import("../services/platform/command-catalog.mjs");
const { buildHelpHome, buildHelpCategory } = await import("../services/panels/help-view.mjs");

const silently = async fn => {
    const log = console.log;
    console.log = () => {};

    try { return await fn(); } finally { console.log = log; }
};

await silently(() => carregarComandos());

const catalog = getCatalog();

const G = "900000000000000001";
const OWNER = "111111111111111111";
const OTHER = "222222222222222222";
const ME = { id: OWNER, username: "eu", displayName: "Eu Mesmo", avatarUrl: "https://cdn.exemplo.test/eu.png" };

const run = await createPrefixRunner({ guildId: G, author: ME });

const allText = layout => JSON.stringify(layout).replace(/ /g, " ");

const customIds = layout => (JSON.stringify(layout).match(/"customId":"[^"]+"/g) ?? []).map(text => text.slice(12, -1));

const withV2 = async fn => {
    const before = process.env.HELENA_V2;

    process.env.HELENA_V2 = "on";

    try { return await fn(); } finally {
        if (before === undefined) delete process.env.HELENA_V2;
        else process.env.HELENA_V2 = before;
    }
};

// ==========================================
// /SALDO
// ==========================================

const player = (extra = {}) => ({ wallet: 123_450, bank: 500_000, gems: 7, level: 4, xp: 320, dirty_money: 0, ...extra });

test("saldo no V2: avatar ao lado do título, contas em linhas, patrimônio grande e os botões", () => {
    const view = buildBalance({ player: player(), username: "Eu Mesmo", avatarUrl: ME.avatarUrl, controls: bankPanel(OWNER) });

    assert.deepEqual(layoutProblems(view.layout), []);

    const [head, ...rest] = view.layout[0].components;

    assert.equal(head.type, "section");
    assert.equal(head.texts[0], "-# HELENA · BANCO");
    assert.equal(head.texts[1], "## 🏦 Extrato de Eu Mesmo");
    assert.equal(head.texts[2], "-# nível **4** · 320 XP");
    assert.equal(head.accessory.type, "thumbnail");
    assert.equal(head.accessory.url, ME.avatarUrl);

    const text = allText(view.layout);

    // as contas vão num recibo; o patrimônio, em letra grande logo abaixo
    assert.match(text, /Carteira ·+ R\$ 1\.234,50/);
    assert.match(text, /Banco ·+ R\$ 5\.000,00/);
    assert.match(text, /Gemas ·+ 7/);
    assert.match(text, /-# 💰 Patrimônio total\\n# R\$ 6\.234,50/);
    assert.doesNotMatch(text, /━━/, "o enfeite antigo não existe mais");
    assert.doesNotMatch(text, /Dinheiro sujo/);

    assert.deepEqual(customIds(view.layout), [`banco:dep:${OWNER}`, `banco:sac:${OWNER}`, `banco:trf:${OWNER}`]);
});

test("saldo: dinheiro sujo só aparece para quem tem, e fica fora do patrimônio", () => {
    const view = buildBalance({ player: player({ dirty_money: 90_000 }), controls: [] });

    assert.match(allText(view.layout), /Dinheiro sujo ·+ R\$ 900,00/);
    assert.match(allText(view.layout), /# R\$ 6\.234,50/);

    // no clássico também: a linha existe e o patrimônio não a soma
    const rows = receiptOf(view.embed);

    assert.match(rows["Dinheiro sujo"], /R\$ 900,00/);
    assert.match(rows["Patrimônio"], /R\$ 6\.234,50/);
});

test("saldo sem avatar https não leva miniatura (o título fica solto)", () => {
    const view = buildBalance({ player: player(), avatarUrl: "http://exemplo.test/a.png", controls: [] });

    assert.deepEqual(layoutProblems(view.layout), []);
    assert.equal(view.layout[0].components[0].type, "text");
});

test("o clássico do saldo é o extrato: um recibo na descrição, sem campos soltos", () => {
    const view = buildBalance({ player: player(), username: "Eu Mesmo", controls: [] });

    assert.equal(view.embed.title, "🏦 Extrato de Eu Mesmo");
    assert.match(view.embed.description, /nível \*\*4\*\* · 320 XP/);

    assert.deepEqual(Object.keys(receiptOf(view.embed)), ["Carteira", "Banco", "Gemas", "Patrimônio"]);
    assert.deepEqual(view.embed.fields, []);
});

test("/saldo: classic com embed e botões; V2 com o layout; o layout nunca vai no clássico", async () => {
    getPlayer(G, OWNER);

    set("UPDATE players SET wallet = 250000 WHERE guild_id = ? AND user_id = ?", G, OWNER);

    const classic = (await run("hsaldo")).sent[0];

    assert.ok(!("layout" in classic));
    assert.equal(classic.embeds[0].title, "🏦 Extrato de Eu Mesmo");
    assert.equal(classic.components[0].components.length, 3);

    await withV2(async () => {
        const v2 = (await run("hsaldo")).sent[0];

        assert.ok(!v2.embeds);
        assert.equal(v2.components[0].type, "container");
        assert.equal(v2.components[0].components[0].accessory.type, "thumbnail");
        assert.match(allText(v2.components), /# R\$ 2\.500,00/);
        assert.deepEqual(layoutProblems(v2.components), []);
    });
});

// ==========================================
// CENTRAL DE AJUDA
// ==========================================

test("ajuda no V2: uma seção por categoria com o botão Abrir, o mesmo clique do menu de antes", () => {
    const view = buildHelpHome({ ownerId: OWNER, catalog });

    assert.deepEqual(layoutProblems(view.layout), []);

    const sections = view.layout[0].components.filter(component => component.type === "section");

    assert.equal(sections.length, catalog.categories.length);

    sections.forEach((section, index) => {
        const category = catalog.categories[index];

        assert.match(section.texts[0], new RegExp(`^\\*\\*${category.emoji} ${category.label}\\*\\* · \\d+ comandos?$`, "u"));
        assert.equal(section.accessory.label, "Abrir");
        assert.equal(section.accessory.customId, `ajuda:pg:${OWNER}:${category.id}:1`);
    });

    // Buscar e Fechar embaixo, e o rodapé fora do container
    assert.match(allText(view.layout), /ajuda:buscar:/);
    assert.match(allText(view.layout), /ajuda:fechar:/);
    assert.match(view.layout[1].content, /^-# \d+ comandos no total$/);

    // o clássico continua com o menu
    assert.equal(view.components[0].components[0].type, "select");
});

test("toda categoria e toda página da ajuda cabem nos limites do V2, com IDs únicos", () => {
    for (const category of catalog.categories) {
        for (let page = 1; page <= Math.ceil(category.commands.length / 6); page++) {
            const view = buildHelpCategory({ ownerId: OWNER, catalog, categoryId: category.id, page });

            assert.deepEqual(layoutProblems(view.layout), [], `${category.id} p${page}`);
            assert.ok(countComponents(view.layout) <= 40, `${category.id} p${page}`);

            const ids = customIds(view.layout);

            assert.equal(new Set(ids).size, ids.length, `${category.id} p${page}: IDs repetidos`);

            // um botão Ver por comando da página
            const sections = view.layout[0].components.filter(component => component.type === "section");

            assert.equal(sections.length, Math.min(6, category.commands.length - (page - 1) * 6));

            sections.forEach(section => {
                assert.equal(section.accessory.label, "Ver");
                assert.match(section.accessory.customId, new RegExp(`^ajuda:ver:${OWNER}:${category.id}:${page}:[a-z0-9_-]+$`));
                assert.ok(section.accessory.customId.length <= 100);
            });
        }
    }
});

test("a seção de cada comando traz o nome, os atalhos, a descrição e o uso", () => {
    const view = buildHelpCategory({ ownerId: OWNER, catalog, categoryId: "economia", page: 1 });

    const first = view.layout[0].components.find(component => component.type === "section");

    const entry = catalog.categories.find(category => category.id === "economia").commands[0];

    assert.match(first.texts[0], new RegExp(`^\\*\\*/${entry.name}\\*\\*`));
    assert.match(first.texts[1], new RegExp(entry.description.slice(0, 20).replace(/[()]/g, "\\$&")));
    assert.match(first.texts[1], /`\/[a-z]+/);
});

test("o botão Ver abre o detalhe do comando e o Voltar leva à mesma página", () => {
    const click = (customId, userId = OWNER) => handlePanelClick({
        guildId: G,
        user: { id: userId },
        data: { customId }
    });

    const view = buildHelpCategory({ ownerId: OWNER, catalog, categoryId: "economia", page: 2 });

    const ver = view.layout[0].components.find(component => component.type === "section").accessory.customId;

    const opened = click(ver);

    assert.equal(opened.type, "update");
    assert.match(opened.data.embeds[0].title, /^.+ \/[a-z]+$/u);
    assert.match(JSON.stringify(opened.data.components), new RegExp(`ajuda:pg:${OWNER}:economia:2`));

    // só quem abriu a ajuda
    assert.match(JSON.stringify(click(ver, OTHER)), /outra pessoa/);

    // comando que não existe mais
    assert.match(JSON.stringify(click(`ajuda:ver:${OWNER}:economia:1:naoexiste`)), /não existe mais/);
});

test("/ajuda no V2: sai o layout, sem embed, e o clique segue o layout; no clássico nada muda", async () => {
    const classic = (await run("hajuda")).sent[0];

    assert.ok(!("layout" in classic));
    assert.equal(classic.embeds[0].title, "📖 Central de ajuda");

    await withV2(async () => {
        const v2 = (await run("hajuda")).sent[0];

        assert.ok(!v2.embeds);
        assert.equal(v2.components[0].type, "container");
        assert.deepEqual(layoutProblems(v2.components), []);

        const abrir = v2.components[0].components.find(component => component.type === "section");

        const click = handlePanelClick({ guildId: G, user: ME, data: { customId: abrir.accessory.customId } });

        // o clique atualiza a mensagem com a categoria, em V2 sem o clássico antigo
        const next = toV2Data(click.data, { clear: true });

        assert.equal(next.components[0].type, "container");
        assert.deepEqual(next.embeds, []);
        assert.match(allText(next.components), /Toque em \*\*Ver\*\*/);
    });
});
