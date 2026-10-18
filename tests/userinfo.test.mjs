import { db, getPlayer, createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// O contador de visualizações fica no banco, e o teste confere que nenhum arquivo é
// criado. Roda numa pasta temporária para qualquer arquivo perdido não sujar o projeto.
const workDir = mkdtempSync(join(tmpdir(), "helena-userinfo-"));

process.chdir(workDir);

const { clearUserLookupCache } = await import("../services/platform/user-lookup.mjs");
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

// o valor do Tag e do ID vem dentro de um bloco de código de uma linha
const unblock = value => String(value).replace(/^```\n/, "").replace(/\n```$/, "");

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

    assert.equal(embed.author.name, "mariasilva (Maria Silva)", "usuário primeiro, o nome de exibição entre parênteses");
    assert.equal(embed.description, "👤 **Menção:** <@" + MARIA.id + ">");
    assert.equal(embed.author.iconUrl, MARIA.avatarUrl);
    assert.equal(embed.thumbnail.url, MARIA.avatarUrl);

    assert.equal(unblock(fields["🏷️ Tag"]), "mariasilva");
    assert.equal(unblock(fields["🪪 ID"]), MARIA.id);
    assert.match(fields["🏅 Insígnias"], /badge_verified/);
    assert.match(fields["🏅 Insígnias"], /badge_prisma_plus/);

    assert.match(fields["📅 Conta criada em"], /10 de maio de 2024, às 12:30 \(\*\*.+\*\*\)/, "data, hora de Brasília e a idade em negrito");
    assert.match(fields["📥 Entrou no servidor em"], /20 de janeiro de 2025/, "vem da lista de membros");
    assert.match(fields["💎 Assinante Prisma+ desde"], /5 de setembro de 2024/);

    assert.notEqual(fields["✨ Pulser desde"], UNKNOWN);
    assert.match(fields["✨ Pulser desde"], /\(\*\*.+\*\*\)$/, "com a idade em negrito");
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
    assert.match(fields["📥 Entrou no servidor em"], /3 de março de 2023/, "a data de entrada continua sendo a da interação");
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
    assert.match(fields["📥 Entrou no servidor em"], /20 de janeiro de 2025/);

    for (const name of [PRISMA, ...PULSE_FIELDS]) {
        assert.ok(!(name in fields), `${name} não deveria aparecer`);
    }

    // nenhum campo vazio de espaçamento
    assert.ok(!embed.fields.some(field => field.name === "​"), "sobrou o campo vazio");

    const text = JSON.stringify(embed);

    assert.doesNotMatch(text, /Não é assinante|Não possui Pulse|Não informado/);

    // a menção está na descrição (no embed é só um chip), não em um campo
    assert.equal(embed.description, "👤 **Menção:** <@200000000000000004>");

    assert.deepEqual(
        embed.fields.map(field => field.name),
        ["🏷️ Tag", "🪪 ID", "🏅 Insígnias", "📅 Conta criada em", "📥 Entrou no servidor em"]
    );

    // Tag, ID e Insígnias lado a lado; as datas ocupam a linha toda
    assert.deepEqual(embed.fields.map(field => field.inline), [true, true, true, false, false]);
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

    // "Pulser desde" ocupa a linha e as duas insígnias ficam lado a lado embaixo
    const byName = Object.fromEntries(embed.fields.map(field => [field.name, field]));

    assert.equal(byName["✨ Pulser desde"].inline, false);
    assert.equal(byName["🏅 Insígnia de Pulser atual"].inline, true);
    assert.equal(byName["⏭️ Próxima insígnia de Pulser"].inline, true);
    assert.ok(!embed.fields.some(field => field.name === "​"));
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
    assert.equal(unblock(fieldsOf(embedOf(r))["🏷️ Tag"]), "helena");
});

test("sem argumento (ou o próprio @usuário) mostra as suas informações", async () => {
    for (const text of ["hui", "hui eu", "hui @eu", `hui <@${ME.id}>`]) {
        const r = await run(text);

        assert.equal(r.body, `<@${ME.id}>`, text);
        assert.match(embedOf(r).author.name, /^eu \(Eu Mesmo\)$/, text);
    }
});

