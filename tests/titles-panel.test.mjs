import { db, getPlayer } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// O painel dos títulos (services/progress/titles-view.mjs, services/panels/titles-panel.mjs) e os comandos
// /titulos, /equipartitulo e /desequipartitulo: cada título desbloqueado com um botão para equipar, em V2.

const { getAchievement } = await import("../config/achievements.mjs");
const { getEquippedTitle, unlockAchievement } = await import("../services/progress/achievements.mjs");
const { TITLES_PAGE_SIZE, buildTitles, titlesResponse } = await import("../services/progress/titles-view.mjs");
const { handlePanelClick } = await import("../services/panels/panels.mjs");
const { layoutProblems, countComponents, V2_LIMITS } = await import("../utils/components-v2.mjs");
const { localizeResponse } = await import("../services/platform/i18n.mjs");
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

let counter = 0;

const guild = () => `g-titles-${++counter}`;

// as conquistas que existem (qualquer uma serve: o título vem junto)
const UNLOCK_POOL = Object.keys((await import("../config/achievements.mjs")).ACHIEVEMENTS);

// Cria a conta num servidor novo e desbloqueia as primeiras n conquistas (cada uma traz o seu título).
function setup(count = 3) {
    const g = guild();

    getPlayer(g, ME);

    for (const id of UNLOCK_POOL.slice(0, count)) {
        unlockAchievement(g, ME, id);
    }

    return g;
}

const equippedOf = g => getEquippedTitle(g, ME)?.achievementId ?? null;

const texto = value => JSON.stringify(value);

const click = (g, customId, user = ME) => handlePanelClick({ guildId: g, user: { id: user }, data: { customId } });

const buttonsIn = layout => {
    const found = [];

    const visit = node => {
        if (!node || typeof node !== "object") return;

        if (node.type === "button") found.push(node);

        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === "object") visit(value);
        }
    };

    layout.forEach(visit);

    return found;
};

// ==========================================
// A TELA
// ==========================================

test("sem nenhum título: avisa, sem botões, e o V2 também", () => {
    const g = guild();

    getPlayer(g, ME);

    const view = buildTitles({ guildId: g, userId: ME });

    assert.match(texto(view.embed), /Nenhum título ainda/);
    assert.deepEqual(view.components, []);
    assert.deepEqual(layoutProblems(view.layout), []);
    assert.match(texto(view.layout), /Nenhum título ainda/);
    assert.equal(buttonsIn(view.layout).length, 0);
});

test("com títulos: um botão Equipar por título, no clássico e ao lado de cada seção no V2", () => {
    const g = setup(3);

    const view = buildTitles({ guildId: g, userId: ME });

    const shown = buttonsIn(view.layout).filter(button => button.customId.startsWith(`tit:eq:${ME}:1:`));

    assert.equal(shown.length, 3, "um botão de equipar por título, no V2");

    const sections = JSON.stringify(view.layout).match(/"type":"section"/g) ?? [];

    assert.equal(sections.length, 3, "uma seção por título");

    // o clássico: uma linha de botões (um por título) e nenhuma navegação com uma página só
    assert.equal(view.components.length, 1);
    assert.equal(view.components[0].components.length, 3);

    for (const button of view.components[0].components) {
        assert.match(button.customId, new RegExp(`^tit:eq:${ME}:1:[a-z_]+$`));
        assert.equal(button.style, "primary");
    }

    assert.match(texto(view.embed), /Toque em um título para equipar/);
    assert.match(texto(view.embed), /Título atual: nenhum/);

    // cada título mostra o nome da conquista e a raridade (V2)
    const text = texto(view.layout);

    for (const button of shown) {
        const id = button.customId.split(":")[4];

        assert.ok(text.includes(getAchievement(id).name), id);
    }
});

