import { db, set } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const lookup = await import("../services/user-lookup.mjs");
const { savePlayerName } = await import("../services/player-names.mjs");

const G = "900000000000000001";

const member = (id, username, displayName, nickname = null, bot = false) => ({
    id, username, displayName, nickname, bot,
    avatarUrl: "https://cdn.exemplo.test/" + id + ".png"
});

const MEMBERS = [
    member("100000000000000001", "eu", "Eu Mesmo"),
    member("200000000000000001", "mariasilva", "Maria Silva"),
    member("200000000000000002", "mariasouza", "Maria Souza"),
    member("200000000000000003", "jose", "José Ávila", "Zezinho"),
    member("200000000000000004", "ana", "Ana"),
    member("200000000000000005", "helena", "Helena", null, true)
];

let apiDown = false;
let listCalls = 0;

globalThis.fetch = async url => {
    const u = String(url);

    const reply = (status, body) => ({
        ok: status < 300, status, json: async () => body, text: async () => ""
    });

    if (apiDown) return reply(500, {});

    let m;

    if ((m = u.match(/\/guilds\/[^/]+\/members\/([^/]+)$/))) {
        const found = MEMBERS.find(x => x.id === decodeURIComponent(m[1]));

        return found ? reply(200, { member: found }) : reply(404, {});
    }

    if (/\/guilds\/[^/]+$/.test(u)) {
        listCalls++;

        return reply(200, { members: MEMBERS });
    }

    return reply(404, {});
};

const users = MEMBERS.map(x => ({
    id: x.id, username: x.username, displayName: x.displayName,
    nickname: x.nickname ?? "", avatarUrl: x.avatarUrl, bot: x.bot
}));

const names = list => list.map(u => u.displayName).join("|");

test.beforeEach(() => {
    apiDown = false;
    listCalls = 0;
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

test("a lista de membros é baixada uma vez e fica em cache", async () => {
    await lookup.resolveUser(G, "ana");
    await lookup.resolveUser(G, "maria");
    await lookup.resolveUser(G, "ninguem");

    assert.equal(listCalls, 1);
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

    apiDown = true;

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

    apiDown = true;

    assert.equal((await lookup.resolveUser(G, "carlos", { by: "username" })).status, "not_found");
    assert.equal((await lookup.resolveUser(G, "<@300000000000000001>", { by: "username" })).status, "found");
});

test("lookupProblem by username orienta a usar o @usuário exato", () => {
    const problem = lookup.lookupProblem({ status: "not_found" }, "maria", { by: "username" });

    assert.match(problem.message, /@usuário \*\*maria\*\*/);
    assert.match(problem.message, /@usuário exato/);
    assert.match(problem.message, /não o apelido/);
});
