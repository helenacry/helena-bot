import { getPlayer } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// As datas de Nitro e de impulso que a própria pessoa informa (o Discord não as entrega a bots), a escada
// de insígnias de Nitro e o cartão com as linhas de "Assinante Nitro desde" e "Impulsionando desde".

const { nitroLadder, NITRO_MONTHS, NITRO_TIERS } = await import("../services/social/userinfo-badges.mjs");
const { parseDeclaredDate, getDeclared, setDeclared, clearDeclared, withDeclared } = await import("../services/social/userinfo-declared.mjs");
const { privacyView } = await import("../services/social/userinfo-privacy.mjs");
const { buildUserinfoEmbed, buildUserinfoDetail } = await import("../services/social/userinfo-view.mjs");
const { handleUserinfoComponent } = await import("../services/panels/userinfo-panel.mjs");
const { handleModalSubmit } = await import("../services/panels/panels.mjs");
const { setAppEmojis } = await import("../services/platform/app-emojis.mjs");
const { savePlayerName } = await import("../services/platform/player-names.mjs");

const G = "900000000000000001";

// 25/10/2026 17:26 em Brasília
const NOW = Date.UTC(2026, 9, 25, 20, 26);

const fieldsOf = embed => Object.fromEntries((embed.fields ?? []).map(field => [field.name, field.value]));

let counter = 0;

function person() {
    counter += 1;

    const user = { id: String(710000000000000000n + BigInt(counter)), username: "pessoa" + counter, displayName: "Pessoa " + counter };

    getPlayer(G, user.id);
    savePlayerName(user);

    return user;
}

test.afterEach(() => setAppEmojis([]));

// ==========================================
// A ESCADA DE NITRO
// ==========================================

test("a escada de Nitro tem 8 níveis (Bronze a Fogo), nos meses da lista pública das insígnias", () => {
    assert.deepEqual([...NITRO_MONTHS], [1, 3, 6, 12, 24, 36, 60, 72]);
    assert.deepEqual([...NITRO_TIERS], ["Bronze", "Prata", "Ouro", "Platina", "Diamante", "Esmeralda", "Rubi", "Fogo"]);

    // 07/03/2026 09:18 em Brasília: 7 meses depois é Ouro (6 meses) e a Platina (12) chega em 07/03/2027
    const since = Date.UTC(2026, 2, 7, 12, 18);

    const ladder = nitroLadder(since, NOW);

    assert.equal(ladder.levels, 8);
    assert.equal(ladder.level, 3);
    assert.equal(NITRO_TIERS[ladder.level - 1], "Ouro");
    assert.equal(ladder.next.level, 4);
    assert.equal(ladder.next.months, 12);
    assert.equal(ladder.next.at, Date.UTC(2027, 2, 7, 12, 18));

    // 6 anos ou mais: Fogo, o máximo, e nada depois
    const top = nitroLadder(Date.UTC(2019, 0, 1), NOW);

    assert.equal(top.level, 8);
    assert.equal(top.next, null);

    assert.equal(nitroLadder(null), null);
    assert.equal(nitroLadder(0), null);
});

// ==========================================
// LER A DATA QUE A PESSOA DIGITA
// ==========================================

test("a data digitada vira o horário de Brasília: só o dia (meio-dia) ou o dia e a hora", () => {
    // sem a hora: 12:00 em Brasília (15:00 UTC), e "exact" falso
    assert.deepEqual(parseDeclaredDate("07/03/2026", "nitro", NOW), { ok: true, time: Date.UTC(2026, 2, 7, 15, 0), exact: false });

    // com a hora: 09:18 em Brasília (12:18 UTC)
    assert.deepEqual(parseDeclaredDate("07/03/2026 09:18", "nitro", NOW), { ok: true, time: Date.UTC(2026, 2, 7, 12, 18), exact: true });

    // outros separadores e dia sem zero
    for (const text of ["7-3-2026", "07.03.2026", "  07/03/2026  ", "07/03/2026 9h18", "07/03/2026, 09:18"]) {
        assert.equal(parseDeclaredDate(text, "nitro", NOW).ok, true, text);
    }
});

test("data que não existe, que ainda não chegou ou que é de antes do Nitro e dos impulsos é recusada com o motivo", () => {
    const bad = (text, kind = "nitro") => parseDeclaredDate(text, kind, NOW);

    for (const text of ["", "ontem", "2026-03-07", "07/03", "31/02/2026", "32/01/2026", "07/13/2026", "07/03/2026 25:00", "07/03/2026 10:60"]) {
        const result = bad(text);

        assert.equal(result.ok, false, text);
        assert.ok(result.reason.length > 10, text);
    }

    assert.match(bad("26/10/2026").reason, /ainda não chegou/);
    assert.match(bad("01/01/2016").reason, /desde 2017/);
    assert.match(bad("01/01/2018", "boost").reason, /desde 2019/);
    assert.equal(bad("01/01/2018", "nitro").ok, true, "o Nitro já existia em 2018");
});

