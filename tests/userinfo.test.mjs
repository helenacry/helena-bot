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

// "Pulser desde": o pulsingSince que vem com o membro é o do SERVIDOR e fica nulo quando o
// Pulse é de outro servidor (com pulsing=true). A data da CONTA sai do próximo selo, que chega
// em pulsingSince + meses x 30 dias (conferido com a API de verdade).
const NEXT_BADGE_AT = Date.UTC(2026, 11, 20, 12, 0);          // 20/12/2026 12:00 UTC
const PULSE_FROM = Date.UTC(2026, 9, 21, 12, 0);              // 21/10/2026 12:00 UTC (60 dias antes)

const MEMBERS = [
    member(ME.id, "eu", "Eu Mesmo"),
    MARIA,
    member("200000000000000002", "mariasouza", "Maria Souza"),
    member("200000000000000003", "jose", "José Ávila", { nickname: "Zezinho" }),
    member("200000000000000004", "ana", "Ana"),
    member("200000000000000005", "helena", "Helena", { bot: true }),
    member("200000000000000006", "carlos", "Carlos"),
    member("200000000000000007", "paula", "Paula"),
    member("200000000000000008", "pulsaoutro", "Pulsa Outro", {
        pulsing: true, pulsingSince: null,
        pulseBadge: { id: "PULSE_1", months: 1 },
        nextPulseBadge: { id: "PULSE_2", months: 2, at: NEXT_BADGE_AT }
    }),
    member("200000000000000009", "pulsaaqui", "Pulsa Aqui", {
        pulsing: true, pulsingSince: PULSE_FROM,
        pulseBadge: { id: "PULSE_1", months: 1 },
        nextPulseBadge: { id: "PULSE_2", months: 2, at: NEXT_BADGE_AT }
    }),
    member("200000000000000010", "nivelmaximo", "Nível Máximo", {
        pulsing: true, pulsingSince: null,
        pulseBadge: { id: "PULSE_24", months: 24 },
        nextPulseBadge: null
    }),
    member("200000000000000011", "soprisma", "Só Prisma", {
        flags: ["BADGE_SHOW_PRISMA"],
        prismaActive: true,
        prismaSince: Date.UTC(2025, 5, 1, 9, 0)
    })
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

test("Pulser desde: Pulse de outro servidor (pulsingSince nulo) usa a data tirada do próximo selo", async () => {
    const fields = fieldsOf(embedOf(await run("hui pulsaoutro")));

    assert.match(fields["✨ Pulser desde"], /21 de outubro de 2026/, fields["✨ Pulser desde"]);
    assert.doesNotMatch(fields["✨ Pulser desde"], /Não informado/);
});

test("Pulser desde: quando o servidor também informa a data, as duas concordam", async () => {
    const fields = fieldsOf(embedOf(await run("hui pulsaaqui")));

    assert.match(fields["✨ Pulser desde"], /21 de outubro de 2026/, fields["✨ Pulser desde"]);
});

test("Pulser desde: no nível máximo (sem próximo selo) e sem data do servidor, continua não informado", async () => {
    const fields = fieldsOf(embedOf(await run("hui nivelmaximo")));

    assert.match(fields["✨ Pulser desde"], /Não informado pela API/);
});

test("no comando de barra, quem pulsa e veio sem nada do Pulse na interação tem o membro buscado na API", async () => {
    const userinfo = (await carregarComandos()).get("userinfo");

    const result = await userinfo.execute({
        guildId: G,
        channelId: "900000000000000099",
        user: { id: "200000000000000008", username: "pulsaoutro", displayName: "Pulsa Outro", pulsing: true, createdAt: Date.UTC(2024, 4, 10, 15, 30) },
        member: { joinedAt: Date.UTC(2023, 2, 3, 12, 0), nickname: null, roleIds: [], pulsingSince: null, timeoutUntil: null },
        data: { options: {} }
    });

    const fields = fieldsOf(result.data.embeds[0]);

    assert.match(fields["✨ Pulser desde"], /21 de outubro de 2026/, fields["✨ Pulser desde"]);
    assert.match(fields["📅 Entrou no servidor em"], /3 de março de 2023/, "a data de entrada continua sendo a da interação");
    assert.equal(calls.filter(call => call.includes("/members/")).length, 1, "uma busca do membro");
});

test("no comando de barra, se a interação já trouxe o Pulse, não há chamada à API", async () => {
    const userinfo = (await carregarComandos()).get("userinfo");

    const result = await userinfo.execute({
        guildId: G,
        channelId: "900000000000000099",
        user: {
            id: "200000000000000008", username: "pulsaoutro", displayName: "Pulsa Outro", pulsing: true,
            pulseBadge: { id: "PULSE_1", months: 1 }, nextPulseBadge: { id: "PULSE_2", months: 2, at: NEXT_BADGE_AT }
        },
        member: { joinedAt: Date.UTC(2023, 2, 3, 12, 0) },
        data: { options: {} }
    });

    assert.match(fieldsOf(result.data.embeds[0])["✨ Pulser desde"], /21 de outubro de 2026/);
    assert.deepEqual(calls.filter(call => call.includes("/members/")), []);
});

const PRISMA = "💎 Assinante Prisma+ desde";
const PULSE_FIELDS = ["✨ Pulser desde", "🏅 Insígnia de Pulser atual", "⏭️ Próxima insígnia de Pulser"];

test("quem não tem Prisma+ nem Pulse fica com o cartão limpo: sem esses campos, sem 'não informado'", async () => {
    const embed = embedOf(await run("hui ana"));
    const fields = fieldsOf(embed);

    assert.equal(fields["🏅 Insígnias"], "Nenhuma");
    assert.match(fields["📅 Conta criada em"], /10 de maio de 2024/);
    assert.match(fields["📅 Entrou no servidor em"], /20 de janeiro de 2025/);

    for (const name of [PRISMA, ...PULSE_FIELDS]) {
        assert.ok(!(name in fields), `${name} não deveria aparecer`);
    }

    // nem o espaçador que separava os campos do Pulse
    assert.ok(!embed.fields.some(field => field.name === "​"), "sobrou o campo vazio");

    const text = JSON.stringify(embed);

    assert.doesNotMatch(text, /Não é assinante|Não possui Pulse|Não informado/);

    assert.deepEqual(
        embed.fields.map(field => field.name),
        ["👤 Menção", "🏷️ Tag", "🪪 ID", "🏅 Insígnias", "📅 Conta criada em", "📅 Entrou no servidor em"]
    );
});

test("só Prisma+: mostra o Prisma+ e nenhum campo de Pulse", async () => {
    const embed = embedOf(await run("hui soprisma"));
    const fields = fieldsOf(embed);

    assert.match(fields[PRISMA], /1 de junho de 2025/);

    for (const name of PULSE_FIELDS) {
        assert.ok(!(name in fields), `${name} não deveria aparecer`);
    }

    assert.ok(!embed.fields.some(field => field.name === "​"));
});

test("só Pulse: mostra o bloco do Pulse e nenhum campo de Prisma+", async () => {
    const embed = embedOf(await run("hui pulsaaqui"));
    const fields = fieldsOf(embed);

    assert.ok(!(PRISMA in fields));

    for (const name of PULSE_FIELDS) {
        assert.ok(name in fields, `${name} faltou`);
    }

    // o espaçador continua separando "Pulser desde" das duas insígnias
    assert.ok(embed.fields.some(field => field.name === "​"));
});

test("Prisma+ e Pulse juntos: os dois blocos aparecem, como antes", async () => {
    const fields = fieldsOf(embedOf(await run("hui mariasilva")));

    assert.match(fields[PRISMA], /5 de setembro de 2024/);

    for (const name of PULSE_FIELDS) {
        assert.ok(name in fields, `${name} faltou`);
    }
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

// A mensagem do prefixo (MESSAGE_CREATE) traz só o autor, sem member nem joinedAt (a
// documentação da VSync só põe member nas interações). Por isso o /userinfo da própria
// pessoa pelo prefixo precisa buscar o membro na API para saber quando ela entrou.
test("hui (prefixo) sem argumento mostra quando você entrou no servidor, buscando o membro na API", async () => {
    const r = await run("hui");
    const fields = fieldsOf(embedOf(r));

    assert.match(fields["📅 Entrou no servidor em"], /20 de janeiro de 2025/, fields["📅 Entrou no servidor em"]);
    assert.notEqual(fields["📅 Entrou no servidor em"], UNKNOWN);
    assert.match(fields["📅 Conta criada em"], /10 de maio de 2024/, "a data da conta também vem do membro");

    assert.deepEqual(calls.filter(call => call.includes("/members/")), ["GET /guilds/" + G + "/members/" + ME.id], "uma chamada, na rota de membro");
});

test("o próprio @usuário, por nome, menção ou ID, também mostra a data de entrada", async () => {
    for (const text of ["hui eu", "hui @eu", `hui <@${ME.id}>`, `hui ${ME.id}`]) {
        const fields = fieldsOf(embedOf(await run(text)));

        assert.match(fields["📅 Entrou no servidor em"], /20 de janeiro de 2025/, text);
    }
});

test("no comando de barra a data de entrada vem da própria interação, sem chamar a API", async () => {
    const comandos = await carregarComandos();

    const userinfo = comandos.get("userinfo");

    const result = await userinfo.execute({
        guildId: G,
        channelId: "900000000000000099",
        user: { id: ME.id, username: "eu", displayName: "Eu Mesmo", createdAt: Date.UTC(2024, 4, 10, 15, 30) },
        member: { joinedAt: Date.UTC(2023, 2, 3, 12, 0), nickname: null, roleIds: [], pulsingSince: null, timeoutUntil: null },
        data: { options: {} }
    });

    const fields = fieldsOf(result.data.embeds[0]);

    assert.match(fields["📅 Entrou no servidor em"], /3 de março de 2023/);
    assert.deepEqual(calls.filter(call => call.includes("/members/")), [], "a interação já trazia o membro");
});

test("se a API falhar, o /userinfo da própria pessoa ainda responde, com a data como não informada", async () => {
    failMembers = true;

    const warn = console.warn;

    console.warn = () => {};

    try {
        const r = await run("hui");
        const fields = fieldsOf(embedOf(r));

        assert.equal(r.body, `<@${ME.id}>`);
        assert.match(embedOf(r).author.name, /Eu Mesmo \(eu\)/);
        assert.equal(fields["📅 Entrou no servidor em"], UNKNOWN);
    } finally {
        console.warn = warn;
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