test("o V2 cumpre as regras do Discord: nenhum ID repetido, até 40 componentes, seções de até 3 textos", () => {
    for (const count of [1, 5, 6, UNLOCK_POOL.length]) {
        const g = setup(count);

        for (const page of [1, 2, 3]) {
            const view = buildTitles({ guildId: g, userId: ME, page });

            assert.deepEqual(layoutProblems(view.layout), [], `${count} títulos, página ${page}`);
            assert.ok(countComponents(view.layout) <= V2_LIMITS.components, `${count} títulos, página ${page}: ${countComponents(view.layout)} componentes`);

            // e o clássico: no máximo 2 linhas, sem IDs repetidos
            assert.ok(view.components.length <= 2);

            const ids = view.components.flatMap(line => line.components.map(button => button.customId));

            assert.equal(new Set(ids).size, ids.length, "IDs únicos no clássico");

            for (const id of ids) {
                assert.ok(id.length <= 100, id);
            }
        }
    }
});

test("o mais raro vem primeiro", () => {
    const g = guild();

    getPlayer(g, ME);

    // um comum e um lendário, desbloqueados nesta ordem
    unlockAchievement(g, ME, "first_steps");
    unlockAchievement(g, ME, "magnate");

    const view = buildTitles({ guildId: g, userId: ME });

    const order = view.components[0].components.map(button => button.customId.split(":")[4]);

    assert.deepEqual(order, ["magnate", "first_steps"]);
});

test("páginas: 5 por página, Anterior e Próxima ligam e desligam nas pontas, e uma página fora do alcance volta ao alcance", () => {
    const g = setup(UNLOCK_POOL.length);

    assert.ok(UNLOCK_POOL.length > TITLES_PAGE_SIZE, "há mais de uma página de conquistas");

    const pages = Math.ceil(UNLOCK_POOL.length / TITLES_PAGE_SIZE);

    const first = buildTitles({ guildId: g, userId: ME, page: 1 });

    assert.equal(first.components[0].components.length, TITLES_PAGE_SIZE);

    const nav = line => Object.fromEntries(line.components.map(button => [button.label, button]));

    const navFirst = nav(first.components[1]);

    assert.equal(navFirst["Anterior"].disabled, true);
    assert.equal(navFirst["Próxima"].disabled, false);
    assert.equal(navFirst[`1/${pages}`].disabled, true, "o indicador não clica");
    assert.equal(navFirst["Próxima"].customId, `tit:pg:${ME}:2`);

    const last = buildTitles({ guildId: g, userId: ME, page: pages });

    assert.equal(last.components[0].components.length, UNLOCK_POOL.length - (pages - 1) * TITLES_PAGE_SIZE);
    assert.equal(nav(last.components[1])["Próxima"].disabled, true);
    assert.equal(nav(last.components[1])["Anterior"].disabled, false);

    // páginas absurdas viram a primeira ou a última
    assert.equal(buildTitles({ guildId: g, userId: ME, page: 999 }).embed.description, last.embed.description);
    assert.equal(buildTitles({ guildId: g, userId: ME, page: -4 }).embed.description, first.embed.description);
    assert.equal(buildTitles({ guildId: g, userId: ME, page: "x" }).embed.description, first.embed.description);
});

test("o título equipado aparece desligado (✅ Equipado), e só então há o botão Tirar título", () => {
    const g = setup(2);

    const without = buildTitles({ guildId: g, userId: ME });

    assert.equal(buttonsIn(without.layout).some(button => button.label === "Tirar título"), false);
    assert.equal(without.components.length, 1, "sem navegação nem botão de tirar: só a linha dos títulos");

    const [first] = without.components[0].components;

    const id = first.customId.split(":")[4];

    click(g, first.customId);

    assert.equal(equippedOf(g), id);

    const view = buildTitles({ guildId: g, userId: ME });

    const equipped = buttonsIn(view.layout).filter(button => button.label === "Equipado");

    assert.equal(equipped.length, 1);
    assert.equal(equipped[0].disabled, true);
    assert.ok(equipped[0].customId.startsWith(`tit:noop:${ME}:eq:`));

    assert.ok(buttonsIn(view.layout).some(button => button.label === "Tirar título" && button.style === "danger"));

    assert.match(texto(view.embed), /equipado/);
    assert.match(texto(view.embed), /Título atual/);
    assert.doesNotMatch(texto(view.embed), /Título atual: nenhum/);
});