// ==========================================
// GUARDAR
// ==========================================

test("guardar, ler, tirar uma e apagar as duas; uma pessoa não vê a data da outra", () => {
    const a = person();
    const b = person();

    assert.deepEqual(getDeclared(a.id), { nitroSince: null, nitroExact: false, boostSince: null, boostExact: false });

    setDeclared(a.id, "nitro", Date.UTC(2026, 2, 7, 12, 18), true);
    setDeclared(a.id, "boost", Date.UTC(2024, 5, 2, 0, 28), false);

    assert.deepEqual(getDeclared(a.id), {
        nitroSince: Date.UTC(2026, 2, 7, 12, 18), nitroExact: true,
        boostSince: Date.UTC(2024, 5, 2, 0, 28), boostExact: false
    });

    assert.equal(getDeclared(b.id).nitroSince, null);

    setDeclared(a.id, "nitro", null);

    assert.equal(getDeclared(a.id).nitroSince, null);
    assert.ok(getDeclared(a.id).boostSince, "a outra data fica");

    assert.equal(clearDeclared(a.id), 1);
    assert.equal(getDeclared(a.id).boostSince, null);
    assert.equal(clearDeclared(a.id), 0);

    // sem nenhuma das duas, a linha some
    setDeclared(a.id, "boost", Date.UTC(2024, 5, 2), true);
    setDeclared(a.id, "boost", null);

    assert.equal(clearDeclared(a.id), 0, "a linha vazia não fica no banco");

    assert.throws(() => setDeclared(a.id, "email", 1), /desconhecido/);
});

test("withDeclared põe no usuário só o que existe, sem mexer no resto", () => {
    const user = person();

    assert.deepEqual(withDeclared(user), user);

    setDeclared(user.id, "nitro", Date.UTC(2026, 2, 7, 12, 18), true);

    const filled = withDeclared(user);

    assert.equal(filled.nitroSince, Date.UTC(2026, 2, 7, 12, 18));
    assert.equal(filled.nitroSinceExact, true);
    assert.equal(filled.declaredBoostSince, undefined);
    assert.equal(filled.username, user.username);

    assert.equal(withDeclared(null), null);
    assert.deepEqual(withDeclared({}), {});
});

// ==========================================
// O CARTÃO
// ==========================================

const INFORMED = "\n-# informado pela própria pessoa";

test("o cartão de quem informou as datas: assinante desde, impulsionando desde e as duas insígnias lado a lado", () => {
    const user = {
        id: "1", username: "orlg", displayName: "Orlg", createdAt: Date.UTC(2024, 4, 5, 23, 9), joinedAt: Date.UTC(2026, 9, 25, 0, 34),
        nitroSince: Date.UTC(2026, 2, 7, 12, 18), nitroSinceExact: true,
        declaredBoostSince: Date.UTC(2024, 5, 2, 0, 28), declaredBoostSinceExact: true
    };

    const card = buildUserinfoEmbed({ user, now: NOW });

    const fields = fieldsOf(card);

    assert.deepEqual(card.fields.map(field => field.name), [
        "🏷️ Tag", "🪪 ID", "🏅 Insígnias",
        "📅 Conta criada em", "📥 Entrou no servidor em",
        "💠 Assinante Nitro desde", "🚀 Impulsionando desde",
        "🏅 Insígnia de impulso atual", "▶️ Próxima insígnia de impulso",
        "🏅 Insígnia de nitro atual", "▶️ Próxima insígnia de nitro"
    ]);

    assert.equal(fields["📅 Conta criada em"], "05 de maio de 2024, às 20:09 (**2 anos 5 meses 19 dias**)");
    assert.equal(fields["📥 Entrou no servidor em"], "24 de outubro de 2026, às 21:34 (**19 horas 52 minutos**)");

    // a data e a idade da assinatura, com a marca de que foi a pessoa que informou
    assert.equal(fields["💠 Assinante Nitro desde"], "07 de março de 2026, às 09:18 (**7 meses 18 dias 8 horas**)" + INFORMED);
    assert.equal(fields["🚀 Impulsionando desde"], "01 de junho de 2024, às 21:28 (**2 anos 4 meses 23 dias**)" + INFORMED);

    // as duas escadas: o ícone do nível | quanto tempo, e o próximo | quando chega
    assert.equal(fields["🏅 Insígnia de impulso atual"], "💎 | **2 anos 4 meses 23 dias**");
    assert.equal(fields["▶️ Próxima insígnia de impulso"], "💎 | **Nível máximo alcançado.**");
    assert.equal(fields["🏅 Insígnia de nitro atual"], "💠 | **7 meses 18 dias 8 horas**");
    assert.match(fields["▶️ Próxima insígnia de nitro"], /^💠 \| em \*\*4 meses \d+ dias \d+ horas\*\*$/);

    assert.ok(card.fields.slice(-4).every(field => field.inline), "as insígnias de impulso e de Nitro ficam lado a lado");

    // as insígnias do cartão: o medalhão do Nitro e a gema do impulso, só os ícones
    assert.equal(fields["🏅 Insígnias"], "💠 💎");

    // o Nitro deduzido não aparece quando a data da assinatura existe
    assert.equal(fields["💠 Nitro"], undefined);
});

