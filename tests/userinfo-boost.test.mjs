import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// A leitura automática do impulso: a Helena olha o membro em cada servidor onde ela está e fica com o
// impulso mais antigo (o perfil que junta todos os servidores é fechado a bots).

const { findBoost, withBoost, clearBoostCache } = await import("../services/social/userinfo-boost.mjs");
const { guildIds } = await import("../services/platform/guild-registry.mjs");
const { buildUserinfoEmbed, buildUserinfoDetail } = await import("../services/social/userinfo-view.mjs");
const { getUserBadges } = await import("../services/social/userinfo-badges.mjs");

const USER = "710000000000000001";

const reply = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body)
});

// o Discord de mentira: cada servidor responde o que está em "guilds" (um premium_since, null, 404, 403 ou 500)
const calls = [];

const guilds = {};

globalThis.fetch = async url => {
    const path = new URL(String(url)).pathname.replace(/^\/api\/v\d+/, "");

    const match = path.match(/^\/guilds\/([^/]+)\/members\/([^/]+)$/);

    if (!match) return reply(404, { message: "Unknown Route" });

    calls.push(decodeURIComponent(match[1]));

    const answer = guilds[decodeURIComponent(match[1])];

    if (answer === "404") return reply(404, { message: "Unknown Member", code: 10007 });
    if (answer === "403") return reply(403, { message: "Missing Access", code: 50001 });
    if (answer === "500") return reply(500, { message: "Internal Server Error" });

    return reply(200, { user: { id: USER, username: "ana" }, premium_since: answer ?? null });
};

test.beforeEach(() => {
    clearBoostCache();

    guildIds.clear();
    calls.length = 0;

    for (const id of Object.keys(guilds)) delete guilds[id];
});

test.after(() => guildIds.clear());

const time = iso => Date.parse(iso);

test("o impulso é o mais antigo entre os servidores onde a Helena está, e quantos foram conferidos", async () => {
    for (const id of ["g1", "g2", "g3", "g4"]) guildIds.add(id);

    guilds.g1 = null;
    guilds.g2 = "2025-06-01T15:30:00.000000+00:00";
    guilds.g3 = "2024-06-02T00:28:00.000000+00:00";
    guilds.g4 = "2026-01-10T10:00:00.000000+00:00";

    const result = await findBoost(USER);

    assert.deepEqual(result, { since: time("2024-06-02T00:28:00Z"), checked: 4 });
    assert.deepEqual([...calls].sort(), ["g1", "g2", "g3", "g4"]);
});

test("servidor sem a pessoa (404), sem acesso (403) ou fora do ar (500) não atrapalha os outros; sem nenhum, since é null", async () => {
    for (const id of ["a", "b", "c", "d"]) guildIds.add(id);

    guilds.a = "404";
    guilds.b = "403";
    guilds.c = "500";
    guilds.d = "2025-06-01T15:30:00.000000+00:00";

    assert.equal((await findBoost(USER)).since, time("2025-06-01T15:30:00Z"));

    clearBoostCache();

    guilds.d = null;

    assert.deepEqual(await findBoost(USER), { since: null, checked: 4 });

    clearBoostCache();
    guildIds.clear();

    assert.deepEqual(await findBoost(USER), { since: null, checked: 0 });
});

test("o resultado de uma pessoa é reutilizado por alguns minutos (o /userinfo é consultado várias vezes seguidas)", async () => {
    guildIds.add("g1");
    guilds.g1 = "2025-06-01T15:30:00.000000+00:00";

    await findBoost(USER);
    await findBoost(USER);
    await withBoost({ id: USER, username: "ana" });

    assert.equal(calls.length, 1, "uma chamada só");

    // outra pessoa conta à parte
    await findBoost("710000000000000002");

    assert.equal(calls.length, 2);
});

test("com muitos servidores, só os 25 primeiros são conferidos (nada de centenas de chamadas por /userinfo)", async () => {
    for (let index = 0; index < 60; index += 1) guildIds.add("s" + index);

    const result = await findBoost(USER);

    assert.equal(result.checked, 25);
    assert.equal(calls.length, 25);
});

test("withBoost põe boostSince e boostChecked no usuário, deixa bots em paz e nunca lança", async () => {
    guildIds.add("g1");
    guilds.g1 = "2024-06-02T00:28:00.000000+00:00";

    const filled = await withBoost({ id: USER, username: "ana", displayName: "Ana" });

    assert.equal(filled.boostSince, time("2024-06-02T00:28:00Z"));
    assert.equal(filled.boostChecked, 1);
    assert.equal(filled.username, "ana");

    // quem não impulsiona: sem boostSince
    clearBoostCache();
    guilds.g1 = null;

    const none = await withBoost({ id: USER, username: "ana" });

    assert.equal(none.boostSince, undefined);
    assert.equal(none.boostChecked, 1);

    // bots e contas sem ID passam direto, sem chamada
    calls.length = 0;

    const bot = { id: USER, username: "b", bot: true };

    assert.equal(await withBoost(bot), bot);
    assert.equal(await withBoost(null), null);
    assert.deepEqual(await withBoost({}), {});
    assert.equal(calls.length, 0);
});

test("o cartão de quem impulsiona só outro servidor onde a Helena está: Impulsionando desde, a insígnia e o emblema comum", () => {
    const now = Date.UTC(2026, 9, 25, 20, 26);

    const user = { id: USER, username: "ana", createdAt: 0, boostSince: Date.UTC(2024, 5, 2, 0, 28) };

    const card = buildUserinfoEmbed({ user, now });

    const fields = Object.fromEntries(card.fields.map(field => [field.name, field.value]));

    assert.equal(fields["🚀 Impulsionando desde"], "01 de junho de 2024, às 21:28 (**2 anos 4 meses 23 dias**)");
    assert.equal(fields["🏅 Insígnia de impulso atual"], "💠 | **2 anos 4 meses 23 dias**");
    assert.equal(fields["▶️ Próxima insígnia de impulso"], "💠 | **Nível máximo alcançado.**");
    assert.equal(fields["🏅 Insígnias"], "💠");

    // a tela de insígnias nomeia o emblema pelo que é
    const badges = getUserBadges(user);

    assert.deepEqual(badges.map(badge => [badge.id, badge.emoji, badge.name]), [["BOOSTER", "💠", "Impulsiona servidores"]]);

    // e no próprio servidor continua "este servidor"
    assert.equal(getUserBadges({ boostingSince: Date.now() })[0].name, "Impulsiona este servidor");

    // a tela de Nitro e impulso lista os 9 degraus e diz de onde vem
    const detail = buildUserinfoDetail("nitro", user, now);

    assert.ok(detail.fields.some(field => field.name.includes("Níveis da insígnia de impulso")));
    assert.match(detail.fields.find(field => field.name.includes("Níveis")).value, /só enxerga os servidores onde ela está/);
});
