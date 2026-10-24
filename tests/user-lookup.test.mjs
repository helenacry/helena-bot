import { db, set, discordMember, discordGuildFetch } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const lookup = await import("../services/platform/user-lookup.mjs");
const { savePlayerName } = await import("../services/platform/player-names.mjs");

const G = "900000000000000001";

const MEMBERS = [
    discordMember("100000000000000001", "eu", "Eu Mesmo"),
    discordMember("200000000000000001", "mariasilva", "Maria Silva"),
    discordMember("200000000000000002", "mariasouza", "Maria Souza"),
    discordMember("200000000000000003", "jose", "José Ávila", "Zezinho"),
    discordMember("200000000000000004", "ana", "Ana"),
    discordMember("200000000000000005", "helena", "Helena", null, true)
];

// O Discord de mentira: conta as pesquisas e pode ficar fora do ar.
const api = {};

globalThis.fetch = discordGuildFetch(MEMBERS, api);

// os mesmos membros no formato da Helena, para o ranking de nomes
const users = MEMBERS.map(x => ({
    id: x.user.id, username: x.user.username, displayName: x.user.global_name,
    nickname: x.nick ?? "", avatarUrl: null, bot: x.user.bot
}));

const names = list => list.map(u => u.displayName).join("|");

test.beforeEach(() => {
    api.down = false;
    api.searches = 0;
    api.lookups = 0;
    lookup.clearUserLookupCache();
});

test("normaliza caixa, acentos, @ e espaços", () => {
    assert.equal(lookup.normalizeName("  @JOSÉ   Ávila "), "jose avila");
});

test("nome igual vence nome que apenas contém", () => {
    assert.equal(names(lookup.searchUsers(users, "ana")), "Ana");
});

test("acha por nome completo, sem acento, apelido e @usuário", () => {
    assert.equal(names(lookup.searchUsers(users, "MARIA SILVA")), "Maria Silva");
    assert.equal(names(lookup.searchUsers(users, "jose")), "José Ávila");
    assert.equal(names(lookup.searchUsers(users, "zezinho")), "José Ávila");
    assert.equal(names(lookup.searchUsers(users, "@mariasouza")), "Maria Souza");
});

test("devolve todos do melhor grau quando há mais de um", () => {
    assert.equal(names(lookup.searchUsers(users, "maria")), "Maria Silva|Maria Souza");
});

test("sem correspondência, e 1 letra só casa pelo começo", () => {
    assert.equal(lookup.searchUsers(users, "xyzzy").length, 0);
    assert.equal(names(lookup.searchUsers(users, "a")), "Ana");
});

test("resolveUser: found, ambiguous e not_found", async () => {
    const found = await lookup.resolveUser(G, "ana");
    assert.equal(found.status, "found");
    assert.equal(found.user.id, "200000000000000004");

    const ambiguous = await lookup.resolveUser(G, "maria");
    assert.equal(ambiguous.status, "ambiguous");
    assert.equal(ambiguous.candidates.length, 2);

    assert.equal((await lookup.resolveUser(G, "ninguem")).status, "not_found");
});

test("a pesquisa do Discord é feita uma vez por texto e fica em cache", async () => {
    await lookup.resolveUser(G, "ana");
    await lookup.resolveUser(G, "ANA");
    await lookup.resolveUser(G, "ana");

    assert.equal(api.searches, 1, "o mesmo texto, em qualquer caixa, não pesquisa de novo");

    await lookup.resolveUser(G, "maria");
    await lookup.resolveUser(G, "ninguem");

    assert.equal(api.searches, 3, "outro texto pesquisa");
});

test("a pesquisa pede ao Discord só o texto digitado, sem o @ do começo", async () => {
    const seen = [];
    const inner = globalThis.fetch;

    globalThis.fetch = async (url, init) => {
        seen.push(String(url));

        return inner(url, init);
    };

    try {
        await lookup.resolveUser(G, "@ana");
    } finally {
        globalThis.fetch = inner;
    }

    assert.equal(seen.length, 1);
    assert.ok(
        seen[0].endsWith("/guilds/900000000000000001/members/search?query=ana&limit=25"),
        seen[0]
    );
});

test("menção, ID e menção de quem não está no servidor", async () => {
    const mention = await lookup.resolveUser(G, "<@200000000000000003>");
    assert.equal(mention.status, "found");
    assert.equal(mention.user.nickname, "Zezinho");

    assert.equal((await lookup.resolveUser(G, "200000000000000004")).user.displayName, "Ana");
    assert.equal((await lookup.resolveUser(G, "<@299999999999999999>")).status, "not_found");
    assert.equal((await lookup.resolveUser(G, "<@&200000000000000003>")).status, "not_found", "cargo não é pessoa");
});

