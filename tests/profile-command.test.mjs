import { db, getPlayer, createPrefixRunner, discordMember, discordGuildFetch } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const { clearUserLookupCache } = await import("../services/platform/user-lookup.mjs");

const G = "900000000000000001";
const ME = { id: "111111111111111111", username: "eu", displayName: "Eu Mesmo" };

const MEMBERS = [
    discordMember(ME.id, "eu", "Eu Mesmo"),
    discordMember("200000000000000001", "mariasilva", "Maria Silva"),
    discordMember("200000000000000002", "mariasouza", "Maria Souza"),
    discordMember("200000000000000003", "jose", "José Ávila", "Zezinho"),
    discordMember("200000000000000004", "ana", "Ana"),
    discordMember("200000000000000005", "helena", "Helena", null, true)
];

// O Discord de mentira (membros e pesquisa); o avatar nunca baixa e o cartão sai sem foto.
globalThis.fetch = discordGuildFetch(MEMBERS);

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
    assert.match(r.attachments[0].name, /^helena-perfil-200000000000000001[.]png$/);
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

test("o cartão vai da memória para o Discord: a pasta generated/profiles nem é criada", async () => {
    const card = await run("hperfil ana");

    await run("hperfil");

    assert.equal(existsSync(profilesDir), false, "nada é gravado em disco");

    // o arquivo vai junto da mensagem: um PNG de verdade, em memória
    const [file] = card.attachments;

    assert.equal(file.contentType, "image/png");
    assert.ok(Buffer.isBuffer(file.bytes));
    assert.deepEqual([...file.bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "assinatura de PNG");
});

test("o texto da resposta não carrega os bytes do cartão", async () => {
    const card = await run("hperfil ana");

    assert.match(card.text, /<\d+ bytes>/);
    assert.ok(card.text.length < 2000);
});

// ==========================================
// BIO COM EMOJI NO PERFIL
// ==========================================

test("quem tem bio com emoji, símbolo ou emoji personalizado ainda recebe o cartão", async () => {
    getPlayer(G, ME.id);

    for (const bio of [
        "oi 😀 tudo bem? 👨‍👩‍👧‍👦",
        "💜".repeat(100),
        "꒰ঌ sou calma ໒꒱ ✧･ﾟ: *✧･ﾟ:*",
        "Olá <:festa:3f2a9c1e-5b7d-4c0e-8a11-9d6e2b7a4f10> mundo",
        "𝓑𝓲𝓸 𝓲𝓷𝓽𝓮𝓻𝓮𝓼𝓼𝓪𝓷𝓽𝓮",
        "日本語 한국어"
    ]) {
        db.prepare("UPDATE players SET bio = ? WHERE guild_id = ? AND user_id = ?").run(bio, G, ME.id);

        const r = await run("hperfil");

        assert.equal(r.body, `<@${ME.id}>`, bio.slice(0, 20));
        assert.equal(r.attachments.length, 1, `sem cartão para a bio ${JSON.stringify(bio).slice(0, 30)}`);
        assert.notEqual(r.title, "❌ Ocorreu um erro");
    }
});
