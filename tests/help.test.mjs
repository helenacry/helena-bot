import { createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// A central de ajuda (/ajuda): o catálogo vem dos comandos que o bot carregou,
// então estes testes conferem que ele cobre tudo, que cada tela cabe nos limites
// do Discord e que a navegação e a busca funcionam.

const { carregarComandos, comandosCarregados, resolverComando } = await import("../command-registry.mjs");
const { handlePanelClick, handleModalSubmit } = await import("../services/panels/panels.mjs");
const { COMMAND_CATEGORIES, HIDDEN_FOLDERS, HIDDEN_COMMANDS } = await import("../config/command-categories.mjs");
const { HELP_CONFIG } = await import("../config/help.mjs");
const { collectSiteData } = await import("../scripts/site/data-source.mjs");

const catalogModule = await import("../services/platform/command-catalog.mjs");
const viewModule = await import("../services/panels/help-view.mjs");

const { getCatalog, findCommand, searchCommands, usageOf, buildCatalog } = catalogModule;
const { buildHelpHome, buildHelpCategory, buildHelpCommand, buildHelpSearch, buildHelpClosed, pagesOf } = viewModule;

const silently = async fn => {
    const log = console.log;
    const error = console.error;
    console.log = () => {};
    console.error = () => {};

    try { return await fn(); } finally { console.log = log; console.error = error; }
};

const comandos = await silently(() => carregarComandos());

const catalog = getCatalog();

const OWNER = "111111111111111111";
const OTHER = "222222222222222222";
const G = "g-help";

// ==========================================
// FERRAMENTAS
// ==========================================

const flat = components => components.flatMap(rowItem => rowItem.components);
const buttons = components => flat(components).filter(item => item.type === "button");
const selects = components => flat(components).filter(item => item.type === "select");
const idsOf = components => flat(components).map(item => item.customId);
const text = view => JSON.stringify(view.embed);

// Cada tela precisa caber nos limites (o createEmbed corta em silêncio, então
// valor no limite exato quer dizer que algo foi cortado).
function assertFits(view, label) {
    const { embed, components } = view;

    assert.ok(embed.title.length > 0 && embed.title.length <= 256, `${label}: título`);
    assert.ok(embed.description.length < 4096, `${label}: descrição (${embed.description.length})`);
    assert.ok(embed.fields.length <= 25, `${label}: campos`);
    assert.ok(embed.footer.text.length < 2048, `${label}: rodapé`);

    for (const field of embed.fields) {
        assert.ok(field.name.length > 0 && field.name.length < 256, `${label}: nome de campo`);
        assert.ok(field.value.length > 0 && field.value.length < 1024, `${label}: campo "${field.name}" (${field.value.length})`);
    }

    assert.ok(components.length <= 5, `${label}: linhas de componentes`);

    for (const rowItem of components) {
        assert.ok(rowItem.components.length >= 1 && rowItem.components.length <= 5, `${label}: componentes por linha`);
    }

    const ids = idsOf(components);

    assert.equal(new Set(ids).size, ids.length, `${label}: customId repetido`);

    for (const id of ids) {
        assert.ok(id.length <= 100, `${label}: customId grande demais (${id.length})`);
    }

    for (const menu of selects(components)) {
        assert.ok(menu.options.length >= 1 && menu.options.length <= 25, `${label}: opções do menu`);

        for (const option of menu.options) {
            assert.ok(option.label.length >= 1 && option.label.length <= 100, `${label}: rótulo da opção`);
            assert.ok((option.description ?? "").length <= 100, `${label}: descrição da opção`);
        }
    }
}

let sequence = 0;

const user = id => ({ id, username: "eu", displayName: "Eu Mesmo" });

const click = (customId, { userId = OWNER, values } = {}) => ({
    id: "c" + (++sequence), guildId: G, channelId: "c1",
    user: user(userId), data: { customId, ...(values ? { values } : {}) }
});

const submit = (customId, fields, userId = OWNER) => ({
    id: "s" + (++sequence), guildId: G, channelId: "c1", user: user(userId),
    data: {
        customId,
        fields: Object.entries(fields).map(([id, value]) => ({ customId: id, value }))
    }
});

const slash = (options = {}, userId = OWNER) => ({
    id: "i" + (++sequence), guildId: G, channelId: "c1", user: user(userId), data: { options }
});

const runHelp = options => silently(() => resolverComando(comandos, "ajuda").execute(slash(options)));

const embedOf = response => response.data.embeds[0];

// ==========================================
// CATÁLOGO
// ==========================================

test("o catálogo lista todos os comandos públicos, uma vez só, sem os de admin, dev e teste", () => {
    const { origem } = comandosCarregados();

    const expected = [...comandos.keys()]
        .filter(name => {
            const folder = origem.get(name).split("/")[0];

            return !HIDDEN_FOLDERS.has(folder) && !HIDDEN_COMMANDS.has(name);
        })
        .sort();

    const listed = catalog.categories.flatMap(category => category.commands.map(entry => entry.name));

    assert.deepEqual([...listed].sort(), expected, "a ajuda mostra exatamente os comandos públicos");
    assert.equal(new Set(listed).size, listed.length, "nenhum comando em duas categorias");
    assert.equal(catalog.total, expected.length);

    assert.ok(listed.length > 40);

    for (const hidden of ["admingemas", "devgive", "testembed", "devbackup"]) {
        assert.ok(!listed.includes(hidden), `/${hidden} não aparece`);
    }
});

test("as categorias da ajuda são as mesmas do site, com os mesmos comandos", async () => {
    const site = await collectSiteData();

    assert.deepEqual(
        catalog.categories.map(category => [category.id, category.commands.map(entry => entry.name)]),
        site.categories.map(category => [category.id, category.commands.map(entry => entry.name)])
    );
});

test("cada categoria tem texto de apresentação e os ids são os da configuração", () => {
    for (const category of catalog.categories) {
        assert.ok(COMMAND_CATEGORIES.some(item => item.id === category.id));
        assert.ok(HELP_CONFIG.blurbs[category.id], `${category.id} tem texto`);
    }

    for (const id of Object.keys(HELP_CONFIG.blurbs)) {
        assert.ok(COMMAND_CATEGORIES.some(item => item.id === id), `${id} é uma categoria`);
    }
});

test("o catálogo se monta de qualquer carga de comandos (comando novo entra sozinho)", () => {
    const fake = new Map([
        ["novo", { name: "novo", description: "Um comando novo", options: [] }],
        ["adminxx", { name: "adminxx", description: "Só do dono", options: [] }]
    ]);

    const built = buildCatalog(fake, new Map([["novo", "economy/novo.mjs"], ["adminxx", "admin/adminxx.mjs"]]));

    assert.deepEqual(built.categories.map(category => [category.id, category.commands.map(entry => entry.name)]), [["economia", ["novo"]]]);
});

// ==========================================
// ACHAR COMANDOS
// ==========================================

test("findCommand acha pelo nome, com barra, pelo atalho e pelo prefixo", () => {
    assert.equal(findCommand(catalog, "daily").name, "daily");
    assert.equal(findCommand(catalog, "/daily").name, "daily");
    assert.equal(findCommand(catalog, "  /DAILY ").name, "daily");
    assert.equal(findCommand(catalog, "bal").name, "saldo", "atalho");
    assert.equal(findCommand(catalog, "hdaily").name, "daily", "como se digita no prefixo");
    assert.equal(findCommand(catalog, "help").name, "ajuda");

    // nomes que já começam com h valem como são, antes de se tirar o h
    assert.equal(findCommand(catalog, "historico").name, "historico");
    assert.equal(findCommand(catalog, "hospital").name, "hospital");

    assert.equal(findCommand(catalog, "xyz"), null);
    assert.equal(findCommand(catalog, ""), null);
    assert.equal(findCommand(catalog, "/"), null);
});

test("a busca acha por nome, atalho e descrição, sem acento, e exige todos os termos", () => {
    assert.equal(searchCommands(catalog, "daily")[0].name, "daily", "o nome vem primeiro");
    assert.equal(searchCommands(catalog, "BAL")[0].name, "saldo", "pelo atalho, sem diferenciar maiúsculas");

    const dirty = searchCommands(catalog, "dinheiro sujo").map(entry => entry.name);

    assert.ok(dirty.includes("lavagem") && dirty.includes("crime"), `dinheiro sujo: ${dirty}`);

    assert.ok(searchCommands(catalog, "inventario").some(entry => entry.name === "inventario"), "sem acento");
    assert.ok(searchCommands(catalog, "inventário").some(entry => entry.name === "inventario"), "com acento");

    assert.deepEqual(searchCommands(catalog, "dinheiro zzzzz"), [], "todos os termos precisam aparecer");
    assert.deepEqual(searchCommands(catalog, "zzzzz"), []);
    assert.deepEqual(searchCommands(catalog, "   "), []);

    assert.equal(searchCommands(catalog, "o", 3).length, 3, "respeita o limite");
});

test("como usar: obrigatórias entre < > e opcionais entre [ ]", () => {
    assert.deepEqual(usageOf(findCommand(catalog, "transferir")), {
        slash: "/transferir <usuario> <quantia>",
        prefix: "htransferir <usuario> <quantia>"
    });

    assert.equal(usageOf(findCommand(catalog, "lavagem")).slash, "/lavagem [valor] [tipo]");
    assert.equal(usageOf(findCommand(catalog, "ping")).slash, "/ping");
});

// ==========================================
// TELAS
// ==========================================

test("o início tem o menu de categorias, a busca, o como usar e a wiki", () => {
    const view = buildHelpHome({ ownerId: OWNER, catalog });

    assertFits(view, "início");

    assert.match(view.embed.title, /Central de ajuda/);
    assert.match(view.embed.description, /`\/daily`/);
    assert.match(view.embed.description, /`hdaily`/);
    assert.match(view.embed.description, /<assim>/);

    const categories = view.embed.fields.slice(0, -1);

    assert.equal(categories.length, catalog.categories.length);

    categories.forEach((field, index) => {
        const category = catalog.categories[index];

        assert.ok(field.name.includes(category.label));
        assert.ok(field.value.includes(`${category.commands.length} comando`));
    });

    assert.equal(view.embed.fields.at(-1).name, "📚 Wiki e site");
    assert.ok(view.embed.fields.at(-1).value.includes(HELP_CONFIG.wikiUrl));

    const [menu] = selects(view.components);

    assert.equal(menu.customId, `ajuda:cat:${OWNER}`);
    assert.deepEqual(menu.options.map(option => option.value), catalog.categories.map(category => category.id));

    assert.deepEqual(buttons(view.components).map(item => item.customId), [`ajuda:buscar:${OWNER}`, `ajuda:fechar:${OWNER}`]);
});

test("a ajuda nunca mais diz que os comandos 'serão adicionados em breve'", () => {
    for (const category of catalog.categories) {
        const view = buildHelpCategory({ ownerId: OWNER, catalog, categoryId: category.id });

        assert.doesNotMatch(text(view), /em breve/i, category.id);
        assert.ok(view.embed.fields.length > 0, `${category.id} lista comandos`);
    }
});

test("cada página de cada categoria cabe nos limites e lista os comandos certos", () => {
    for (const category of catalog.categories) {
        const pages = pagesOf(category);

        const seen = [];

        for (let page = 1; page <= pages; page++) {
            const view = buildHelpCategory({ ownerId: OWNER, catalog, categoryId: category.id, page });

            assertFits(view, `${category.id} p${page}`);

            const names = view.embed.fields.map(field => field.name.slice(1));

            seen.push(...names);

            assert.ok(names.length <= HELP_CONFIG.pageSize);

            // o menu de comandos tem exatamente os comandos da página
            const menu = selects(view.components).find(item => item.customId.startsWith("ajuda:cmd:"));

            assert.deepEqual(menu.options.map(option => option.value), names, `${category.id} p${page}: menu`);

            const nav = buttons(view.components);

            assert.equal(nav.find(item => item.label === "Anterior").disabled === true, page === 1);
            assert.equal(nav.find(item => item.label === "Próxima").disabled === true, page === pages);
        }

        assert.deepEqual(seen, category.commands.map(entry => entry.name), `${category.id}: todas as páginas juntas`);
    }
});

test("página fora do intervalo vira a mais próxima, e categoria desconhecida dá null", () => {
    const economy = catalog.categories.find(category => category.id === "economia");

    assert.equal(buildHelpCategory({ ownerId: OWNER, catalog, categoryId: "economia", page: 999 }).page, pagesOf(economy));
    assert.equal(buildHelpCategory({ ownerId: OWNER, catalog, categoryId: "economia", page: -4 }).page, 1);
    assert.equal(buildHelpCategory({ ownerId: OWNER, catalog, categoryId: "economia", page: "x" }).page, 1);
    assert.equal(buildHelpCategory({ ownerId: OWNER, catalog, categoryId: "inexistente" }), null);
});

test("o detalhe de TODO comando público cabe nos limites e traz como usar", () => {
    for (const category of catalog.categories) {
        for (const entry of category.commands) {
            const view = buildHelpCommand({ ownerId: OWNER, catalog, entry });

            assertFits(view, `/${entry.name}`);

            const usage = usageOf(entry);

            assert.match(text(view), new RegExp(usage.slash.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&")));

            assert.equal(view.embed.title.includes(`/${entry.name}`), true);
            assert.equal(view.embed.description, entry.description);
        }
    }
});

test("o detalhe mostra opções com os valores, atalhos, categoria e o bloqueio na cadeia", () => {
    const laundering = buildHelpCommand({ ownerId: OWNER, catalog, entry: findCommand(catalog, "lavagem") });

    const options = laundering.embed.fields.find(field => field.name === "⚙️ Opções").value;

    assert.match(options, /`valor` \(opcional, texto\)/);
    assert.match(options, /`tipo` \(opcional, texto\)/);
    assert.match(options, /Valores: `publica`, `privada`/);

    assert.match(laundering.embed.fields.find(field => field.name === "🔁 Atalhos").value, /`\/lavar`/);
    assert.match(laundering.embed.fields.find(field => field.name === "📂 Categoria").value, /Crime/);

    const crime = buildHelpCommand({ ownerId: OWNER, catalog, entry: findCommand(catalog, "crime") });
    const ping = buildHelpCommand({ ownerId: OWNER, catalog, entry: findCommand(catalog, "ping") });

    assert.ok(crime.embed.fields.some(field => field.name === "🚔 Na cadeia"), "crime fica bloqueado preso");
    assert.ok(!ping.embed.fields.some(field => field.name === "🚔 Na cadeia"), "ping não");
    assert.ok(!ping.embed.fields.some(field => field.name === "⚙️ Opções"), "ping não tem opções");
});

test("o botão Voltar do detalhe leva à página de onde a pessoa veio, ou ao início", () => {
    const entry = findCommand(catalog, "daily");

    const fromPage = buildHelpCommand({ ownerId: OWNER, catalog, entry, from: { categoryId: "economia", page: 2 } });

    assert.deepEqual(
        buttons(fromPage.components).map(item => item.customId),
        [`ajuda:pg:${OWNER}:economia:2`, `ajuda:buscar:${OWNER}`, `ajuda:home:${OWNER}`, `ajuda:fechar:${OWNER}`]
    );

    const fromSearch = buildHelpCommand({ ownerId: OWNER, catalog, entry, from: { categoryId: "-", page: 1 } });

    assert.deepEqual(
        buttons(fromSearch.components).map(item => item.customId),
        [`ajuda:home:${OWNER}`, `ajuda:buscar:${OWNER}`, `ajuda:fechar:${OWNER}`]
    );
});

test("a tela da busca lista os resultados com um menu para abrir cada um, e orienta quando não acha", () => {
    const found = buildHelpSearch({ ownerId: OWNER, catalog, query: "arma", results: searchCommands(catalog, "arma", 10) });

    assertFits(found, "busca");

    assert.match(found.embed.description, /\*\*arma\*\*/);
    assert.ok(selects(found.components)[0].options.length >= 2);
    assert.equal(selects(found.components)[0].customId, `ajuda:cmd:${OWNER}:-:1`);

    const none = buildHelpSearch({ ownerId: OWNER, catalog, query: "zzzzz", results: [] });

    assertFits(none, "sem resultado");

    assert.match(none.embed.title, /Nada encontrado/);
    assert.match(none.embed.description, /zzzzz/);

    // texto digitado nunca vira formatação nem passa do limite
    const long = buildHelpSearch({ ownerId: OWNER, catalog, query: "x".repeat(500), results: [] });

    assertFits(long, "busca longa");
});

test("fechar troca o painel por um aviso e tira os botões", () => {
    const view = buildHelpClosed();

    assert.deepEqual(view.components, []);
    assert.match(view.embed.description, /\/ajuda/);
});

// ==========================================
// CLIQUES E FORMULÁRIO
// ==========================================

test("o menu de categorias abre a categoria, e os botões navegam entre as páginas", () => {
    const category = handlePanelClick(click(`ajuda:cat:${OWNER}`, { values: ["combate"] }));

    assert.equal(category.type, "update");
    assert.match(category.data.embeds[0].title, /Combate/);
    assert.ok(category.data.embeds[0].fields.some(field => field.name === "/atacar"), "combate lista o /atacar");

    const page2 = handlePanelClick(click(`ajuda:pg:${OWNER}:economia:2`));

    assert.match(page2.data.embeds[0].footer.text, /Página 2\//);

    const home = handlePanelClick(click(`ajuda:home:${OWNER}`));

    assert.match(home.data.embeds[0].title, /Central de ajuda/);

    assert.equal(handlePanelClick(click(`ajuda:noop:${OWNER}`)).type, "defer_update");
});

test("o menu de comandos abre o detalhe, com o Voltar certo", () => {
    const detail = handlePanelClick(click(`ajuda:cmd:${OWNER}:economia:2`, { values: ["daily"] }));

    assert.equal(detail.type, "update");
    assert.match(detail.data.embeds[0].title, /\/daily/);
    assert.ok(idsOf(detail.data.components).includes(`ajuda:pg:${OWNER}:economia:2`), "volta para a página 2 da economia");

    // pelo atalho também abre
    const alias = handlePanelClick(click(`ajuda:cmd:${OWNER}:-:1`, { values: ["bal"] }));

    assert.match(alias.data.embeds[0].title, /\/saldo/);
});

test("só quem abriu o painel mexe nele", () => {
    for (const customId of [`ajuda:home:${OWNER}`, `ajuda:cat:${OWNER}`, `ajuda:pg:${OWNER}:economia:1`, `ajuda:buscar:${OWNER}`, `ajuda:fechar:${OWNER}`]) {
        const response = handlePanelClick(click(customId, { userId: OTHER, values: ["economia"] }));

        assert.equal(response.data.ephemeral, true, customId);
        assert.match(response.data.embeds[0].title, /outra pessoa/, customId);
    }
});

test("fechar, categoria inválida, comando que sumiu e botão desconhecido", () => {
    const closed = handlePanelClick(click(`ajuda:fechar:${OWNER}`));

    assert.equal(closed.type, "update");
    assert.deepEqual(closed.data.components, []);

    assert.match(handlePanelClick(click(`ajuda:cat:${OWNER}`, { values: ["xyz"] })).data.embeds[0].title, /Categoria inválida/);
    assert.match(handlePanelClick(click(`ajuda:pg:${OWNER}:xyz:1`)).data.embeds[0].title, /Categoria inválida/);
    assert.match(handlePanelClick(click(`ajuda:cmd:${OWNER}:-:1`, { values: ["nao-existe"] })).data.embeds[0].title, /Comando não encontrado/);
    assert.match(handlePanelClick(click(`ajuda:abracadabra:${OWNER}`)).data.embeds[0].title, /desconhecido/);
});

test("o botão Buscar abre o formulário, e o envio mostra os resultados só para quem buscou", async () => {
    const modal = handlePanelClick(click(`ajuda:buscar:${OWNER}`));

    assert.equal(modal.type, "modal");

    const json = JSON.stringify(modal);

    assert.match(json, /ajuda:buscar/);
    assert.match(json, /Buscar um comando/);
    assert.match(json, /"termo"/);

    const response = await handleModalSubmit(submit("ajuda:buscar", { termo: "casamento" }), comandos);

    assert.equal(response.data.ephemeral, true);
    assert.match(response.data.embeds[0].title, /Resultado da busca/);
    assert.match(response.data.embeds[0].description, /\/casar/);
    assert.ok(selects(response.data.components).length >= 1);

    const nothing = await handleModalSubmit(submit("ajuda:buscar", { termo: "zzzzz" }), comandos);

    assert.match(nothing.data.embeds[0].title, /Nada encontrado/);

    const short = await handleModalSubmit(submit("ajuda:buscar", { termo: " a " }), comandos);

    assert.match(short.data.embeds[0].title, /Busca curta demais/);

    const unknown = await handleModalSubmit(submit("ajuda:outro", { termo: "daily" }), comandos);

    assert.match(unknown.data.embeds[0].title, /Formulário desconhecido/);
});

// ==========================================
// O COMANDO /AJUDA
// ==========================================

test("/ajuda abre o início, com os componentes", async () => {
    const response = await runHelp({});

    assert.match(embedOf(response).title, /Central de ajuda/);
    assert.deepEqual(selects(response.data.components).map(item => item.customId), [`ajuda:cat:${OWNER}`]);
});

test("/ajuda categoria: abre direto na categoria", async () => {
    const combat = await runHelp({ categoria: "combate" });

    assert.match(embedOf(combat).title, /Combate/);
    assert.ok(embedOf(combat).fields.some(field => field.name === "/atacar"));

    const utilities = await runHelp({ categoria: "utilidades" });

    assert.match(embedOf(utilities).title, /Utilidades/);

    const invalid = await runHelp({ categoria: "xyz" });

    assert.match(JSON.stringify(invalid), /Categoria inválida/);
});

test("/ajuda comando: abre o detalhe pelo nome ou atalho, e busca quando não acha", async () => {
    const byName = await runHelp({ comando: "daily" });

    assert.match(embedOf(byName).title, /\/daily/);

    const byAlias = await runHelp({ comando: "/bal" });

    assert.match(embedOf(byAlias).title, /\/saldo/);

    const close = await runHelp({ comando: "dinheiro" });

    assert.match(embedOf(close).title, /Resultado da busca/, "uma palavra solta vira busca");

    const none = await runHelp({ comando: "zzzzz" });

    assert.match(embedOf(none).title, /Nada encontrado/);
});

test("pelo prefixo: hajuda, hajuda categoria:combate e hajuda comando:daily", async () => {
    const run = await createPrefixRunner({ guildId: G, author: user(OWNER) });

    const home = await run("hajuda");

    assert.match(home.title, /Central de ajuda/);
    assert.ok(idsOf(home.components).includes(`ajuda:cat:${OWNER}`));

    assert.match((await run("hajuda categoria:combate")).title, /Combate/);

    // o nome antigo "outros" foi trocado por "utilidades": o prefixo recusa e lista as opções
    const old = await run("hajuda categoria:outros");

    assert.match(old.text, /Valor inválido para \\"categoria\\"/);
    assert.match(old.text, /utilidades/);
    assert.match((await run("hajuda comando:daily")).title, /\/daily/);
    assert.match((await run("hhelp")).title, /Central de ajuda/, "atalho help");
});
