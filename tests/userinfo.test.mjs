import { db, getPlayer, createPrefixRunner, discordMember, discordGuildFetch } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// O /userinfo no Discord: as insígnias vêm das public_flags da conta, a data da conta do ID,
// e o resto (entrada, impulso, castigo, cargos) do membro. O contador de visualizações fica no
// banco, e o teste confere que nenhum arquivo é criado. Roda numa pasta temporária para qualquer
// arquivo perdido não sujar o projeto.
const workDir = mkdtempSync(join(tmpdir(), "helena-userinfo-"));

process.chdir(workDir);

const { clearUserLookupCache } = await import("../services/platform/user-lookup.mjs");
const { clearAccountCache } = await import("../services/social/userinfo-account.mjs");
const { carregarComandos, resolverComando } = await import("../command-registry.mjs");
const { snowflakeTime } = await import("../services/discord/normalize.mjs");

const G = "900000000000000001";
const ME = { id: "111111111111111111", username: "eu", displayName: "Eu Mesmo" };

const DAY = 24 * 60 * 60 * 1000;

// os bits das insígnias públicas (uma parte do catálogo de userinfo-badges.mjs)
const FLAG = { STAFF: 1 << 0, BRAVERY: 1 << 6, EARLY_SUPPORTER: 1 << 9, VERIFIED_DEVELOPER: 1 << 17 };

const MARIA = discordMember("200000000000000001", "mariasilva", "Maria Silva", null, false, {
    user: { avatar: "abc123", public_flags: FLAG.BRAVERY | FLAG.EARLY_SUPPORTER | FLAG.VERIFIED_DEVELOPER },
    member: {
        roles: ["300000000000000001", "300000000000000002"],
        premium_since: "2025-06-01T15:30:00.000000+00:00"
    }
});

const MEMBERS = [
    discordMember(ME.id, "eu", "Eu Mesmo"),
    MARIA,
    discordMember("200000000000000002", "mariasouza", "Maria Souza"),
    discordMember("200000000000000003", "jose", "José Ávila", "Zezinho"),
    discordMember("200000000000000004", "ana", "Ana"),
    discordMember("200000000000000005", "helena", "Helena", null, true),
    discordMember("200000000000000006", "carlos", "Carlos"),
    discordMember("200000000000000007", "paula", "Paula"),
    discordMember("200000000000000008", "castigado", "Castigado", null, false, {
        member: { communication_disabled_until: new Date(Date.now() + 2 * DAY).toISOString() }
    }),
    discordMember("200000000000000009", "equipe", "Equipe", null, false, { user: { public_flags: FLAG.STAFF } }),

    // quem só o teste do contador de visualizações consulta
    discordMember("200000000000000013", "contagema", "Contagem A"),
    discordMember("200000000000000014", "contagemb", "Contagem B")
];

// perfil público da conta (GET /users/:id), por ID: só o que traz o banner
const ACCOUNTS = {};

// O Discord de mentira: conta as chamadas e pode ficar fora do ar (api.down).
const api = {};

globalThis.fetch = discordGuildFetch(MEMBERS, api, ACCOUNTS);

const run = await createPrefixRunner({ guildId: G, author: ME });

const UNKNOWN = "Não informado";

const embedOf = r => r.sent[0]?.embeds?.[0];

// O cartão tem uma informação por linha no texto ("🏷️ **Tag:** `maria`"): vira { "🏷️ Tag": "`maria`" }.
// Os campos de embed (se houver) entram do mesmo jeito.
const fieldsOf = embed => Object.fromEntries([
    ...String(embed.description ?? "")
        .split("\n")
        .map(line => line.match(/^(\S+) \*\*(.+?):\*\* (.*)$/))
        .filter(Boolean)
        .map(match => [`${match[1]} ${match[2]}`, match[3]]),
    ...(embed.fields ?? []).map(f => [f.name, f.value])
]);

// o valor do Tag e do ID vem entre crases (código de uma linha)
const unblock = value => String(value).replace(/^```\n/, "").replace(/\n```$/, "").replace(/^`|`$/g, "");

const players = () => db.prepare("SELECT COUNT(*) c FROM players").get().c;