// ==========================================
// OS CLIQUES
// ==========================================

test("clicar em Equipar equipa o título, atualiza a mesma mensagem e fica na mesma página", () => {
    const g = setup(UNLOCK_POOL.length);

    const page2 = buildTitles({ guildId: g, userId: ME, page: 2 });

    const target = page2.components[0].components[0];

    const id = target.customId.split(":")[4];

    const response = click(g, target.customId);

    assert.equal(response.type, "update");
    assert.equal(equippedOf(g), id);

    assert.match(texto(response.data.embeds), /Título equipado/);
    assert.match(texto(response.data.layout), /Título equipado/);
    assert.match(texto(response.data.layout), /página 2/, "continua na página 2");
    assert.ok(response.data.components.length >= 1);
});

test("só quem abriu o painel mexe nele", () => {
    const g = setup(2);

    getPlayer(g, OTHER);

    const view = buildTitles({ guildId: g, userId: ME });

    const target = view.components[0].components[0];

    const response = click(g, target.customId, OTHER);

    assert.match(texto(response), /de outra pessoa/);
    assert.equal(equippedOf(g), null, "nada foi equipado");
    assert.equal(getEquippedTitle(g, OTHER), null);

    assert.match(texto(click(g, `tit:pg:${ME}:2`, OTHER)), /de outra pessoa/);
    assert.match(texto(click(g, `tit:rem:${ME}:1`, OTHER)), /de outra pessoa/);
});

test("um título que você não desbloqueou não equipa, mesmo com o botão forjado", () => {
    const g = guild();

    getPlayer(g, ME);

    unlockAchievement(g, ME, "first_steps");

    const response = click(g, `tit:eq:${ME}:1:magnate`);

    assert.match(texto(response), /ainda não desbloqueou/);
    assert.equal(equippedOf(g), null);

    // e um que nem existe
    assert.match(texto(click(g, `tit:eq:${ME}:1:nao_existe`)), /não existe/);
    assert.equal(equippedOf(g), null);
});

test("Tirar título remove o equipado e avisa; sem título equipado também responde", () => {
    const g = setup(2);

    const first = buildTitles({ guildId: g, userId: ME }).components[0].components[0];

    click(g, first.customId);

    assert.notEqual(equippedOf(g), null);

    const removed = click(g, `tit:rem:${ME}:1`);

    assert.equal(removed.type, "update");
    assert.equal(equippedOf(g), null);
    assert.match(texto(removed.data.embeds), /Título removido/);

    const again = click(g, `tit:rem:${ME}:1`);

    assert.match(texto(again.data.embeds), /não tinha título equipado/);
});

test("as páginas pelos botões, e botão de outra coisa é recusado com um aviso", () => {
    const g = setup(UNLOCK_POOL.length);

    const next = click(g, `tit:pg:${ME}:2`);

    assert.equal(next.type, "update");
    assert.match(texto(next.data.layout), /página 2/);

    assert.match(texto(click(g, `tit:xyz:${ME}:1`)), /Botão desconhecido/);

    // fora de um servidor não faz nada
    assert.equal(handlePanelClick({ user: { id: ME }, data: { customId: `tit:pg:${ME}:2` } }), null);
});

test("equipar um título e equipar outro troca (um só equipado por vez)", () => {
    const g = setup(3);

    const [a, b] = buildTitles({ guildId: g, userId: ME }).components[0].components;

    click(g, a.customId);

    const first = equippedOf(g);

    click(g, b.customId);

    assert.notEqual(equippedOf(g), first);
    assert.equal(equippedOf(g), b.customId.split(":")[4]);
});

