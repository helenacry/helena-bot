import { db, createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// O contador de visualizações fica no banco, e o teste confere que nenhum arquivo é
// criado. Roda numa pasta temporária para qualquer arquivo perdido não sujar o projeto.
const workDir = mkdtempSync(join(tmpdir(), "helena-userinfo-"));

process.chdir(workDir);

const { clearUserLookupCache } = await import("../services/user-lookup.mjs");
const { carregarComandos, resolverComando } = await import("../command-registry.mjs");

const G = "900000000000000001";
const ME = { id: "111111111111111111", username: "eu", displayName: "Eu Mesmo" };

const DAY = 24 * 60 * 60 * 1000;

// Membro como a API da VSync devolve (campos que o /userinfo usa).
const member = (id, username, displayName, extra = {}) => ({
    id, username, displayName,
    nickname: null,
    bot: false,
    avatarUrl: "https://cdn.exemplo.test/" + id + ".png",
    flags: [],
    hiddenBadges: [],
    createdAt: Date.UTC(2024, 4, 10, 15, 30),
    joinedAt: Date.UTC(2025, 0, 20, 12, 0),
    prismaActive: false,
    prismaSince: null,
    pulsing: false,
    pulsingSince: null,
    pulseBadge: null,
    nextPulseBadge: null,
    ...extra
});

const MARIA = member("200000000000000001", "mariasilva", "Maria Silva", {
    flags: ["BADGE_SHOW_VERIFIED", "BADGE_SHOW_PRISMA"],
    prismaActive: true,
    prismaSince: Date.UTC(2024, 8, 5, 10, 0),
    pulsing: true,
    pulsingSince: Date.now() - 100 * DAY,
    pulseBadge: { id: "PULSE_3", months: 3 },
    nextPulseBadge: { id: "PULSE_6", months: 6, at: Date.now() + 5 * DAY }
});

const MEMBERS = [
    member(ME.id, "eu", "Eu Mesmo"),
    MARIA,
    member("200000000000000002", "mariasouza", "Maria Souza"),
    member("200000000000000003", "jose", "José Ávila", { nickname: "Zezinho" }),
    member("200000000000000004", "ana", "Ana"),
    member("200000000000000005", "helena", "Helena", { bot: true }),
    member("200000000000000006", "carlos", "Carlos"),
    member("200000000000000007", "paula", "Paula")
];

const calls = [];

// liga para simular a VSync fora do ar na rota de membro
let failMembers = false;

// API simulada: lista de membros e membro por ID.
globalThis.fetch = async (url, init = {}) => {
    const u = String(url);

    calls.push((init.method ?? "GET") + " " + u.replace("https://api.vsync.lat", ""));

    const reply = (status, body) => ({
        ok: status < 300, status, json: async () => body,
        text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0),
        headers: { get: () => null }
    });

    let m;

    if ((m = u.match(/\/guilds\/[^/]+\/members\/([^/]+)$/))) {
        if (failMembers) return reply(500, {});

        const found = MEMBERS.find(x => x.id === decodeURIComponent(m[1]));

        return found ? reply(200, { member: found }) : reply(404, {});
    }

    if (/\/guilds\/[^/]+$/.test(u)) return reply(200, { members: MEMBERS });

    return reply(404, {});
};

const run = await createPrefixRunner({ guildId: G, author: ME });

const UNKNOWN = "Não informado pela API";

const embedOf = r => r.sent[0]?.embeds?.[0];

const fieldsOf = embed => Object.fromEntries(embed.fields.map(f => [f.name, f.value]));

const players = () => db.prepare("SELECT COUNT(*) c FROM players").get().c;

test.beforeEach(() => {
    clearUserLookupCache();
    calls.length = 0;
    failMembers = false;
});

// ==========================================
// BUSCA
// ==========================================

test("@usuário inexistente: avisa que não encontrou, sem mostrar informações", async () => {
    const r = await run("hui ninguemassim");

    assert.match(r.title, /Usuário não encontrado/);
    assert.match(r.text, /ninguemassim/);
    assert.match(r.text, /@usuário exato/);
    assert.equal(embedOf(r).fields.length, 0, "nenhum campo de informações");
});

test("texto digitado volta sem formatação nem menções", async () => {
    const r = await run("hui <*@@teste>");

    assert.match(r.text, /\*\*teste\*\*/);
    assert.doesNotMatch(r.text, /<\*|@@/);
});

test("apelido e nome de exibição não entram na busca", async () => {
    // "Maria Silva" é o nome de exibição e "Zezinho" o apelido no servidor
    for (const query of ["Maria Silva", "maria silva", "zezinho", "José Ávila", "Eu Mesmo"]) {
        assert.match((await run("hui " + query)).title, /Usuário não encontrado/, query);
    }
});

test("o @usuário tem de ser exato: pedaço do usuário não acha", async () => {
    // existem mariasilva e mariasouza, mas "maria" não é o @usuário de ninguém
    assert.match((await run("hui maria")).title, /Usuário não encontrado/);
    assert.match((await run("hui mariasil")).title, /Usuário não encontrado/);
});