test.beforeEach(() => {
    clearUserLookupCache();
    clearAccountCache();

    api.down = false;
    api.searches = 0;
    api.lookups = 0;
    api.accountCalls = 0;

    for (const id of Object.keys(ACCOUNTS)) delete ACCOUNTS[id];
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
    assert.equal(fieldsOf(embedOf(r))["🏅 Insígnias"], "🤖");
});

// ==========================================
// RESULTADO
// ==========================================

test("informações de outra pessoa pelo @usuário: menciona a pessoa e mostra os dados do Discord", async () => {
    const r = await run("hui mariasilva");

    assert.equal(r.body, "Informações de <@200000000000000001>", "a mensagem menciona o dono das informações");

    const embed = embedOf(r);
    const fields = fieldsOf(embed);

    const avatar = "https://cdn.discordapp.com/avatars/200000000000000001/abc123.png?size=256";

    assert.equal(embed.author.name, "mariasilva (Maria Silva)", "usuário primeiro, o nome de exibição entre parênteses");
    assert.equal(embed.description.split("\n")[0], "👤 **Menção:** <@200000000000000001>");
    assert.equal(embed.author.iconUrl, avatar);
    assert.equal(embed.thumbnail.url, avatar);

    assert.equal(unblock(fields["🏷️ Tag"]), "mariasilva");
    assert.equal(unblock(fields["🪪 ID"]), "200000000000000001");

    // as insígnias públicas, só os ícones (os nomes estão em Mais informações), mais a gema do impulso
    assert.equal(fields["🏅 Insígnias"], "🦁 🌠 🧑‍💻 💎");

    // a conta tem a data do ID (a conta mais velha que o bot conhece, de 2016)
    assert.equal(
        fields["📅 Conta criada em"].split(" (**")[0],
        new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" }).format(snowflakeTime("200000000000000001")) +
            ", às " +
            new Intl.DateTimeFormat("pt-BR", { timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(snowflakeTime("200000000000000001"))
    );
    assert.match(fields["📅 Conta criada em"], /\(\*\*.+\*\*\)$/, "com a idade em negrito");

    assert.match(fields["📥 Entrou no servidor em"], /20 de janeiro de 2025/);
    // o impulso: desde quando, e a insígnia de agora e a próxima (nível, tempo e quando chega o próximo)
    assert.match(fields["🚀 Impulsionando este servidor desde"], /01 de junho de 2025, às 12:30 \(\*\*.+\*\*\)/);
    assert.match(fields["🏅 Insígnia de impulso atual"], /^💎 \| \*\*.+\*\*$/);
    assert.match(fields["▶️ Próxima insígnia de impulso"], /^💎 \| em \*\*.+\*\*$/);

    // o Nitro: a Maria não tem avatar animado nem banner, então nada o prova e o cartão não diz nada dele
    assert.equal(fields["💠 Nitro"], undefined);

    // não existe nada de Prisma, Pulse ou tempo de tela no Discord
    assert.ok(!Object.keys(fields).some(name => /Prisma|Pulse|Pulser/.test(name)));
});

test("quem não tem insígnia, Nitro, impulso nem castigo fica com o cartão limpo: sem essas linhas (nada de 'nenhuma')", async () => {
    const embed = embedOf(await run("hui carlos"));

    assert.deepEqual(Object.keys(fieldsOf(embed)), [
        "👤 Menção", "🏷️ Tag", "🪪 ID", "📅 Conta criada em", "📥 Entrou no servidor em"
    ]);

    const text = JSON.stringify(embed);

    assert.doesNotMatch(text, /Nenhuma|Não detectado|Insígnias|Nitro|Impuls/, "o que a Helena não sabe fica de fora");
});

test("a equipe do Discord ganha a insígnia dela (só o ícone no cartão; o nome fica em Mais informações)", async () => {
    assert.equal(fieldsOf(embedOf(await run("hui equipe")))["🏅 Insígnias"], "🔱");
});

test("quem está de castigo vê até quando (e quanto falta)", async () => {
    const fields = fieldsOf(embedOf(await run("hui castigado")));

    // faltam 2 dias (a contagem tem a precisão de 1 segundo, então pode sair "1 dia 23 horas")
    assert.match(fields["⏳ De castigo até"], /em \*\*(2 dias|1 dia 23 horas)\*\*\)$/);
});

test("sem argumento (ou o próprio @usuário) mostra as suas informações", async () => {
    for (const text of ["hui", "hui eu", "hui @eu", `hui <@${ME.id}>`]) {
        const r = await run(text);

        assert.equal(r.body, `<@${ME.id}>`, text);
        assert.match(embedOf(r).author.name, /^eu \(Eu Mesmo\)$/, text);
    }
});

// A mensagem do prefixo pode vir sem o membro (os testes mandam só o autor): o /userinfo da
// própria pessoa busca o membro na API para saber quando ela entrou.
test("hui (prefixo) sem argumento mostra quando você entrou no servidor, buscando o membro na API", async () => {
    const r = await run("hui");
    const fields = fieldsOf(embedOf(r));

    assert.match(fields["📥 Entrou no servidor em"], /20 de janeiro de 2025/, fields["📥 Entrou no servidor em"]);
    assert.notEqual(fields["📥 Entrou no servidor em"], UNKNOWN);
    assert.equal(api.lookups, 1, "uma chamada, na rota de membro");
});

test("o próprio @usuário, por nome, menção ou ID, também mostra a data de entrada", async () => {
    for (const text of ["hui eu", "hui @eu", `hui <@${ME.id}>`, `hui ${ME.id}`]) {
        const fields = fieldsOf(embedOf(await run(text)));

        assert.match(fields["📥 Entrou no servidor em"], /20 de janeiro de 2025/, text);
    }
});

test("no comando de barra a entrada vem da própria interação, sem chamar a API", async () => {
    const comandos = await carregarComandos();

    const userinfo = comandos.get("userinfo");

    const result = await userinfo.execute({
        guildId: G,
        channelId: "900000000000000099",
        user: { id: ME.id, username: "eu", displayName: "Eu Mesmo", createdAt: Date.UTC(2024, 4, 10, 15, 30), publicFlags: FLAG.EARLY_SUPPORTER },
        member: { joinedAt: Date.UTC(2023, 2, 3, 12, 0), nickname: "", roleIds: [], boostingSince: null, timeoutUntil: null },
        data: { options: {} }
    });

    const fields = fieldsOf(result.data.embeds[0]);

    assert.match(fields["📥 Entrou no servidor em"], /3 de março de 2023/);
    assert.match(fields["📅 Conta criada em"], /10 de maio de 2024/);
    assert.equal(fields["🏅 Insígnias"], "🌠");
    assert.equal(api.lookups, 0, "a interação já trazia o membro");
});

test("o prefixo entrega o membro do servidor: o comando usa o que veio na mensagem", async () => {
    const run2 = await createPrefixRunner({ guildId: G, author: ME });

    // sem nenhuma chamada à API: o membro viria na própria mensagem (MESSAGE_CREATE)
    const result = await run2("hui");

    assert.ok(result.sent.length === 1);
});

test("se a API falhar, o /userinfo da própria pessoa ainda responde, com a data como não informada", async () => {
    api.down = true;

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

    assert.match(footer(await run("hui contagema")), /^Comando executado por: Eu Mesmo \| Visualizações: 1$/);
    assert.match(footer(await run("hui contagema")), /Visualizações: 2$/);
    assert.match(footer(await run("hui contagemb")), /Visualizações: 1$/, "cada pessoa tem o seu");

    // a hora vem no timestamp do embed (o app a mostra ao lado do rodapé), não no texto
    const stamp = embedOf(await run("hui contagemb")).timestamp;

    assert.ok(Math.abs(stamp - Date.now()) < 60_000, "o timestamp é o de agora, em milissegundos");

    // a contagem fica no banco do bot, e nenhum arquivo é criado
    assert.equal(db.prepare("SELECT views FROM userinfo_views WHERE user_id = ?").get("200000000000000013").views, 2);
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

    assert.match(userinfo.description, /Discord/);
    assert.equal(resolverComando(comandos, "ui")?.name, "userinfo");
});

// ==========================================
// FORMATO: DATAS E IDADES
// ==========================================

const { formatAge, dateField, dateWithAge, formatCountdown } = await import("../services/social/userinfo-format.mjs");
const { savePlayerName } = await import("../services/platform/player-names.mjs");
const { handleUserinfoComponent, knownMembers } = await import("../services/panels/userinfo-panel.mjs");
const { handleModalSubmit } = await import("../services/panels/panels.mjs");
const { buildUserinfoEmbed, buildUserinfoDetail, detailOptions, largeImage } = await import("../services/social/userinfo-view.mjs");
const { getUserBadges, BADGE_IDS } = await import("../services/social/userinfo-badges.mjs");

test("a idade é o tempo que de fato passou, nas três maiores unidades, sem as zeradas", () => {
    // os três casos do cartão de referência (conta, assinatura do Nitro e entrada no servidor), em Brasília
    const now = Date.UTC(2026, 9, 25, 20, 26);

    assert.equal(formatAge(Date.UTC(2024, 4, 5, 23, 9), now), "2 anos 5 meses 19 dias");
    assert.equal(formatAge(Date.UTC(2026, 2, 7, 12, 18), now), "7 meses 18 dias 8 horas");
    assert.equal(formatAge(Date.UTC(2026, 9, 25, 0, 34), now), "19 horas 52 minutos");

    // conta de 30/09/2016 (20:55 em Brasília) vista em 15/10/2026 (09:00)
    assert.equal(formatAge(Date.UTC(2016, 8, 30, 23, 55), Date.UTC(2026, 9, 15, 12, 0)), "10 anos 14 dias");

    assert.equal(formatAge(Date.UTC(2024, 3, 27, 17, 40), Date.UTC(2026, 9, 17, 12, 0)), "2 anos 5 meses 19 dias");

    // singular
    assert.equal(formatAge(Date.UTC(2025, 0, 1, 12), Date.UTC(2026, 1, 2, 12)), "1 ano 1 mês 1 dia");

    // só dias
    assert.equal(formatAge(Date.UTC(2026, 9, 1, 12), Date.UTC(2026, 9, 11, 12)), "10 dias");

    // abaixo de 24 horas: horas e minutos (entrou há 20 horas não é "1 dia")
    assert.equal(formatAge(Date.UTC(2026, 9, 17, 8), Date.UTC(2026, 9, 17, 20)), "12 horas");
    assert.equal(formatAge(Date.UTC(2026, 9, 25, 0, 34), Date.UTC(2026, 9, 25, 21, 8)), "20 horas 34 minutos");
    assert.equal(formatAge(Date.UTC(2026, 9, 25, 20, 0), Date.UTC(2026, 9, 25, 21, 1)), "1 hora 1 minuto");
    assert.equal(formatAge(Date.UTC(2026, 9, 25, 20, 0), Date.UTC(2026, 9, 25, 20, 40)), "40 minutos");
    assert.equal(formatAge(Date.UTC(2026, 9, 25, 20, 0), Date.UTC(2026, 9, 25, 20, 0, 30)), "menos de 1 minuto");

    // a partir de 1 dia, as três maiores unidades (as menores ficam de fora)
    assert.equal(formatAge(Date.UTC(2026, 9, 24, 12), Date.UTC(2026, 9, 25, 12)), "1 dia");
    assert.equal(formatAge(Date.UTC(2026, 9, 1, 12), Date.UTC(2026, 9, 3, 16, 30)), "2 dias 4 horas 30 minutos");

    // uma data no futuro (relógio torto) não vira tempo negativo
    assert.equal(formatAge(Date.UTC(2026, 9, 25, 20), Date.UTC(2026, 9, 25, 19)), "menos de 1 minuto");

    // virada de ano e mês curto: 31/12 para 1/3, e 31/01 para 1/03 de um ano bissexto
    assert.equal(formatAge(Date.UTC(2025, 11, 31, 12), Date.UTC(2026, 2, 1, 12)), "2 meses 1 dia");
    assert.equal(formatAge(Date.UTC(2024, 0, 31, 12), Date.UTC(2024, 2, 1, 12)), "1 mês 1 dia");

    assert.equal(formatAge(null), null);
    assert.equal(formatAge("lixo"), null);
});

test("a data sai no horário de Brasília, com o dia de dois dígitos, vírgula e 'às', e a idade em negrito", () => {
    assert.equal(dateField(Date.UTC(2016, 8, 30, 23, 55)), "30 de setembro de 2016, às 20:55");
    assert.equal(dateField(Date.UTC(2024, 4, 5, 23, 9)), "05 de maio de 2024, às 20:09", "o dia leva zero à esquerda");
    assert.equal(dateField(Date.UTC(2026, 2, 7, 15), { time: false }), "07 de março de 2026", "sem a hora (data informada só com o dia)");
    assert.equal(dateField(null), UNKNOWN);

    assert.equal(
        dateWithAge(Date.UTC(2016, 8, 30, 23, 55), Date.UTC(2026, 9, 15, 12, 0)),
        "30 de setembro de 2016, às 20:55 (**10 anos 14 dias**)"
    );

    assert.equal(
        dateWithAge(Date.UTC(2026, 2, 7, 15), Date.UTC(2026, 9, 25, 20, 26), { time: false }),
        "07 de março de 2026 (**7 meses 18 dias 5 horas**)"
    );

    assert.equal(dateWithAge(undefined), UNKNOWN);
});

const NOW0 = Date.UTC(2026, 9, 17, 12, 0);

test("o que falta para o fim do castigo sai em meses, dias e horas", () => {
    // 17/10/2026 12:00 -> 27/04/2027 11:00 UTC
    assert.equal(formatCountdown(NOW0, Date.UTC(2027, 3, 27, 11, 0)), "6 meses 9 dias 23 horas");
    assert.equal(formatCountdown(NOW0, NOW0 + 3 * 3_600_000), "3 horas");
    assert.equal(formatCountdown(NOW0, NOW0 + 40 * 60_000), "menos de 1 hora");
    assert.equal(formatCountdown(NOW0, Date.UTC(2028, 9, 18, 12, 0)), "2 anos 1 dia");
    assert.equal(formatCountdown(NOW0, NOW0 - 1000), "agora");
    assert.equal(formatCountdown(null, NOW0), UNKNOWN);
});

// ==========================================
// INSÍGNIAS
// ==========================================

test("cada bit das insígnias públicas vira o ícone e o nome certos, na ordem do catálogo", () => {
    const all = Object.values({
        STAFF: 1 << 0, PARTNER: 1 << 1, HYPESQUAD_EVENTS: 1 << 2, BUG_HUNTER_LEVEL_1: 1 << 3, HOUSE_BRAVERY: 1 << 6,
        HOUSE_BRILLIANCE: 1 << 7, HOUSE_BALANCE: 1 << 8, EARLY_SUPPORTER: 1 << 9, BUG_HUNTER_LEVEL_2: 1 << 14,
        VERIFIED_BOT: 1 << 16, VERIFIED_DEVELOPER: 1 << 17, CERTIFIED_MODERATOR: 1 << 18, ACTIVE_DEVELOPER: 1 << 22
    }).reduce((total, bit) => total | bit, 0);

    const badges = getUserBadges({ publicFlags: all });

    assert.equal(badges.length, 13);
    assert.ok(badges.every(badge => badge.emoji && badge.name));
    assert.equal(new Set(badges.map(badge => badge.emoji)).size, 13 - 1 + 1 - 1 + 1 - 0, "nenhum ícone repetido");

    assert.deepEqual(badges.map(badge => badge.id), [
        "STAFF", "PARTNER", "CERTIFIED_MODERATOR", "HYPESQUAD_EVENTS", "HOUSE_BRAVERY", "HOUSE_BRILLIANCE",
        "HOUSE_BALANCE", "BUG_HUNTER_LEVEL_1", "BUG_HUNTER_LEVEL_2", "EARLY_SUPPORTER", "VERIFIED_DEVELOPER",
        "ACTIVE_DEVELOPER", "VERIFIED_BOT"
    ]);

    // o catálogo e a lista pública dos ids coincidem (o impulso é o único que não vem dos bits)
    assert.deepEqual([...BADGE_IDS].sort(), [...badges.map(badge => badge.id), "BOOSTER"].sort());
});

test("sem bits, sem insígnia; bits que o Discord criar depois são ignorados; o impulso soma a dele", () => {
    assert.deepEqual(getUserBadges({}), []);
    assert.deepEqual(getUserBadges({ publicFlags: 0 }), []);
    assert.deepEqual(getUserBadges({ publicFlags: 1 << 30 }), [], "um bit que o catálogo não conhece não aparece");
    assert.deepEqual(getUserBadges({ publicFlags: "lixo" }), []);

    assert.deepEqual(getUserBadges({ boostingSince: Date.now() }).map(badge => badge.id), ["BOOSTER"]);
});

// ==========================================
// O CARTÃO
// ==========================================

test("a Menção é a descrição; Tag e ID vêm em blocos de código, lado a lado; o rodapé leva o avatar de quem usou", async () => {
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
    assert.equal(embed.fields[0].inline, true);
    assert.equal(embed.fields[1].inline, true);
    assert.equal(embed.description, "👤 **Menção:** <@200000000000000004>");
    assert.deepEqual(embed.footer.iconUrl, "https://cdn.exemplo.test/eu.png");
    assert.match(embed.footer.text, /^Comando executado por: Eu Mesmo \| Visualizações: \d+$/);
});

test("autor, rodapé e nome saem como texto simples: sem barras do escape de markdown", async () => {
    MEMBERS.push(discordMember("200000000000000012", "estrela", "*Estrela_Z*"));

    clearUserLookupCache();

    const embed = embedOf(await run("hui estrela"));

    assert.equal(embed.author.name, "estrela (*Estrela_Z*)");
    assert.doesNotMatch(embed.author.name, /\\/);
});

test("bots mostram o 🤖, e o castigo que já acabou não aparece", () => {
    const bot = fieldsOf(buildUserinfoEmbed({ user: { id: "1", username: "b", bot: true }, now: NOW0 }));

    assert.equal(bot["🏅 Insígnias"], "🤖");

    const punished = fieldsOf(buildUserinfoEmbed({
        user: { id: "1", username: "b", timeoutUntil: NOW0 + 3_600_000 },
        now: NOW0
    }));

    assert.match(punished["⏳ De castigo até"], /em \*\*1 hora\*\*\)$/);

    assert.ok(!("⏳ De castigo até" in fieldsOf(buildUserinfoEmbed({ user: { id: "1", username: "b", timeoutUntil: NOW0 - 1 }, now: NOW0 }))));
});

