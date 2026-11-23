import { db, getPlayer } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// O /sobre (services/panels/about-view.mjs, about-panel.mjs), as sugestões (services/platform/suggestions.mjs) e os
// números de agora (runtime-stats.mjs).

const { LATEST_UPDATE, SUGGESTION_RULES } = await import("../config/about.mjs");
const { createSuggestions, setSuggestionSender } = await import("../services/platform/suggestions.mjs");
const { getRuntimeStats, setRuntimeStats } = await import("../services/platform/runtime-stats.mjs");
const { UPDATE_URL, buildAbout, versionLabel } = await import("../services/panels/about-view.mjs");
const { handleModalSubmit, handlePanelClick } = await import("../services/panels/panels.mjs");
const { layoutProblems, countComponents, V2_LIMITS } = await import("../utils/components-v2.mjs");
const { localizeData } = await import("../services/platform/i18n.mjs");
const { UPDATE_TITLES } = await import("../config/locales/en-US-responses.mjs");
const { carregarComandos, resolverComando } = await import("../command-registry.mjs");
const { REPO_URL, SITE_URL, SUPPORT_URL, WIKI_URL } = await import("../config/site.mjs");

const ME = "111111111111111111";
const CHANNEL = "999999999999999999";

const TEXT = "Seria legal ter um comando para trocar itens com outros jogadores";

const texto = value => JSON.stringify(value);

// ==========================================
// AS SUGESTÕES
// ==========================================

function make({ channel = CHANNEL, sent = [], ok = true, start = 1_000_000 } = {}) {
    let clock = start;

    const service = createSuggestions({
        channelId: () => channel,
        send: async (id, payload) => {
            sent.push({ id, payload });

            return ok;
        },
        now: () => clock
    });

    return { service, sent, advance: ms => { clock += ms; } };
}

test("sem canal configurado a sugestão está desligada (e o ID do canal precisa parecer um ID)", async () => {
    for (const channel of ["", "   ", "abc", "12", null]) {
        const { service, sent } = make({ channel });

        assert.equal(service.available(), false, String(channel));
        assert.deepEqual(await service.submit({ userId: ME, name: "Ana", guildId: "g1", text: TEXT }), { status: "disabled" });
        assert.equal(sent.length, 0);
    }

    assert.equal(make().service.available(), true);
});

test("a sugestão vai ao canal, citada, sem notificar ninguém, com quem mandou e de onde", async () => {
    const { service, sent } = make();

    const result = await service.submit({ userId: ME, name: "Ana @everyone", guildId: "g1", text: `${TEXT}\r\nlinha dois @here <@123>` });

    assert.deepEqual(result, { status: "ok" });
    assert.equal(sent.length, 1);

    const { id, payload } = sent[0];

    assert.equal(id, CHANNEL);
    assert.deepEqual(payload.allowed_mentions, { parse: [] }, "menção no texto não notifica");

    assert.match(payload.content, /^💡 \*\*Sugestão\*\* de /);
    assert.ok(payload.content.includes(`\`${ME}\``));
    assert.ok(payload.content.includes("Servidor: `g1`"));
    assert.ok(payload.content.includes(`> ${TEXT}\n> linha dois`), "cada linha vem citada");
    assert.ok(payload.content.length <= 1900);
});

test("limites: de 10 a 500 caracteres (contando caracteres, não bytes), com a mensagem certa", async () => {
    const { service, sent } = make();

    assert.deepEqual(await service.submit({ userId: ME, name: "Ana", guildId: "g1", text: "curta" }), { status: "short", min: SUGGESTION_RULES.min });
    assert.deepEqual(await service.submit({ userId: ME, name: "Ana", guildId: "g1", text: "   " }), { status: "short", min: SUGGESTION_RULES.min });
    assert.deepEqual(await service.submit({ userId: ME, name: "Ana", guildId: "g1", text: undefined }), { status: "short", min: SUGGESTION_RULES.min });

    assert.deepEqual(await service.submit({ userId: ME, name: "Ana", guildId: "g1", text: "x".repeat(SUGGESTION_RULES.max + 1) }), { status: "long", max: SUGGESTION_RULES.max });

    // 500 emojis são 500 caracteres, mesmo com mais unidades de texto
    assert.deepEqual(await service.submit({ userId: ME, name: "Ana", guildId: "g1", text: "🌸".repeat(SUGGESTION_RULES.max) }), { status: "ok" });

    assert.equal(sent.length, 1, "só a última valeu");
});