test("menção de quem não está no servidor: não encontrado", async () => {
    assert.match((await run("hui <@999999999999999999>")).title, /Usuário não encontrado/);
});

// ==========================================
// RESULTADO
// ==========================================

test("informações de outra pessoa pelo @usuário: menciona a pessoa e mostra os dados da API", async () => {
    const r = await run("hui mariasilva");

    assert.equal(r.body, "Informações de <@200000000000000001>", "a mensagem menciona o dono das informações");

    const embed = embedOf(r);
    const fields = fieldsOf(embed);

    assert.equal(embed.author.name, "Maria Silva (mariasilva)");
    assert.equal(embed.author.iconUrl, MARIA.avatarUrl);
    assert.equal(embed.thumbnail.url, MARIA.avatarUrl);

    assert.equal(fields["🏷️ Tag"], "mariasilva");
    assert.equal(fields["🪪 ID"], MARIA.id);
    assert.match(fields["🏅 Insígnias"], /badge_verified/);
    assert.match(fields["🏅 Insígnias"], /badge_prisma_plus/);

    assert.match(fields["📅 Conta criada em"], /10 de maio de 2024/);
    assert.match(fields["📅 Entrou no servidor em"], /20 de janeiro de 2025/, "vem da lista de membros");
    assert.match(fields["💎 Assinante Prisma+ desde"], /5 de setembro de 2024/);

    assert.notEqual(fields["✨ Pulser desde"], "**" + UNKNOWN + "**");
    assert.match(fields["🏅 Insígnia de Pulser atual"], /pulse_3/);
    assert.match(fields["🏅 Insígnia de Pulser atual"], /dias/);
    assert.match(fields["⏭️ Próxima insígnia de Pulser"], /em .*(dia|hora)/);
});

test("quem não tem Prisma+ nem Pulse aparece como tal", async () => {
    const fields = fieldsOf(embedOf(await run("hui ana")));

    assert.equal(fields["🏅 Insígnias"], "Nenhuma");
    assert.equal(fields["💎 Assinante Prisma+ desde"], "Não é assinante Prisma+.");
    assert.match(fields["✨ Pulser desde"], /Não possui Pulse ativo/);
});

test("@usuário com @, em maiúsculas, menção, ID e o alias ui", async () => {
    const ana = "Informações de <@200000000000000004>";

    assert.equal((await run("hui @ana")).body, ana);
    assert.equal((await run("huserinfo ANA")).body, ana);
    assert.equal((await run("hui <@200000000000000004>")).body, ana);
    assert.equal((await run("hui 200000000000000004")).body, ana, "o ID da menção também vale");

    // o username de quem tem apelido no servidor
    assert.equal((await run("hui jose")).body, "Informações de <@200000000000000003>");
});

test("bots também têm informações", async () => {
    const r = await run("hui helena");

    assert.equal(r.body, "Informações de <@200000000000000005>");
    assert.equal(fieldsOf(embedOf(r))["🏷️ Tag"], "helena");
});

test("sem argumento (ou o próprio @usuário) mostra as suas informações", async () => {
    for (const text of ["hui", "hui eu", "hui @eu", `hui <@${ME.id}>`]) {
        const r = await run(text);

        assert.equal(r.body, `<@${ME.id}>`, text);
        assert.match(embedOf(r).author.name, /Eu Mesmo \(eu\)/, text);
    }
});

test("olhar as informações de alguém não cria registro de jogador", async () => {
    const before = players();

    await run("hui mariasilva");
    await run("hui ana");

    assert.equal(players(), before);
});

// ==========================================
// VISUALIZAÇÕES
// ==========================================

test("o contador de visualizações é da pessoa consultada", async () => {
    const footer = r => embedOf(r).footer.text;

    assert.match(footer(await run("hui carlos")), /Comando executado por: Eu Mesmo \| Visualizações: 1 •/);
    assert.match(footer(await run("hui carlos")), /Visualizações: 2 •/);
    assert.match(footer(await run("hui paula")), /Visualizações: 1 •/, "cada pessoa tem o seu");

    // a contagem fica no banco do bot, e nenhum arquivo é criado
    assert.equal(db.prepare("SELECT views FROM userinfo_views WHERE user_id = ?").get("200000000000000006").views, 2);
    assert.deepEqual(readdirSync(workDir), [], "o contador não grava arquivo nenhum");
});

// ==========================================
// COMANDO
// ==========================================

test("a opção é de texto e o alias ui continua valendo", async () => {
    const comandos = await carregarComandos();

    const userinfo = comandos.get("userinfo");

    assert.deepEqual(
        userinfo.options.map(o => [o.name, o.type, o.required]),
        [["usuario", "string", false]]
    );

    assert.equal(resolverComando(comandos, "ui")?.name, "userinfo");
});
