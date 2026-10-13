import { getPlayer, set, get, createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// Os comandos do duelo (/atacar, /aceitarduelo, /recusarduelo): quem é avisado
// e o que o texto promete. As regras do duelo em si estão em combat.test.mjs.
//
// Na VSync, a menção só notifica quando está no texto da mensagem (body); dentro
// do embed ela vira um chip sem aviso (services/mentions.mjs).

const { carregarComandos, resolverComando } = await import("../command-registry.mjs");
const { DUEL_RULES, challenge, pendingChallenge, now, tx, ensure } = await import("../services/combat.mjs");
const { addItem } = await import("../services/inventory.mjs");
const { equipWeapon } = await import("../services/equipment.mjs");

const A = "111111111111111111";
const B = "222222222222222222";

const silently = async fn => {
    const log = console.log;
    const error = console.error;
    console.log = () => {};
    console.error = () => {};

    try { return await fn(); } finally { console.log = log; console.error = error; }
};

const comandos = await silently(() => carregarComandos());

let counter = 0;

const guild = () => `g-duelcmd-${++counter}`;

function player(g, user, weapon = null) {
    getPlayer(g, user);
    ensure(g, user);

    if (weapon) {
        tx(() => addItem(g, user, weapon, 1));
        equipWeapon(g, user, weapon);
    }
}

let sequence = 0;

const slash = (g, userId, options = {}) => ({
    id: "i" + (++sequence), guildId: g, channelId: "c1",
    user: { id: userId, username: "u" + userId.slice(0, 3), displayName: "Jogador" },
    data: { options }
});

const exec = (name, interaction) =>
    silently(() => resolverComando(comandos, name).execute(interaction));

const descriptionOf = response => response.data.embeds[0].description;

const minutes = DUEL_RULES.requestTtl / 60;

// ==========================================
// /ATACAR
// ==========================================

test("/atacar avisa o desafiado pelo texto da mensagem e diz o prazo certo", async () => {
    const g = guild();

    player(g, A);
    player(g, B);

    const response = await exec("atacar", slash(g, A, { usuario: B }));

    assert.equal(response.data.body, `<@${B}>`, "a menção no body é o que notifica");

    const text = descriptionOf(response);

    assert.match(text, new RegExp(`<@${B}> tem ${minutes} minutos`), "o prazo é o do código");
    assert.doesNotMatch(text, /\b2 minutos/, "o texto antigo prometia 2 minutos");
    assert.match(text, /\/aceitarduelo/);
    assert.match(text, /\/recusarduelo/);
});

test("o prazo do texto acompanha DUEL_RULES, e o desafio vale mesmo esse tempo", async () => {
    assert.equal(minutes, 10);

    const g = guild();

    player(g, A);
    player(g, B);

    challenge(g, A, B);

    set("UPDATE combat_challenges SET created_at = ? WHERE guild_id = ?", now() - DUEL_RULES.requestTtl + 5, g);
    assert.ok(pendingChallenge(g, B), "com 5 segundos de sobra ainda vale");

    set("UPDATE combat_challenges SET created_at = ? WHERE guild_id = ?", now() - DUEL_RULES.requestTtl - 1, g);
    assert.equal(pendingChallenge(g, B), null, "passou do prazo");
});

test("hatacar, pelo prefixo, também avisa o desafiado", async () => {
    const g = guild();

    player(g, A);
    player(g, B);

    const run = await createPrefixRunner({ guildId: g, author: { id: A, username: "a", displayName: "A" } });

    const result = await run(`hatacar <@${B}>`);

    assert.equal(result.body, `<@${B}>`);
    assert.match(result.text, new RegExp(`${minutes} minutos`));
});

// ==========================================
// /ACEITARDUELO
// ==========================================

test("/aceitarduelo avisa quem desafiou e mostra o XP que o código dá", async () => {
    const g = guild();

    player(g, A, "pocket_knife");   // dano 8 contra 5: A vence
    player(g, B);

    challenge(g, A, B);

    const response = await exec("aceitarduelo", slash(g, B));

    assert.equal(response.data.body, `<@${A}> <@${B}>`, "os dois são avisados, sem repetir ninguém");

    const text = descriptionOf(response);

    assert.match(text, new RegExp(`Vencedor: <@${A}> \\(\\+${DUEL_RULES.winXp} XP\\)`));
    assert.doesNotMatch(text, /\+35 XP/, "o texto antigo prometia 35");

    const xp = get("SELECT xp x FROM players WHERE guild_id = ? AND user_id = ?", g, A).x;

    assert.equal(xp, DUEL_RULES.winXp, "e é isso mesmo que o vencedor recebe");
});

test("empate: sem vencedor, sem XP no texto, e os dois continuam avisados", async () => {
    const g = guild();

    player(g, A);
    player(g, B);

    challenge(g, A, B);

    const response = await exec("aceitarduelo", slash(g, B));

    assert.equal(response.data.body, `<@${A}> <@${B}>`);
    assert.match(descriptionOf(response), /Empate/);
    assert.doesNotMatch(descriptionOf(response), /XP/);
});

test("aceitar sem desafio pendente é um erro, sem avisar ninguém", async () => {
    const g = guild();

    player(g, B);

    const response = await exec("aceitarduelo", slash(g, B));

    assert.notEqual(response.data.body, `<@${A}> <@${B}>`);
    assert.match(JSON.stringify(response), /não tem desafio pendente/);
});

// ==========================================
// /RECUSARDUELO
// ==========================================

test("/recusarduelo avisa quem desafiou e diz de quem era o desafio", async () => {
    const g = guild();

    player(g, A);
    player(g, B);

    challenge(g, A, B);

    const response = await exec("recusarduelo", slash(g, B));

    assert.equal(response.data.body, `<@${A}>`, "quem foi recusado é avisado");
    assert.match(descriptionOf(response), new RegExp(`Você recusou o desafio de <@${A}>`));

    assert.equal(pendingChallenge(g, B), null, "o desafio saiu");
});

test("recusar sem desafio, ou com o desafio vencido, não avisa ninguém", async () => {
    const g = guild();

    player(g, A);
    player(g, B);

    const none = await exec("recusarduelo", slash(g, B));

    assert.equal(none.data.body, "");
    assert.match(descriptionOf(none), /não possui nenhum desafio pendente/);

    challenge(g, A, B);

    set("UPDATE combat_challenges SET created_at = ? WHERE guild_id = ?", now() - DUEL_RULES.requestTtl - 1, g);

    const expired = await exec("recusarduelo", slash(g, B));

    assert.equal(expired.data.body, "", "um desafio que já venceu não vale um aviso");
    assert.match(descriptionOf(expired), /Desafio recusado com sucesso/);
});

// ==========================================
// DESAFIO PENDENTE (serviço)
// ==========================================

test("pendingChallenge só consulta: não apaga o desafio", () => {
    const g = guild();

    player(g, A);
    player(g, B);

    assert.equal(pendingChallenge(g, B), null, "ainda não há desafio");

    challenge(g, A, B);

    const first = pendingChallenge(g, B);

    assert.equal(first.senderId, A);

    assert.deepEqual(pendingChallenge(g, B), first, "consultar de novo dá o mesmo");
    assert.equal(pendingChallenge(g, A), null, "quem desafiou não tem desafio para responder");
    assert.equal(get("SELECT COUNT(*) c FROM combat_challenges WHERE guild_id = ?", g).c, 1);
});
