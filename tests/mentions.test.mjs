import { db, getPlayer, set, createPrefixRunner, fieldsOf } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { mention, mentionAll } = await import("../services/mentions.mjs");

const G = "g-mentions";

const ME = { id: "111111111111111111", username: "eu", displayName: "Eu Mesmo" };
const PARTNER = { id: "222222222222222222", username: "parceira", displayName: "Parceira" };
const STRANGER = "333333333333333333";

const run = await createPrefixRunner({ guildId: G, author: ME });

function reset() {
    for (const table of [
        "players", "marriages", "marriage_requests", "player_names",
        "prison_players", "crime_players", "transactions"
    ]) {
        db.exec(`DELETE FROM ${table}`);
    }

    getPlayer(G, ME.id);
    getPlayer(G, PARTNER.id);
}

const embed = r => r.sent[0].embeds[0];

// o ID cru, que aparecia nos campos, em crases ou solto
const rawId = id => new RegExp("(?<![<@\\d])" + id + "(?!>)");

// ==========================================
// AJUDANTE
// ==========================================

test("mention monta <@id> e não deixa passar caractere estranho", () => {
    assert.equal(mention("123"), "<@123>");
    assert.equal(mention(123), "<@123>");
    assert.equal(mention("12 3>*_`"), "<@123>");
    assert.equal(mention(""), "alguém");
    assert.equal(mention(null), "alguém");
});

test("mentionAll junta, sem repetir nem deixar vazio", () => {
    assert.equal(mentionAll(["1", "2", "1", "", null]), "<@1> <@2>");
    assert.equal(mentionAll([]), "");
});

// ==========================================
// CASAMENTO
// ==========================================

test("o pedido de casamento cita as duas pessoas por menção, não pelo ID", async () => {
    reset();

    const r = await run(`hcasar <@${PARTNER.id}>`);

    assert.equal(r.title, "💍 Pedido de casamento");

    const f = fieldsOf(embed(r));

    assert.equal(f["❤️ Quem pediu"], `<@${ME.id}>`);
    assert.equal(f["💌 Destinatário"], `<@${PARTNER.id}>`);

    for (const value of Object.values(f)) {
        assert.doesNotMatch(value, rawId(ME.id), "ID cru de quem pediu");
        assert.doesNotMatch(value, rawId(PARTNER.id), "ID cru do destinatário");
        assert.doesNotMatch(value, /`\d{6,}`/, "ID entre crases");
    }

    // quem foi pedido continua sendo avisado (só o texto da mensagem notifica)
    assert.equal(r.body, `<@${PARTNER.id}>`);
});

test("o casamento aceito mostra o casal por menção e avisa os dois", async () => {
    reset();

    await run(`hcasar <@${PARTNER.id}>`);

    const r = await run("haceitarcasamento", PARTNER);

    assert.equal(r.title, "💍 Casamento realizado!");

    const f = fieldsOf(embed(r));

    assert.equal(f["💑 Casal"], `<@${ME.id}>\n❤️\n<@${PARTNER.id}>`);
    assert.doesNotMatch(f["💑 Casal"], rawId(ME.id));

    assert.equal(r.body, `<@${ME.id}> <@${PARTNER.id}>`);
});

// ==========================================
// TRANSFERÊNCIA
// ==========================================

test("a transferência cita o destinatário por menção", async () => {
    reset();
    set("UPDATE players SET wallet=? WHERE guild_id=? AND user_id=?", 100_000, G, ME.id);

    const r = await run(`htransferir <@${PARTNER.id}> 100`);

    assert.equal(r.title, "💸 Helena Pay");

    const f = fieldsOf(embed(r));

    assert.equal(f["👤 Destinatário"], `<@${PARTNER.id}>`);
});

// ==========================================
// RANKING E CONQUISTAS
// ==========================================

test("no ranking, quem ainda não tem nome salvo aparece por menção, não como 'Jogador #123456'", async () => {
    reset();

    getPlayer(G, STRANGER);
    set("UPDATE players SET wallet=? WHERE guild_id=? AND user_id=?", 999_999_900, G, STRANGER);

    const r = await run("hranking");
    const text = embed(r).description;

    assert.match(text, new RegExp(`<@${STRANGER}>`));
    assert.doesNotMatch(text, /Jogador #/);

    // quem tem nome salvo continua com o nome
    assert.match(text, /\*\*Eu Mesmo\*\*/);
});

test("nas conquistas de outra pessoa sem nome salvo, ela aparece por menção", async () => {
    reset();

    getPlayer(G, STRANGER);

    const r = await run(`hconquistas <@${STRANGER}>`);

    assert.match(embed(r).description, new RegExp(`\\*\\*Jogador:\\*\\* <@${STRANGER}>`));
    assert.doesNotMatch(embed(r).description, /Jogador #/);
});