// ==========================================
// OS COMANDOS
// ==========================================

const slash = (g, options = {}, userId = ME) => ({
    id: "int-" + Math.random(),
    guildId: g,
    channelId: "c1",
    user: { id: userId, username: "titulado" },
    data: { options }
});

test("/titulos abre o painel: o clássico com os botões e o desenho V2", async () => {
    const command = resolverComando(comandos, "titulos");

    const g = setup(3);

    const response = await silently(() => command.execute(slash(g)));

    assert.match(texto(response.data.embeds), /Seus títulos/);
    assert.equal(response.data.components.length, 1);
    assert.ok(Array.isArray(response.data.layout) && response.data.layout.length > 0);
    assert.deepEqual(layoutProblems(response.data.layout), []);

    const noGuild = await silently(() => command.execute({ id: "x", user: { id: ME }, data: { options: {} } }));

    assert.match(texto(noGuild), /precisa ser utilizado em um servidor/);
});

test("/equipartitulo sem nada abre o painel; com o identificador equipa direto e mostra o painel", async () => {
    const command = resolverComando(comandos, "equipartitulo");

    assert.equal(command.options[0].required, false, "o identificador é opcional");
    assert.ok(command.description.length <= 70);

    const g = setup(3);

    const panel = await silently(() => command.execute(slash(g)));

    assert.match(texto(panel.data.embeds), /Seus títulos/);
    assert.equal(equippedOf(g), null, "só abrir não equipa");

    const first = buildTitles({ guildId: g, userId: ME }).components[0].components[0].customId.split(":")[4];

    const equip = await silently(() => command.execute(slash(g, { titulo: first.toUpperCase() })));

    assert.equal(equippedOf(g), first);
    assert.match(texto(equip.data.embeds), /Título equipado/);
    assert.ok(equip.data.layout.length > 0);

    const again = await silently(() => command.execute(slash(g, { titulo: first })));

    assert.match(texto(again.data.embeds), /já está equipado/);

    const wrong = await silently(() => command.execute(slash(g, { titulo: "magnate_inexistente" })));

    assert.match(texto(wrong.data.embeds), /não existe/);
    assert.match(texto(wrong.data.embeds), /Escolha um dos seus títulos/);
    assert.equal(equippedOf(g), first, "o erro não troca o título");
});

test("/desequipartitulo tira o título e mostra o painel; sem título avisa", async () => {
    const command = resolverComando(comandos, "desequipartitulo");

    const g = setup(2);

    const none = await silently(() => command.execute(slash(g)));

    assert.match(texto(none.data.embeds), /não tem título equipado/);

    const first = buildTitles({ guildId: g, userId: ME }).components[0].components[0].customId.split(":")[4];

    click(g, `tit:eq:${ME}:1:${first}`);

    const removed = await silently(() => command.execute(slash(g)));

    assert.equal(equippedOf(g), null);
    assert.match(texto(removed.data.embeds), /Título removido/);
    assert.match(texto(removed.data.embeds), new RegExp(getAchievement(first).title));
});

// ==========================================
// INGLÊS
// ==========================================

test("em inglês, o painel inteiro sai traduzido (botões, avisos e a lista)", () => {
    const g = setup(UNLOCK_POOL.length);

    const first = buildTitles({ guildId: g, userId: ME }).components[0].components[0];

    const response = click(g, first.customId);

    const english = localizeResponse({ type: "message", data: { body: "", embeds: response.data.embeds, components: response.data.components, layout: response.data.layout } }, "en-US");

    const text = texto(english);

    assert.match(text, /Title equipped/);
    assert.match(text, /Remove title/);
    assert.match(text, /Equipped/);
    assert.match(text, /titles unlocked of/);
    assert.match(text, new RegExp(`page 1/${Math.ceil(UNLOCK_POOL.length / 5)}`));

    assert.doesNotMatch(text, /Título equipado|Tirar título|desbloqueados de|página/);
});