// A mensagem do prefixo (MESSAGE_CREATE) traz só o autor, sem member nem joinedAt (a
// documentação da VSync só põe member nas interações). Por isso o /userinfo da própria
// pessoa pelo prefixo precisa buscar o membro na API para saber quando ela entrou.
test("hui (prefixo) sem argumento mostra quando você entrou no servidor, buscando o membro na API", async () => {
    const r = await run("hui");
    const fields = fieldsOf(embedOf(r));

    assert.match(fields["📥 Entrou no servidor em"], /20 de janeiro de 2025/, fields["📥 Entrou no servidor em"]);
    assert.notEqual(fields["📥 Entrou no servidor em"], UNKNOWN);
    assert.match(fields["📅 Conta criada em"], /10 de maio de 2024/, "a data da conta também vem do membro");

    assert.deepEqual(calls.filter(call => call.includes("/members/")), ["GET /guilds/" + G + "/members/" + ME.id], "uma chamada, na rota de membro");
});

test("o próprio @usuário, por nome, menção ou ID, também mostra a data de entrada", async () => {
    for (const text of ["hui eu", "hui @eu", `hui <@${ME.id}>`, `hui ${ME.id}`]) {
        const fields = fieldsOf(embedOf(await run(text)));

        assert.match(fields["📥 Entrou no servidor em"], /20 de janeiro de 2025/, text);
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

    assert.match(fields["📥 Entrou no servidor em"], /3 de março de 2023/);
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
        assert.match(embedOf(r).author.name, /^eu \(Eu Mesmo\)$/);
        assert.equal(fields["📥 Entrou no servidor em"], UNKNOWN);
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


// ==========================================
// FORMATO: DATAS E IDADES
// ==========================================

const { formatAge, dateField, dateWithAge } = await import("../services/social/userinfo-format.mjs");
const { savePlayerName } = await import("../services/platform/player-names.mjs");
const { handleUserinfoComponent, knownMembers } = await import("../services/panels/userinfo-panel.mjs");
const { handleModalSubmit } = await import("../services/panels/panels.mjs");
const { buildUserinfoEmbed, buildUserinfoDetail } = await import("../services/social/userinfo-view.mjs");

test("a idade vem em anos, meses e dias de calendário, sem as unidades zeradas", () => {
    // o exemplo do cartão do Zany: conta de 30/09/2016 vista em 15/10/2026
    assert.equal(formatAge(Date.UTC(2016, 8, 30, 23, 55), Date.UTC(2026, 9, 15, 12, 0)), "10 anos 15 dias");

    // "2 anos 5 meses 20 dias" (a data do Nitro do mesmo cartão)
    assert.equal(formatAge(Date.UTC(2024, 3, 27, 17, 40), Date.UTC(2026, 9, 17, 12, 0)), "2 anos 5 meses 20 dias");

    // singular
    assert.equal(formatAge(Date.UTC(2025, 0, 1, 12), Date.UTC(2026, 1, 2, 12)), "1 ano 1 mês 1 dia");

    // só dias, e o mesmo dia
    assert.equal(formatAge(Date.UTC(2026, 9, 1, 12), Date.UTC(2026, 9, 11, 12)), "10 dias");
    assert.equal(formatAge(Date.UTC(2026, 9, 17, 8), Date.UTC(2026, 9, 17, 20)), "menos de 1 dia");

    // virada de ano: 31/12 para 1/3 do ano seguinte
    assert.equal(formatAge(Date.UTC(2025, 11, 31, 12), Date.UTC(2026, 2, 1, 12)), "2 meses 1 dia");

    assert.equal(formatAge(null), null);
    assert.equal(formatAge("lixo"), null);
});

test("a data sai no horário de Brasília, com vírgula e 'às', e a idade em negrito", () => {
    assert.equal(dateField(Date.UTC(2016, 8, 30, 23, 55)), "30 de setembro de 2016, às 20:55");
    assert.equal(dateField(null), UNKNOWN);

    assert.equal(
        dateWithAge(Date.UTC(2016, 8, 30, 23, 55), Date.UTC(2026, 9, 15, 12, 0)),
        "30 de setembro de 2016, às 20:55 (**10 anos 15 dias**)"
    );

    assert.equal(dateWithAge(undefined), UNKNOWN);
});

// ==========================================
// CARTÃO NO ESTILO DO ZANY
// ==========================================

test("Tag e ID vêm em blocos de código; a Menção é a descrição; o rodapé leva o avatar de quem usou", async () => {
    const userinfo = (await carregarComandos()).get("userinfo");

    const result = await userinfo.execute({
        guildId: G,
        channelId: "900000000000000099",
        user: { id: ME.id, username: "eu", displayName: "Eu Mesmo", avatarUrl: "https://cdn.exemplo.test/eu.png", createdAt: Date.UTC(2024, 4, 10, 15, 30) },
        member: { joinedAt: Date.UTC(2023, 2, 3, 12, 0) },
        data: { options: { usuario: "ana" } }
    });

    const embed = result.data.embeds[0];

    assert.equal(embed.fields[0].value, "```\nana\n```");
    assert.equal(embed.fields[1].value, "```\n200000000000000004\n```");
    assert.equal(embed.description, "👤 **Menção:** <@200000000000000004>");
    assert.deepEqual(embed.footer.iconUrl, "https://cdn.exemplo.test/eu.png");
    assert.match(embed.footer.text, /^Comando executado por: Eu Mesmo \| Visualizações: \d+ • /);
});

test("autor, rodapé e nome saem como texto simples: sem barras do escape de markdown", async () => {
    MEMBERS.push(member("200000000000000012", "estrela", "*Estrela_Z*"));

    clearUserLookupCache();

    const embed = embedOf(await run("hui estrela"));

    assert.equal(embed.author.name, "estrela (*Estrela_Z*)");
    assert.doesNotMatch(embed.author.name, /\\/);
});

test("quem já está no último nível do Pulse vê 'Nível máximo alcançado.' no lugar do próximo selo", async () => {
    const fields = fieldsOf(embedOf(await run("hui nivelmaximo")));

    assert.match(fields["⏭️ Próxima insígnia de Pulser"], /pulse_24.*\*\*Nível máximo alcançado\.\*\*/);
    assert.doesNotMatch(fields["⏭️ Próxima insígnia de Pulser"], /Não informado/);
});

// ==========================================
// OS DOIS MENUS
// ==========================================

const comandosOf = () => carregarComandos();

const click = (customId, values, userId = ME.id) => ({
    id: "c1", guildId: G, channelId: "900000000000000099",
    user: { id: userId, username: "eu", displayName: "Eu Mesmo" },
    data: { customId, componentType: "select", values }
});

const selectsOf = r => r.sent[0].components.map(row => row.components[0]);

test("o cartão traz dois menus: 'Mais informações.' e 'Ver informações de outros membros no servidor.'", async () => {
    getPlayer(G, ME.id);
    getPlayer(G, MARIA.id);
    getPlayer(G, "200000000000000004");

    savePlayerName(ME);
    savePlayerName({ id: MARIA.id, username: "mariasilva", displayName: "Maria Silva" });
    savePlayerName({ id: "200000000000000004", username: "ana", displayName: "Ana" });

    const [more, other] = selectsOf(await run("hui mariasilva"));

    assert.equal(more.customId, `userinfo:more:${ME.id}:${MARIA.id}`);
    assert.equal(more.placeholder, "Mais informações.");
    assert.deepEqual(more.options.map(option => option.value), ["avatar", "badges", "dates", "pulse"]);

    assert.equal(other.customId, `userinfo:other:${ME.id}`);
    assert.equal(other.placeholder, "Ver informações de outros membros no servidor.");
    assert.equal(other.options[0].value, "buscar", "a primeira opção abre a busca");

    // quem já joga, menos a pessoa que o cartão mostra
    const ids = other.options.slice(1).map(option => option.value);

    assert.ok(ids.includes(ME.id) && ids.includes("200000000000000004"));
    assert.ok(!ids.includes(MARIA.id));
    assert.ok(other.options.every(option => option.label.length <= 100 && option.value.length <= 100));
});

test("sem Pulse nem avatar, o menu 'Mais informações.' só oferece o que existe", async () => {
    const options = selectsOf(await run("hui carlos"))[0].options.map(option => option.value);

    assert.ok(options.includes("avatar"), "o membro de teste tem avatar");
    assert.ok(!options.includes("pulse"));

    const noAvatar = buildUserinfoEmbed({ user: { id: "1", username: "x", avatarUrl: null } });

    assert.equal(noAvatar.thumbnail, undefined);
    assert.equal(buildUserinfoDetail("avatar", { id: "1", username: "x" }), null);
});

test("os menus têm no máximo 25 opções, mesmo com muita gente jogando", () => {
    for (let i = 0; i < 40; i++) {
        const id = String(300000000000000000n + BigInt(i));

        getPlayer(G, id);
        savePlayerName({ id, username: "p" + i, displayName: "Jogador " + i });
    }

    assert.equal(knownMembers(G).length, 24);
    assert.equal(knownMembers(G, { limit: 5 }).length, 5);
});

test("Mais informações: avatar, insígnias, datas e a evolução do Pulse, em mensagem só de quem pediu", async () => {
    const comandos = await comandosOf();

    const ask = value => handleUserinfoComponent(click(`userinfo:more:${ME.id}:${MARIA.id}`, [value]), comandos);

    const avatar = await ask("avatar");

    assert.equal(avatar.type, "message");
    assert.equal(avatar.data.ephemeral, true);
    assert.equal(avatar.data.embeds[0].image.url, MARIA.avatarUrl);
    assert.match(avatar.data.embeds[0].title, /Avatar de Maria Silva/);

    const badges = (await ask("badges")).data.embeds[0];

    assert.match(badges.description, /Verificado/);
    assert.match(badges.description, /Prisma\+/);

    const dates = (await ask("dates")).data.embeds[0];

    assert.deepEqual(dates.fields.map(field => field.name), [
        "📅 Conta criada em", "📥 Entrou no servidor em", "💎 Assinante Prisma+ desde", "✨ Pulser desde"
    ]);
    assert.match(dates.fields[0].value, /10 de maio de 2024.*\(\*\*.+\*\*\)/);

    const pulse = (await ask("pulse")).data.embeds[0];

    assert.match(pulse.title, /Evolução do Pulse de Maria Silva/);
    assert.equal(pulse.description.split("\n").filter(line => /^[✅⏳]/u.test(line)).length, 9, "um nível por linha");
    assert.match(pulse.description, /✅ .*\*\*1 mês\*\*/u);
    assert.match(pulse.description, /⏳ .*\*\*24 meses\*\* · .+ \(em .+\)/u);
});

test("Mais informações: só quem usou o comando mexe, a opção vazia e a pessoa que sumiu viram aviso", async () => {
    const comandos = await comandosOf();

    const stranger = await handleUserinfoComponent(click(`userinfo:more:${ME.id}:${MARIA.id}`, ["badges"], "999999999999999999"), comandos);

    assert.equal(stranger.data.ephemeral, true);
    assert.match(JSON.stringify(stranger), /outra pessoa/);

    const empty = await handleUserinfoComponent(click(`userinfo:more:${ME.id}:${MARIA.id}`, []), comandos);

    assert.match(JSON.stringify(empty), /Escolha uma opção/);

    const gone = await handleUserinfoComponent(click(`userinfo:more:${ME.id}:999999999999999999`, ["badges"]), comandos);

    assert.match(JSON.stringify(gone), /Pessoa não encontrada/);

    // pulse de quem não pulsa: sem esse detalhe
    const none = await handleUserinfoComponent(click(`userinfo:more:${ME.id}:200000000000000004`, ["pulse"]), comandos);

    assert.match(JSON.stringify(none), /Sem esse detalhe/);
});

test("Outros membros: escolher alguém mostra o cartão dele só para quem pediu; buscar abre o formulário", async () => {
    const comandos = await comandosOf();

    const card = await handleUserinfoComponent(click(`userinfo:other:${ME.id}`, ["200000000000000004"]), comandos);

    assert.equal(card.data.ephemeral, true, "ninguém é notificado: a mensagem é privada");
    assert.equal(card.data.body, "Informações de <@200000000000000004>");
    assert.equal(card.data.embeds[0].author.name, "ana (Ana)");
    assert.equal(card.data.components[0].components[0].customId, `userinfo:more:${ME.id}:200000000000000004`);

    const form = await handleUserinfoComponent(click(`userinfo:other:${ME.id}`, ["buscar"]), comandos);

    assert.equal(form.type, "modal");
    assert.equal(form.data.customId, `userinfo:buscar:${ME.id}`);
    assert.equal(form.data.fields[0].customId, "usuario");

    const stranger = await handleUserinfoComponent(click(`userinfo:other:${ME.id}`, ["buscar"], "999999999999999999"), comandos);

    assert.match(JSON.stringify(stranger), /outra pessoa/);
});

test("o formulário 'Procurar por @usuário...' mostra o cartão (privado) ou explica o que faltou", async () => {
    const comandos = await comandosOf();

    const submit = usuario => handleModalSubmit({
        id: "s1", guildId: G, channelId: "900000000000000099",
        user: { id: ME.id, username: "eu", displayName: "Eu Mesmo" },
        data: { customId: `userinfo:buscar:${ME.id}`, fields: [{ customId: "usuario", value: usuario }] }
    }, comandos);

    const found = await submit("@mariasilva");

    assert.equal(found.data.ephemeral, true);
    assert.equal(found.data.embeds[0].author.name, "mariasilva (Maria Silva)");

    assert.match(JSON.stringify(await submit("   ")), /Faltou a pessoa/);
    assert.match(JSON.stringify(await submit("ninguemassim")), /Usuário não encontrado/);
});
