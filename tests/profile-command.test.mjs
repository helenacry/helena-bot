import { db, getPlayer, createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const { clearUserLookupCache } = await import("../services/user-lookup.mjs");

const G = "900000000000000001";
const ME = { id: "111111111111111111", username: "eu", displayName: "Eu Mesmo" };

const member = (id, username, displayName, nickname = null, bot = false) => ({
    id, username, displayName, nickname, bot,
    avatarUrl: "https://cdn.exemplo.test/" + id + ".png"
});

const MEMBERS = [
    member(ME.id, "eu", "Eu Mesmo"),
    member("200000000000000001", "mariasilva", "Maria Silva"),
    member("200000000000000002", "mariasouza", "Maria Souza"),
    member("200000000000000003", "jose", "José Ávila", "Zezinho"),
    member("200000000000000004", "ana", "Ana"),
    member("200000000000000005", "helena", "Helena", null, true)
];

const calls = [];

// API simulada: membros, upload de anexos e avatar indisponível.
globalThis.fetch = async (url, init = {}) => {
    const u = String(url);

    calls.push((init.method ?? "GET") + " " + u.replace("https://api.vsync.lat", ""));

    const reply = (status, body) => ({
        ok: status < 300, status, json: async () => body,
        text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0),
        headers: { get: () => null }
    });

    if (u.startsWith("https://cdn.exemplo.test/")) return reply(404, {});
    if (u.startsWith("https://upload.exemplo.test/")) return reply(200, {});

    let m;

    if ((m = u.match(/\/guilds\/[^/]+\/members\/([^/]+)$/))) {
        const found = MEMBERS.find(x => x.id === decodeURIComponent(m[1]));

        return found ? reply(200, { member: found }) : reply(404, {});
    }

    if (/\/guilds\/[^/]+$/.test(u)) return reply(200, { members: MEMBERS });

    if (u.endsWith("/attachments/limits")) return reply(200, { maxBytes: 50_000_000, available: 5 });

    if (u.endsWith("/attachments/init")) {
        return reply(200, { id: "a" + calls.length, uploadUrl: "https://upload.exemplo.test/x", uploadHeaders: {} });
    }

    if (/\/attachments\/[^/]+\/complete$/.test(u)) return reply(200, {});

    return reply(404, {});
};

const run = await createPrefixRunner({ guildId: G, author: ME });

const profilesDir = new URL("../generated/profiles", import.meta.url);

const players = id =>
    db.prepare("SELECT COUNT(*) c FROM players WHERE guild_id=? AND user_id=?").get(G, id).c;

test.beforeEach(() => clearUserLookupCache());

test("@usuário inexistente: avisa que não encontrou, sem enviar cartão", async () => {
    const r = await run("hperfil ninguemassim");

    assert.match(r.title, /Usuário não encontrado/);
    assert.match(r.text, /ninguemassim/);
    assert.match(r.text, /@usuário exato/);
    assert.equal(r.attachments.length, 0);
});

test("texto digitado volta sem formatação nem menções", async () => {
    const r = await run("hperfil <*@@teste>");

    assert.match(r.text, /\*\*teste\*\*/);
    assert.doesNotMatch(r.text, /<\*|@@/);
});

test("apelido e nome de exibição não entram na busca", async () => {
    // "Maria Silva" é o nome de exibição e "Zezinho" o apelido no servidor
    for (const query of ["Maria Silva", "maria silva", "zezinho", "José Ávila", "Eu Mesmo"]) {
        const r = await run("hperfil " + query);

        assert.match(r.title, /Usuário não encontrado/, query);
        assert.equal(r.attachments.length, 0, query);
    }
});

test("o @usuário tem de ser exato: pedaço do usuário não acha", async () => {
    // existem mariasilva e mariasouza, mas "maria" não é o @usuário de ninguém
    assert.match((await run("hperfil maria")).title, /Usuário não encontrado/);
    assert.match((await run("hperfil mariasil")).title, /Usuário não encontrado/);
});

test("bot não tem perfil", async () => {
    assert.match((await run("hperfil helena")).title, /Sem perfil/);
});

test("perfil de outra pessoa pelo @usuário: menciona a pessoa e não cria registro", async () => {
    const before = players("200000000000000001");

    const r = await run("hperfil mariasilva");

    assert.equal(r.body, "Perfil de <@200000000000000001>", "a mensagem menciona o dono do perfil");
    assert.equal(r.attachments.length, 1);
    assert.match(r.attachments[0], /^att:/);
    assert.equal(players("200000000000000001"), before);
    assert.equal(before, 0, "olhar o perfil não cria registro de jogador");
});

test("@usuário com @, em maiúsculas, menção e o alias hprofile", async () => {
    const ana = "Perfil de <@200000000000000004>";

    assert.equal((await run("hprofile @ana")).body, ana);
    assert.equal((await run("hperfil ANA")).body, ana);
    assert.equal((await run("hperfil <@200000000000000004>")).body, ana);
    assert.equal((await run("hperfil 200000000000000004")).body, ana, "o ID da menção também vale");

    // o username de quem tem apelido no servidor
    assert.equal((await run("hperfil jose")).body, "Perfil de <@200000000000000003>");
});

test("sem argumento (ou o próprio @usuário) mostra o seu perfil", async () => {
    getPlayer(G, ME.id);

    assert.equal((await run("hperfil")).body, `<@${ME.id}>`);
    assert.equal((await run("hperfil eu")).body, `<@${ME.id}>`);
    assert.equal((await run("hperfil @eu")).body, `<@${ME.id}>`);
});

test("o cartão vai da memória para a API: a pasta generated/profiles nem é criada", async () => {
    calls.length = 0;

    await run("hperfil ana");
    await run("hperfil");

    assert.equal(existsSync(profilesDir), false, "nada é gravado em disco");
    assert.ok(calls.some(c => c.startsWith("POST /attachments/init")));
    assert.ok(calls.some(c => /^POST \/attachments\/.*\/complete/.test(c)));
});