test("uma por pessoa a cada 10 minutos: a espera só começa quando a sugestão foi mesmo enviada", async () => {
    const { service, sent, advance } = make();

    assert.equal((await service.submit({ userId: ME, name: "Ana", guildId: "g1", text: TEXT })).status, "ok");

    const wait = await service.submit({ userId: ME, name: "Ana", guildId: "g1", text: TEXT });

    assert.equal(wait.status, "wait");
    assert.equal(wait.remainingMs, SUGGESTION_RULES.cooldownMs);

    // outra pessoa não espera
    assert.equal((await service.submit({ userId: "222222222222222222", name: "Bia", guildId: "g1", text: TEXT })).status, "ok");

    advance(SUGGESTION_RULES.cooldownMs - 1);

    assert.equal((await service.submit({ userId: ME, name: "Ana", guildId: "g1", text: TEXT })).status, "wait");

    advance(1);

    assert.equal((await service.submit({ userId: ME, name: "Ana", guildId: "g1", text: TEXT })).status, "ok");
    assert.equal(sent.length, 3);

    // um erro do Discord não gasta a vez da pessoa
    const broken = make({ ok: false });

    assert.equal((await broken.service.submit({ userId: ME, name: "Ana", guildId: "g1", text: TEXT })).status, "failed");

    broken.sent.length = 0;

    assert.equal((await broken.service.submit({ userId: ME, name: "Ana", guildId: "g1", text: TEXT })).status, "failed", "tenta de novo sem esperar");
    assert.equal(broken.sent.length, 1);
});

test("o envio que lança erro vira 'failed' e quem está bloqueado não envia", async () => {
    const throwing = createSuggestions({ channelId: () => CHANNEL, send: async () => { throw new Error("rede"); } });

    assert.deepEqual(await throwing.submit({ userId: ME, name: "Ana", guildId: "g1", text: TEXT }), { status: "failed" });

    // bloqueada pelo dono (a mesma lista dos comandos)
    db.prepare("INSERT OR REPLACE INTO developer_blacklist (user_id, reason) VALUES (?, ?)").run("333333333333333333", "teste");

    const { service, sent } = make();

    assert.deepEqual(await service.submit({ userId: "333333333333333333", name: "Cris", guildId: "g1", text: TEXT }), { status: "blocked" });
    assert.equal(sent.length, 0);
});

// ==========================================
// OS NÚMEROS DE AGORA
// ==========================================

test("os números de agora: o que o helena.mjs registrar, e nada inventado quando não há", () => {
    setRuntimeStats(null);

    assert.equal(getRuntimeStats().servers, null);
    assert.ok(getRuntimeStats().startedAt <= Date.now());

    setRuntimeStats(() => ({ servers: 14 }));

    assert.equal(getRuntimeStats().servers, 14);

    for (const bad of [{ servers: -1 }, { servers: 1.5 }, { servers: "14" }, null, {}]) {
        setRuntimeStats(() => bad);

        assert.equal(getRuntimeStats().servers, null, JSON.stringify(bad));
    }

    setRuntimeStats(() => { throw new Error("boom"); });

    assert.equal(getRuntimeStats().servers, null);

    setRuntimeStats(null);
});

// ==========================================
// A TELA
// ==========================================

const linkButtons = view => view.components.flatMap(line => line.components).filter(button => button.style === "link");

test("/sobre: versão, números, novidade e os quatro links; o botão de sugestão só com o canal configurado", () => {
    const before = process.env.HELENA_CANAL_SUGESTOES;

    try {
        delete process.env.HELENA_CANAL_SUGESTOES;
        setRuntimeStats(() => ({ servers: 14 }));

        db.prepare("INSERT OR IGNORE INTO global_users (user_id) VALUES (?)").run(ME);

        const view = buildAbout({ now: Date.now() + 3_600_000 + 5_000 });

        const rows = texto(view.embed);

        assert.match(rows, /Versão: \*\*local\*\*|Versão.*local/);
        assert.match(rows, /No ar há/);
        assert.match(rows, /Servidores: \*\*14\*\*|Servidores.*14/);
        assert.match(rows, /Jogadores/);
        assert.ok(rows.includes(UPDATE_URL), "a novidade leva à página da atualização");
        assert.match(rows, new RegExp(`Atualização ${LATEST_UPDATE.version.replace(".", "\\.")}`));

        assert.deepEqual(linkButtons(view).map(button => button.url), [SUPPORT_URL, SITE_URL, WIKI_URL, REPO_URL]);
        assert.equal(view.components.flatMap(line => line.components).some(button => button.customId === "sobre:sugestao"), false, "sem canal, sem botão");

        assert.deepEqual(layoutProblems(view.layout), []);
        assert.ok(countComponents(view.layout) <= V2_LIMITS.components);

        // com o canal, aparece o botão
        process.env.HELENA_CANAL_SUGESTOES = CHANNEL;

        const withButton = buildAbout();

        const suggestion = withButton.components.flatMap(line => line.components).find(button => button.customId === "sobre:sugestao");

        assert.ok(suggestion);
        assert.equal(suggestion.label, "Sugestão");
        assert.equal(withButton.components[0].components.length, 5, "cabe numa linha (o máximo do Discord)");
        assert.deepEqual(layoutProblems(withButton.layout), []);

    } finally {
        if (before === undefined) delete process.env.HELENA_CANAL_SUGESTOES; else process.env.HELENA_CANAL_SUGESTOES = before;

        setRuntimeStats(null);
    }
});