// ==========================================
// OS DOIS MENUS
// ==========================================

const click = (customId, values, userId = ME.id) => ({
    id: "c1", guildId: G, channelId: "900000000000000099",
    user: { id: userId, username: "eu", displayName: "Eu Mesmo" },
    data: { customId, componentType: 3, values }
});

const selectsOf = r => r.sent[0].components.map(row => row.components[0]);

test("o cartão traz dois menus: 'Mais informações.' e 'Ver informações de outros membros no servidor.'", async () => {
    getPlayer(G, ME.id);
    getPlayer(G, MARIA.user.id);
    getPlayer(G, "200000000000000004");

    savePlayerName(ME);
    savePlayerName({ id: MARIA.user.id, username: "mariasilva", displayName: "Maria Silva" });
    savePlayerName({ id: "200000000000000004", username: "ana", displayName: "Ana" });

    const [more, other] = selectsOf(await run("hui mariasilva"));

    assert.equal(more.customId, `userinfo:more:${ME.id}:${MARIA.user.id}`);
    assert.equal(more.placeholder, "Mais informações.");
    assert.deepEqual(
        more.options.map(option => option.value),
        ["avatar", "banner", "colors", "badges", "nitro", "dates", "names", "oldavatars", "oldbanners", "roles"],
        "sem o item 'Meu histórico': ele só aparece no próprio cartão"
    );

    assert.equal(other.customId, `userinfo:other:${ME.id}`);
    assert.equal(other.placeholder, "Ver informações de outros membros no servidor.");
    assert.equal(other.options[0].value, "buscar", "a primeira opção abre a busca");

    // quem já joga, menos a pessoa que o cartão mostra
    const ids = other.options.slice(1).map(option => option.value);

    assert.ok(ids.includes(ME.id) && ids.includes("200000000000000004"));
    assert.ok(!ids.includes(MARIA.user.id));
    assert.ok(other.options.every(option => option.label.length <= 100 && option.value.length <= 100));
});