test("com os desenhos no aplicativo, o cartão usa o medalhão do nível de Nitro e a gema do nível de impulso", () => {
    setAppEmojis([
        ...Array.from({ length: 8 }, (_unused, index) => ({ id: String(600000000000000000n + BigInt(index)), name: `h_nitro_${index + 1}`, animated: false })),
        ...Array.from({ length: 9 }, (_unused, index) => ({ id: String(500000000000000000n + BigInt(index)), name: `h_boost_${index + 1}`, animated: false }))
    ]);

    const user = {
        id: "1", username: "orlg", createdAt: 0,
        nitroSince: Date.UTC(2026, 2, 7, 12, 18), declaredBoostSince: Date.UTC(2024, 5, 2, 0, 28)
    };

    const fields = fieldsOf(buildUserinfoEmbed({ user, now: NOW }));

    // Ouro (nível 3) e a gema 9
    assert.equal(fields["🏅 Insígnias"], "<:h_nitro_3:600000000000000002> <:h_boost_9:500000000000000008>");
    assert.match(fields["🏅 Insígnia de nitro atual"], /^<:h_nitro_3:600000000000000002> \| /);
    assert.match(fields["▶️ Próxima insígnia de nitro"], /^<:h_nitro_4:600000000000000003> \| em /);
});

test("a data informada só marca 'informado' quando é a que vale; o impulso do servidor, se mais antigo, vence", () => {
    const base = { id: "1", username: "ana", createdAt: 0 };

    // só o impulso do servidor: sem a marca e com o título do servidor
    const server = fieldsOf(buildUserinfoEmbed({ user: { ...base, boostingSince: Date.UTC(2025, 5, 1, 15, 30) }, now: NOW }));

    assert.ok(!server["🚀 Impulsionando este servidor desde"].includes("informado"));
    assert.equal(server["🚀 Impulsionando desde"], undefined);

    // o informado é mais antigo que o do servidor: vale o informado (o impulso conta em qualquer servidor)
    const both = fieldsOf(buildUserinfoEmbed({
        user: { ...base, boostingSince: Date.UTC(2025, 5, 1, 15, 30), declaredBoostSince: Date.UTC(2024, 5, 2, 0, 28), declaredBoostSinceExact: true },
        now: NOW
    }));

    assert.ok(both["🚀 Impulsionando desde"].endsWith(INFORMED));
    assert.match(both["🚀 Impulsionando desde"], /^01 de junho de 2024, às 21:28/);

    // o do servidor é mais antigo que o informado: vale o do servidor, sem a marca
    const older = fieldsOf(buildUserinfoEmbed({
        user: { ...base, boostingSince: Date.UTC(2024, 0, 1, 15, 0), declaredBoostSince: Date.UTC(2025, 5, 2, 0, 28), declaredBoostSinceExact: true },
        now: NOW
    }));

    assert.match(older["🚀 Impulsionando este servidor desde"], /^01 de janeiro de 2024/);
    assert.ok(!older["🚀 Impulsionando este servidor desde"].includes("informado"));

    // data informada só com o dia: sem "às 12:00" inventado
    const dayOnly = fieldsOf(buildUserinfoEmbed({ user: { ...base, nitroSince: Date.UTC(2026, 2, 7, 15, 0), nitroSinceExact: false }, now: NOW }));

    assert.match(dayOnly["💠 Assinante Nitro desde"], /^07 de março de 2026 \(\*\*7 meses 18 dias 5 horas\*\*\)/);
    assert.ok(!dayOnly["💠 Assinante Nitro desde"].includes("às"));
});