test("a versão: 'local' fora do zip do Discloud", () => {
    assert.equal(versionLabel(), "local");
});

test("a novidade que o /sobre aponta é a mais nova da pasta wiki/updates, e tem título em inglês", () => {
    const newest = readdirSync(new URL("../wiki/updates/", import.meta.url))
        .filter(file => file.endsWith(".md"))
        .map(file => file.slice(0, -3))
        .sort((a, b) => b.localeCompare(a, "en", { numeric: true }))[0];

    assert.equal(LATEST_UPDATE.slug, newest, "publicou uma atualização nova? troque LATEST_UPDATE em config/about.mjs");
    assert.equal(LATEST_UPDATE.slug, "v" + LATEST_UPDATE.version.replace(".", "-"));

    assert.ok(UPDATE_TITLES[LATEST_UPDATE.version], `falta o título em inglês de ${LATEST_UPDATE.version} (UPDATE_TITLES em config/locales/en-US-responses.mjs)`);

    // o título que o /sobre mostra é o da própria página da wiki
    const page = readFileSync(new URL(`../wiki/updates/${newest}.md`, import.meta.url), "utf8");

    assert.ok(page.includes(LATEST_UPDATE.title), "o título do /sobre combina com o da página");
});

// ==========================================
// OS CLIQUES E O FORMULÁRIO
// ==========================================

const click = (customId, guildId = "g-about") => handlePanelClick({ guildId, user: { id: ME }, data: { customId } });

const submit = (text, guildId = "g-about") => ({
    id: "m-" + Math.random(),
    guildId,
    channelId: "c1",
    user: { id: ME, username: "ana", displayName: "Ana" },
    data: { customId: "sobre:sugestao", fields: [{ customId: "texto", value: text }] }
});

test("o botão Sugestão abre o formulário (de qualquer pessoa) com os limites certos, e sem canal avisa", () => {
    const before = process.env.HELENA_CANAL_SUGESTOES;

    try {
        delete process.env.HELENA_CANAL_SUGESTOES;

        assert.match(texto(click("sobre:sugestao")), /não estão ligadas/);

        process.env.HELENA_CANAL_SUGESTOES = CHANNEL;

        const modal = click("sobre:sugestao");

        assert.equal(modal.type, "modal");
        assert.equal(modal.data.customId, "sobre:sugestao");
        assert.equal(modal.data.fields.length, 1);

        const [field] = modal.data.fields;

        assert.equal(field.minLength, SUGGESTION_RULES.min);
        assert.equal(field.maxLength, SUGGESTION_RULES.max);

        // outro botão da área é recusado
        assert.match(texto(click("sobre:xyz")), /Botão desconhecido/);

    } finally {
        if (before === undefined) delete process.env.HELENA_CANAL_SUGESTOES; else process.env.HELENA_CANAL_SUGESTOES = before;
    }
});