test("quem não tem cargos não ganha a opção Cargos, e sem avatar não ganha Avatar", async () => {
    const options = selectsOf(await run("hui carlos"))[0].options.map(option => option.value);

    assert.deepEqual(options, ["avatar", "banner", "colors", "badges", "nitro", "dates", "names", "oldavatars", "oldbanners"]);

    const noAvatar = buildUserinfoEmbed({ user: { id: "1", username: "x", avatarUrl: null } });

    assert.equal(noAvatar.thumbnail, undefined);
    assert.equal(buildUserinfoDetail("avatar", { id: "1", username: "x" }), null);

    assert.deepEqual(
        detailOptions({ id: "1", username: "x" }).map(option => option.value),
        ["banner", "colors", "badges", "nitro", "dates", "names", "oldavatars", "oldbanners"]
    );
    assert.ok(detailOptions({ id: "1", username: "x", avatarUrl: "https://a.test/a.png", roleIds: ["r"] }).length <= 25);
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

test("Mais informações: insígnias, datas e cargos, em mensagem só de quem pediu", async () => {
    const comandos = await carregarComandos();

    const ask = value => handleUserinfoComponent(click(`userinfo:more:${ME.id}:${MARIA.user.id}`, [value]), comandos);

    const first = await ask("badges");

    assert.equal(first.type, "message");
    assert.equal(first.data.ephemeral, true);

    const badges = first.data.embeds[0];

    assert.match(badges.title, /Insígnias de Maria Silva/);
    // cada insígnia com o nome e o que ela quer dizer
    assert.match(badges.description, /🦁 \*\*HypeSquad Bravery\*\*\n-# Casa Bravery do HypeSquad\./);
    assert.match(badges.description, /🌠 \*\*Apoiador inicial\*\*/);
    assert.match(badges.description, /🚀 \*\*Impulsiona este servidor\*\*/);
    assert.match(badges.description, /não informa a bots/, "o aviso do que o Discord não entrega");

    const dates = (await ask("dates")).data.embeds[0];

    assert.deepEqual(dates.fields.map(field => field.name), [
        "📅 Conta criada em", "📥 Entrou no servidor em", "🚀 Impulsionando este servidor desde"
    ]);

    // os cargos viram menções de cargo (no embed são só chips, não avisam ninguém)
    const roles = (await ask("roles")).data.embeds[0];

    assert.equal(roles.title, "🎭 Cargos de Maria Silva (2)");
    assert.equal(roles.description, "<@&300000000000000001> <@&300000000000000002>");
});

test("Mais informações: só quem usou o comando mexe, a opção vazia e a pessoa que sumiu viram aviso", async () => {
    const comandos = await carregarComandos();

    const stranger = await handleUserinfoComponent(click(`userinfo:more:${ME.id}:${MARIA.user.id}`, ["badges"], "999999999999999999"), comandos);

    assert.equal(stranger.data.ephemeral, true);
    assert.match(JSON.stringify(stranger), /outra pessoa/);

    const empty = await handleUserinfoComponent(click(`userinfo:more:${ME.id}:${MARIA.user.id}`, []), comandos);

    assert.match(JSON.stringify(empty), /Escolha uma opção/);

    const gone = await handleUserinfoComponent(click(`userinfo:more:${ME.id}:999999999999999999`, ["badges"]), comandos);

    assert.match(JSON.stringify(gone), /Pessoa não encontrada/);

    // cargos de quem não tem cargo nenhum: sem esse detalhe
    const none = await handleUserinfoComponent(click(`userinfo:more:${ME.id}:200000000000000004`, ["roles"]), comandos);

    assert.match(JSON.stringify(none), /Sem esse detalhe/);
});

// ==========================================
// AVATAR E BANNER
// ==========================================

test("o avatar abre em embed privado, em tamanho grande, com o link para o original", async () => {
    const comandos = await carregarComandos();

    const result = await handleUserinfoComponent(click(`userinfo:more:${ME.id}:${MARIA.user.id}`, ["avatar"]), comandos);

    const embed = result.data.embeds[0];

    assert.equal(result.data.ephemeral, true);
    assert.equal(embed.title, "🖼️ Avatar de Maria Silva");
    assert.equal(embed.image.url, "https://cdn.discordapp.com/avatars/200000000000000001/abc123.png?size=1024");
    assert.equal(embed.description, `[Abrir em tamanho original](${embed.image.url})`);

    assert.equal(largeImage("https://x.test/a.png?size=256"), "https://x.test/a.png?size=1024");
});

test("o banner vem do perfil completo da conta (uma busca, guardada por um minuto)", async () => {
    const comandos = await carregarComandos();

    ACCOUNTS[MARIA.user.id] = { id: MARIA.user.id, username: "mariasilva", banner: "bnr456", accent_color: 0x8555ff };

    // o cartão busca o perfil da conta uma vez (banner, flags completas, etiqueta); as telas seguintes
    // reaproveitam o que ficou guardado por um minuto, e as de avatar e datas nem precisam dele
    await run("hui mariasilva");

    assert.equal(api.accountCalls, 1);

    await handleUserinfoComponent(click(`userinfo:more:${ME.id}:${MARIA.user.id}`, ["avatar"]), comandos);
    await handleUserinfoComponent(click(`userinfo:more:${ME.id}:${MARIA.user.id}`, ["dates"]), comandos);

    assert.equal(api.accountCalls, 1);

    const result = await handleUserinfoComponent(click(`userinfo:more:${ME.id}:${MARIA.user.id}`, ["banner"]), comandos);

    assert.equal(api.accountCalls, 1, "o perfil já estava guardado");
    assert.equal(result.data.embeds[0].title, "🌌 Banner de Maria Silva");
    assert.equal(result.data.embeds[0].image.url, "https://cdn.discordapp.com/banners/200000000000000001/bnr456.png?size=1024");
});

test("quem não tem banner, ou se o perfil da conta falhar: a tela diz que não tem, sem quebrar", async () => {
    const comandos = await carregarComandos();

    const none = await handleUserinfoComponent(click(`userinfo:more:${ME.id}:200000000000000004`, ["banner"]), comandos);

    assert.match(none.data.embeds[0].description, /não tem um banner/);

    api.down = true;

    const warn = console.warn;

    console.warn = () => {};

    try {
        // com a API fora do ar nem o membro é achado: vira o aviso de pessoa não encontrada
        const down = await handleUserinfoComponent(click(`userinfo:more:${ME.id}:${MARIA.user.id}`, ["banner"]), comandos);

        assert.ok(JSON.stringify(down).length > 0);
    } finally {
        console.warn = warn;
    }
});

// ==========================================
// OUTROS MEMBROS
// ==========================================

test("Outros membros: escolher alguém mostra o cartão dele só para quem pediu; buscar abre o formulário", async () => {
    const comandos = await carregarComandos();

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
    const comandos = await carregarComandos();

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

// ==========================================
// HISTÓRICO: AS PALAVRAS NO COMANDO E O QUE O USO GRAVA
// ==========================================

test("hui ocultar, hui mostrar e hui apagar mexem no histórico de quem usou, sem mostrar cartão", async () => {
    const { isHidden } = await import("../services/social/userinfo-history.mjs");

    const hide = await run("hui ocultar");

    assert.match(embedOf(hide).title, /Histórico oculto/);
    assert.equal(isHidden(ME.id), true);
    assert.equal(hide.sent[0].components[0].components.length, 3, "os três botões");
    assert.notEqual(hide.body, `<@${ME.id}>`, "não é o cartão");

    assert.match(embedOf(await run("hui mostrar")).title, /Histórico visível/);
    assert.equal(isHidden(ME.id), false);

    assert.match(embedOf(await run("hui apagar")).title, /Histórico apagado/);
    assert.match(embedOf(await run("hui privar")).title, /Seu histórico do \/userinfo/);

    // um @usuário comum continua sendo busca (ninguém tem o @ "ocultar" aqui, e o texto não é ação)
    assert.match((await run("hui ocultarpessoa")).title, /Usuário não encontrado/);
});

test("usar um comando grava o @usuário, o nome e a foto de quem usou (e o /userinfo grava o banner de quem já usa a Helena)", async () => {
    const { readHistory, resetHistoryMemory } = await import("../services/social/userinfo-history.mjs");

    resetHistoryMemory();

    const before = readHistory(ME.id).usernames.length;

    await run("hui");

    const history = readHistory(ME.id);

    assert.ok(history.usernames.length >= Math.max(1, before));
    assert.equal(history.usernames[0].value, "eu");
    assert.equal(history.tracked, true);
});