test("sem a data de assinatura, o Nitro deduzido continua aparecendo quando há sinal", () => {
    const fields = fieldsOf(buildUserinfoEmbed({ user: { id: "1", username: "ana", createdAt: 0, avatarHash: "a_1" }, now: NOW }));

    assert.equal(fields["💠 Nitro"], "**Provável** (avatar animado)");
    assert.equal(fields["💠 Assinante Nitro desde"], undefined);
});

// ==========================================
// AS TELAS DE DETALHE
// ==========================================

test("as telas Nitro e impulso, Insígnias e Datas trazem as datas informadas, os níveis com nome e a marca de informado", () => {
    const user = {
        id: "1", username: "orlg", displayName: "Orlg", createdAt: 0, joinedAt: 1,
        nitroSince: Date.UTC(2026, 2, 7, 12, 18), nitroSinceExact: true,
        declaredBoostSince: Date.UTC(2024, 5, 2, 0, 28), declaredBoostSinceExact: true
    };

    const nitro = buildUserinfoDetail("nitro", user, NOW);

    const names = nitro.fields.map(field => field.name);

    assert.ok(names.includes("💠 Assinante Nitro desde"));
    assert.ok(names.includes("🏅 Níveis da insígnia de Nitro"));
    assert.ok(names.includes("🚀 Impulsionando desde"));

    const tiers = nitro.fields.find(field => field.name.includes("Níveis da insígnia de Nitro")).value.split("\n").filter(line => /^💠 \*\*/.test(line));

    assert.equal(tiers.length, 8);
    assert.match(tiers[0], /^💠 \*\*Bronze\*\* · 1 mês · <t:\d+:D> ✅$/);
    assert.match(tiers[2], /^💠 \*\*Ouro\*\* · 6 meses · <t:\d+:D> ✅$/);
    assert.match(tiers[3], /^💠 \*\*Platina\*\* · 12 meses · <t:\d+:D> ⏳$/);
    assert.match(tiers[7], /^💠 \*\*Fogo\*\* · 72 meses/);

    const badges = buildUserinfoDetail("badges", user, NOW);

    assert.match(badges.description, /\*\*Assinante Nitro \(Ouro\)\*\*\n-# Informado pela própria pessoa/);
    assert.match(badges.description, /\*\*Impulsiona servidores\*\*\n-# Informado pela própria pessoa/);

    const dates = buildUserinfoDetail("dates", user, NOW);

    assert.deepEqual(dates.fields.map(field => field.name), [
        "📅 Conta criada em", "📥 Entrou no servidor em", "💠 Assinante Nitro desde", "🚀 Impulsionando desde"
    ]);

    // quem não informou nada vê o texto de sempre, com o convite para informar
    const plain = buildUserinfoDetail("nitro", { id: "2", username: "x", createdAt: 0 }, NOW);

    assert.match(plain.fields[0].value, /Quem quiser mostrar a data da assinatura informa em Meu histórico/);
});

// ==========================================
// A TELA, OS BOTÕES E O FORMULÁRIO
// ==========================================

const click = (customId, userId) => ({
    id: "c1", guildId: G, channelId: "900000000000000099",
    user: { id: userId, username: "eu", displayName: "Eu" },
    data: { customId, componentType: 2 }
});

const submit = (customId, value, userId) => ({
    id: "s1", guildId: G, channelId: "900000000000000099",
    user: { id: userId, username: "eu", displayName: "Eu" },
    data: { customId, fields: [{ customId: "data", value }] }
});

test("a tela Meu histórico mostra as datas informadas e os botões Informar Nitro, Informar impulso e Limpar datas", () => {
    const user = person();

    const empty = privacyView(user.id, "status");

    assert.deepEqual(empty.embed.fields ?? [], [], "o ledger vira texto: a data não informada diz isso");
    assert.match(empty.embed.description, /Nitro desde/);
    assert.match(empty.embed.description, /não informado/);

    const buttons = view => view.components[1].components.map(button => [button.label, button.customId, Boolean(button.disabled)]);

    assert.deepEqual(buttons(empty), [
        ["Informar Nitro", `userinfo:decl:${user.id}:nitro`, false],
        ["Informar impulso", `userinfo:decl:${user.id}:boost`, false],
        ["Limpar datas", `userinfo:decl:${user.id}:limpar`, true]
    ]);

    setDeclared(user.id, "nitro", Date.UTC(2026, 2, 7, 15, 0), false);

    const filled = privacyView(user.id, "status");

    assert.match(filled.embed.description, /07 de março de 2026/);
    assert.equal(buttons(filled)[2][2], false, "com data guardada, dá para limpar");
    assert.equal(filled.components[0].components[2].disabled, undefined, "e para apagar tudo");

    // apagar tudo também leva as datas
    const erased = privacyView(user.id, "apagar");

    assert.match(erased.embed.title, /Histórico apagado/);
    assert.equal(getDeclared(user.id).nitroSince, null);

    // o aviso de uma ação entra no texto
    assert.match(privacyView(user.id, "status", { notice: "✅ Guardei." }).embed.description, /✅ Guardei\./);
});

test("os botões abrem o formulário certo, só para o dono, e Limpar datas apaga as duas", async () => {
    const user = person();
    const stranger = person();

    const comandos = new Map();

    const nitro = await handleUserinfoComponent(click(`userinfo:decl:${user.id}:nitro`, user.id), comandos);

    assert.equal(nitro.type, "modal");
    assert.equal(nitro.data.customId, `userinfo:declare:${user.id}:nitro`);
    assert.match(nitro.data.title, /assina o Nitro/);
    assert.equal(nitro.data.fields[0].customId, "data");
    assert.equal(nitro.data.fields[0].required, false);

    const boost = await handleUserinfoComponent(click(`userinfo:decl:${user.id}:boost`, user.id), comandos);

    assert.match(boost.data.title, /impulsiona/);

    // outra pessoa não abre o formulário de quem é dono da tela
    const denied = await handleUserinfoComponent(click(`userinfo:decl:${user.id}:nitro`, stranger.id), comandos);

    assert.equal(denied.data.ephemeral, true);
    assert.notEqual(denied.type, "modal");

    assert.match((await handleUserinfoComponent(click(`userinfo:decl:${user.id}:email`, user.id), comandos)).data.embeds[0].title, /Botão desconhecido/);

    setDeclared(user.id, "nitro", Date.UTC(2026, 2, 7, 15, 0), false);
    setDeclared(user.id, "boost", Date.UTC(2024, 5, 2, 15, 0), false);

    const cleared = await handleUserinfoComponent(click(`userinfo:decl:${user.id}:limpar`, user.id), comandos);

    assert.equal(cleared.type, "update");
    assert.match(cleared.data.embeds[0].description, /Apaguei as datas/);
    assert.deepEqual(getDeclared(user.id), { nitroSince: null, nitroExact: false, boostSince: null, boostExact: false });
});

test("o formulário guarda a data (só o dia ou com a hora), tira com o campo vazio e explica a data inválida", async () => {
    const user = person();
    const stranger = person();

    const comandos = new Map();

    const send = (kind, value, userId = user.id) => handleModalSubmit(submit(`userinfo:declare:${user.id}:${kind}`, value, userId), comandos);

    const saved = await send("nitro", "07/03/2026");

    assert.equal(saved.type, "update");
    assert.match(saved.data.embeds[0].description, /Guardei: Nitro desde 07 de março de 2026\./);
    assert.deepEqual(getDeclared(user.id).nitroSince, Date.UTC(2026, 2, 7, 15, 0));
    assert.equal(getDeclared(user.id).nitroExact, false);

    const exact = await send("boost", "02/06/2024 21:28");

    assert.match(exact.data.embeds[0].description, /impulso desde 02 de junho de 2024, às 21:28/);
    assert.equal(getDeclared(user.id).boostExact, true);

    // data inválida: avisa e não mexe em nada
    const before = JSON.stringify(getDeclared(user.id));

    const invalid = await send("nitro", "31/02/2026");

    assert.equal(invalid.data.ephemeral, true);
    assert.match(invalid.data.embeds[0].title, /Data inválida/);
    assert.equal(JSON.stringify(getDeclared(user.id)), before);

    // outra pessoa não grava na conta de ninguém
    const denied = await send("nitro", "01/01/2026", stranger.id);

    assert.equal(denied.data.ephemeral, true);
    assert.equal(getDeclared(user.id).nitroSince, Date.UTC(2026, 2, 7, 15, 0));

    // formulário de um tipo que não existe
    assert.match((await send("email", "01/01/2026")).data.embeds[0].title, /Formulário desconhecido/);

    // campo vazio tira a data
    const removed = await send("nitro", "   ");

    assert.match(removed.data.embeds[0].description, /Tirei a data do Nitro/);
    assert.equal(getDeclared(user.id).nitroSince, null);
    assert.ok(getDeclared(user.id).boostSince, "a outra fica");
});