test("enviar o formulário: sucesso só para quem enviou, e cada recusa tem a sua mensagem", async () => {
    const before = process.env.HELENA_CANAL_SUGESTOES;

    const sent = [];

    setSuggestionSender(async (channel, payload) => { sent.push({ channel, payload }); return true; });

    try {
        process.env.HELENA_CANAL_SUGESTOES = CHANNEL;

        const unique = "Ideia única " + Math.random();

        const ok = await handleModalSubmit(submit(unique + " para o bot ficar ainda melhor"), new Map());

        assert.equal(ok.data.ephemeral, true, "a resposta é privada");
        assert.match(texto(ok), /Sugestão enviada/);
        assert.equal(sent.length, 1);
        assert.equal(sent[0].channel, CHANNEL);
        assert.ok(sent[0].payload.content.includes(unique));

        // outra logo em seguida: espera
        assert.match(texto(await handleModalSubmit(submit(unique + " segunda tentativa"), new Map())), /Calma um pouquinho/);
        assert.equal(sent.length, 1);

        assert.match(texto(await handleModalSubmit({ ...submit("curta"), user: { id: "444444444444444444", username: "x" } }, new Map())), /curta demais/);

        assert.match(texto(await handleModalSubmit({ ...submit("y".repeat(501)), user: { id: "555555555555555555", username: "x" } }, new Map())), /longa demais/);

        // o envio ao Discord que falha
        setSuggestionSender(async () => false);

        assert.match(texto(await handleModalSubmit({ ...submit("Uma ideia que não vai chegar lá"), user: { id: "666666666666666666", username: "x" } }, new Map())), /Não foi possível enviar/);

        // sem servidor (mensagem privada): o roteador recusa antes
        assert.match(texto(await handleModalSubmit(submit(TEXT, null), new Map())), /só funciona em um servidor/);

        // desligado
        delete process.env.HELENA_CANAL_SUGESTOES;

        assert.match(texto(await handleModalSubmit({ ...submit(TEXT), user: { id: "777777777777777777", username: "x" } }, new Map())), /não estão ligadas/);

    } finally {
        setSuggestionSender(null);

        if (before === undefined) delete process.env.HELENA_CANAL_SUGESTOES; else process.env.HELENA_CANAL_SUGESTOES = before;
    }
});

// ==========================================
// O COMANDO E O HELENA.MJS
// ==========================================

test("/sobre: nome, sem alias, descrição curta, e responde com o clássico (botões) e o V2", async () => {
    const log = console.log;

    console.log = () => {};

    const comandos = await carregarComandos();

    console.log = log;

    const command = resolverComando(comandos, "sobre");

    assert.ok(command);
    assert.equal(command.name, "sobre");
    assert.equal(command.aliases, undefined, "alias gasta vaga de comando de barra");
    assert.ok(command.description.length <= 70);

    const response = await command.execute({ id: "i", guildId: "g-about", user: { id: ME } });

    assert.match(texto(response.data.embeds), /Sobre a Helena/);
    assert.ok(response.data.components.length >= 1);
    assert.deepEqual(layoutProblems(response.data.layout), []);

    getPlayer("g-about", ME);
});

test("o helena.mjs registra o envio das sugestões e os números do /sobre", () => {
    const source = readFileSync(new URL("../helena.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");

    assert.match(source, /setRuntimeStats\(\(\) => \(\{ servers: nomesServidores\.size \|\| null \}\)\);/);
    assert.match(source, /setSuggestionSender\(async \(canal, corpo\) => \{/);
    assert.match(source, /channels\/\$\{canal\}\/messages/);

    // sem permissão de mencionar: o corpo já traz allowed_mentions vazio (suggestions.mjs), o helena.mjs só repassa
    assert.match(source, /body: JSON\.stringify\(corpo\)/);
});

test("em inglês, a tela do /sobre sai traduzida (título, linhas, novidade e links)", () => {
    const before = process.env.HELENA_CANAL_SUGESTOES;

    try {
        process.env.HELENA_CANAL_SUGESTOES = CHANNEL;

        const view = buildAbout();

        const english = localizeData({ body: "", embeds: [view.embed], components: view.components, layout: view.layout }, "en-US");

        const text = texto(english);

        assert.match(text, /About Helena/);
        assert.match(text, /Version/);
        assert.match(text, /Players/);
        assert.match(text, new RegExp(`News: \\[Update ${LATEST_UPDATE.version.replace(".", "\\.")}: ${UPDATE_TITLES[LATEST_UPDATE.version]}\\]`));
        assert.match(text, /"label":"Support"/);
        assert.match(text, /"label":"Code"/);
        assert.match(text, /"label":"Suggestion"/);

        assert.doesNotMatch(text, /Sobre a Helena|Jogadores|Novidade|Suporte/);

    } finally {
        if (before === undefined) delete process.env.HELENA_CANAL_SUGESTOES; else process.env.HELENA_CANAL_SUGESTOES = before;
    }
});