test("com a API fora do ar, usa os nomes que a Helena já conhece", async () => {
    savePlayerName({ id: "300000000000000001", displayName: "Carlos Conhecido" });
    set("INSERT OR IGNORE INTO players (guild_id, user_id) VALUES (?, ?)", G, "300000000000000001");

    api.down = true;

    const byName = await lookup.resolveUser(G, "carlos");
    assert.equal(byName.status, "found");
    assert.equal(byName.user.id, "300000000000000001");

    assert.equal((await lookup.resolveUser(G, "<@300000000000000001>")).status, "found");
    assert.equal((await lookup.resolveUser(G, "ana")).status, "not_found", "quem nunca foi visto não é achado");
});

test("lookupProblem devolve aviso só quando não achou", async () => {
    const notFound = lookup.lookupProblem({ status: "not_found" }, "xx");
    assert.match(notFound.title, /não encontrado/);

    const ambiguous = lookup.lookupProblem(await lookup.resolveUser(G, "maria"), "maria");
    assert.match(ambiguous.message, /Maria Silva/);
    assert.match(ambiguous.message, /Maria Souza/);

    assert.equal(lookup.lookupProblem({ status: "found", user: {} }, "x"), null);
});

test("safeText tira formatação, menções e quebras de linha", () => {
    assert.equal(lookup.safeText("**oi** <@123>\n@aqui"), "oi 123aqui");
    assert.equal(lookup.safeText("x".repeat(100)).length, 40);
});

// ==========================================
// BUSCA SÓ PELO @USUÁRIO
// ==========================================

test("searchByUsername: exato, sem diferenciar maiúsculas nem o @", () => {
    assert.equal(names(lookup.searchByUsername(users, "ana")), "Ana");
    assert.equal(names(lookup.searchByUsername(users, "@ANA")), "Ana");
    assert.equal(names(lookup.searchByUsername(users, " mariasilva ")), "Maria Silva");
    assert.deepEqual(lookup.searchByUsername(users, ""), []);
});

test("searchByUsername: ignora apelido, nome de exibição e pedaços", () => {
    assert.deepEqual(lookup.searchByUsername(users, "Maria Silva"), [], "nome de exibição");
    assert.deepEqual(lookup.searchByUsername(users, "Zezinho"), [], "apelido");
    assert.deepEqual(lookup.searchByUsername(users, "maria"), [], "pedaço do usuário");
});

test("resolveUser by username: só o @usuário ou a menção", async () => {
    const byUser = await lookup.resolveUser(G, "@jose", { by: "username" });
    assert.equal(byUser.status, "found");
    assert.equal(byUser.user.id, "200000000000000003");

    assert.equal((await lookup.resolveUser(G, "Zezinho", { by: "username" })).status, "not_found");
    assert.equal((await lookup.resolveUser(G, "José Ávila", { by: "username" })).status, "not_found");
    assert.equal((await lookup.resolveUser(G, "maria", { by: "username" })).status, "not_found");

    // menção e ID continuam valendo
    assert.equal((await lookup.resolveUser(G, "<@200000000000000003>", { by: "username" })).status, "found");
    assert.equal((await lookup.resolveUser(G, "200000000000000004", { by: "username" })).status, "found");

    // o modo padrão segue aceitando nomes
    assert.equal((await lookup.resolveUser(G, "Zezinho")).status, "found");
});

test("resolveUser by username com a API fora do ar: nome não acha, menção sim", async () => {
    savePlayerName({ id: "300000000000000001", displayName: "Carlos Conhecido" });
    set("INSERT OR IGNORE INTO players (guild_id, user_id) VALUES (?, ?)", G, "300000000000000001");

    api.down = true;

    assert.equal((await lookup.resolveUser(G, "carlos", { by: "username" })).status, "not_found");
    assert.equal((await lookup.resolveUser(G, "<@300000000000000001>", { by: "username" })).status, "found");
});

test("lookupProblem by username orienta a usar o @usuário exato", () => {
    const problem = lookup.lookupProblem({ status: "not_found" }, "maria", { by: "username" });

    assert.match(problem.message, /@usuário \*\*maria\*\*/);
    assert.match(problem.message, /@usuário exato/);
    assert.match(problem.message, /não o apelido/);
});
