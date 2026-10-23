import { db, getPlayer, set, get, seq, createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const {
    startCall, answerCall, expireCall, getCall, getBirth, clearCalls,
    registerChildren, cleanChildName, familyOf
} = await import("../services/social/family.mjs");
const { FAMILY_RULES } = await import("../config/family.mjs");
const { divorce } = await import("../services/social/marriage.mjs");
const { imprison } = await import("../services/crime/prison.mjs");
const { ensureCrimePlayer } = await import("../services/crime/crime-player.mjs");
const { handlePanelClick, handleModalSubmit } = await import("../services/panels/panels.mjs");
const { callLive, buildFamily, inviteView } = await import("../services/panels/family-panel.mjs");
const { DAILY_CONFIG } = await import("../services/economy/daily.mjs");
const { PRISON_BLOCKED_COMMANDS } = await import("../config/crime.mjs");

const G = "g-family";

const ME = { id: "111111111111111111", username: "eu", displayName: "Eu Mesmo" };
const PARTNER = { id: "222222222222222222", username: "parceira", displayName: "Parceira" };
const STRANGER = { id: "333333333333333333", username: "intruso", displayName: "Intruso" };

const NOW = 1_800_000_000;

const run = await createPrefixRunner({ guildId: G, author: ME });

function marry() {
    set(
        "INSERT INTO marriages (guild_id, user_id, spouse_id, married_at) VALUES (?, ?, ?, ?)",
        G, ME.id, PARTNER.id, NOW - 86_400
    );
    set(
        "INSERT INTO marriages (guild_id, user_id, spouse_id, married_at) VALUES (?, ?, ?, ?)",
        G, PARTNER.id, ME.id, NOW - 86_400
    );
}

function reset({ married = true } = {}) {
    clearCalls();

    for (const table of [
        "players", "marriages", "marriage_requests", "prison_players", "crime_players",
        "transactions", "family_children", "family_births", "family_calls"
    ]) {
        db.exec(`DELETE FROM ${table}`);
    }

    for (const user of [ME, PARTNER, STRANGER]) {
        getPlayer(G, user.id);
        ensureCrimePlayer(G, user.id);
    }

    if (married) {
        marry();
    }
}

const wallet = id => get("SELECT wallet FROM players WHERE guild_id = ? AND user_id = ?", G, id).wallet;
const lastCall = id => get("SELECT last_call FROM family_calls WHERE guild_id = ? AND user_id = ?", G, id)?.last_call;
const children = () => db.prepare("SELECT name FROM family_children WHERE guild_id = ? ORDER BY id").all(G).map(row => row.name);

// Faz a ligação e o cônjuge atende com o sorteio dado.
function ring(random, { now = NOW } = {}) {
    const call = startCall({ guildId: G, callerId: ME.id, now });

    return answerCall({ id: call.id, userId: PARTNER.id, action: "aceitar", now: now + 1, random });
}

// ==========================================
// A LIGAÇÃO
// ==========================================

test("só casal liga: solteiro recebe o motivo e nada é gravado", () => {
    reset({ married: false });

    assert.throws(() => startCall({ guildId: G, callerId: ME.id, now: NOW }), /casais/);

    assert.equal(lastCall(ME.id), undefined);
});

test("a ligação toca por callTtl segundos e já conta a espera de quem ligou", () => {
    reset();

    const call = startCall({ guildId: G, callerId: ME.id, now: NOW });

    assert.equal(call.callerId, ME.id);
    assert.equal(call.partnerId, PARTNER.id);
    assert.equal(call.expiresAt, NOW + FAMILY_RULES.callTtl);
    assert.equal(call.status, "pending");
    assert.equal(lastCall(ME.id), NOW);
});

test("não dá para ligar de novo com uma ligação tocando, nem do outro lado", () => {
    reset();

    startCall({ guildId: G, callerId: ME.id, now: NOW });

    assert.throws(() => startCall({ guildId: G, callerId: ME.id, now: NOW + 2 }), /tocando/);
    assert.throws(() => startCall({ guildId: G, callerId: PARTNER.id, now: NOW + 2 }), /tocando/);
});

test("a espera é pessoal e mostra o tempo que falta", () => {
    reset();

    const call = startCall({ guildId: G, callerId: ME.id, now: NOW });

    answerCall({ id: call.id, userId: ME.id, action: "cancelar", now: NOW + 1 });

    assert.throws(
        () => startCall({ guildId: G, callerId: ME.id, now: NOW + 60 }),
        /Você ligou há pouco/
    );

    // o cônjuge tem a própria espera
    assert.doesNotThrow(() => startCall({ guildId: G, callerId: PARTNER.id, now: NOW + 60 }));

    // passada a espera, volta a poder ligar
    assert.doesNotThrow(() => startCall({ guildId: G, callerId: ME.id, now: NOW + FAMILY_RULES.cooldown }));
});

test("cônjuge preso não atende: a ligação nem começa", () => {
    reset();

    imprison(G, PARTNER.id, 600, "teste", NOW);

    assert.throws(() => startCall({ guildId: G, callerId: ME.id, now: NOW + 1 }), /preso/);

    assert.equal(lastCall(ME.id), undefined);
});

// ==========================================
// O QUE ACONTECE AO ATENDER
// ==========================================

test("atender pode render um filho (a chance e os gêmeos vêm de config/family.mjs)", () => {
    reset();

    const before = wallet(PARTNER.id);

    const { outcome } = ring(seq(FAMILY_RULES.childChance - 0.01, FAMILY_RULES.twinChance + 0.01));

    assert.equal(outcome.kind, "child");
    assert.equal(outcome.babies, 1);
    assert.equal(outcome.expiresAt, NOW + 1 + FAMILY_RULES.nameWindow);

    const birth = getBirth(outcome.birthId, NOW + 2);

    assert.equal(birth.babies, 1);
    assert.deepEqual([birth.parent_a, birth.parent_b], [ME.id, PARTNER.id].sort());

    // o bebê não paga dinheiro
    assert.equal(wallet(PARTNER.id), before);
});

test("gêmeos: o sorteio abaixo de twinChance dá dois bebês", () => {
    reset();

    const { outcome } = ring(seq(0, FAMILY_RULES.twinChance - 0.01));

    assert.equal(outcome.kind, "child");
    assert.equal(outcome.babies, 2);
});

test("sem filho, quem atendeu recebe entre payoutMin e payoutMax (e fica no extrato)", () => {
    reset();

    const before = wallet(PARTNER.id);

    const { outcome } = ring(seq(0.99, 0));

    assert.equal(outcome.kind, "money");
    assert.equal(outcome.amount, FAMILY_RULES.payoutMin);
    assert.equal(wallet(PARTNER.id), before + FAMILY_RULES.payoutMin);

    const tx = get("SELECT * FROM transactions WHERE guild_id = ? AND type = 'gozofone'", G);

    assert.equal(tx.user_id, PARTNER.id);
    assert.equal(tx.target_id, ME.id);
    assert.equal(tx.amount, FAMILY_RULES.payoutMin);

    // o teto do sorteio
    reset();

    assert.equal(ring(seq(0.99, 0.999999)).outcome.amount, FAMILY_RULES.payoutMax);
});

test("carteira cheia: nada é pago, mas a ligação conta", () => {
    reset();

    set("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?", DAILY_CONFIG.maxWallet, G, PARTNER.id);

    const { outcome } = ring(seq(0.99, 0.5));

    assert.deepEqual(outcome, { kind: "money", amount: 0 });
    assert.equal(wallet(PARTNER.id), DAILY_CONFIG.maxWallet);
    assert.equal(get("SELECT COUNT(*) AS n FROM transactions WHERE type = 'gozofone'").n, 0);
});

test("bebê esperando nome e família cheia: sem chance de filho, só dinheiro", () => {
    reset();

    // um bebê esperando nome
    assert.equal(ring(seq(0, 0.9)).outcome.kind, "child");

    // o cônjuge liga de volta dentro do prazo do nome (a espera dele é só dele): mesmo com
    // sorte máxima, o dinheiro vem no lugar do filho
    const callback = startCall({ guildId: G, callerId: PARTNER.id, now: NOW + 30 });

    const { outcome } = answerCall({ id: callback.id, userId: ME.id, action: "aceitar", now: NOW + 31, random: seq(0, 0.5) });

    assert.equal(outcome.kind, "money");

    // família cheia
    reset();

    const [a, b] = [ME.id, PARTNER.id].sort();

    for (let i = 0; i < FAMILY_RULES.maxChildren; i++) {
        set(
            "INSERT INTO family_children (guild_id, parent_a, parent_b, name, born_at) VALUES (?, ?, ?, ?, ?)",
            G, a, b, `Filho${"abcdefghijk"[i]}`, NOW
        );
    }

    assert.equal(ring(seq(0, 0.5)).outcome.kind, "money");
});

// ==========================================
// QUEM PODE O QUÊ
// ==========================================

test("só o cônjuge atende e recusa; só quem ligou cancela", () => {
    reset();

    const call = startCall({ guildId: G, callerId: ME.id, now: NOW });

    for (const action of ["aceitar", "recusar"]) {
        assert.throws(() => answerCall({ id: call.id, userId: ME.id, action, now: NOW + 1 }), /cônjuge/);
        assert.throws(() => answerCall({ id: call.id, userId: STRANGER.id, action, now: NOW + 1 }), /cônjuge/);
    }

    assert.throws(() => answerCall({ id: call.id, userId: PARTNER.id, action: "cancelar", now: NOW + 1 }), /quem ligou/);
    assert.throws(() => answerCall({ id: call.id, userId: STRANGER.id, action: "cancelar", now: NOW + 1 }), /quem ligou/);

    // nada disso gastou a ligação
    assert.equal(getCall(call.id).status, "pending");
});

test("a ligação só se resolve uma vez", () => {
    reset();

    const call = startCall({ guildId: G, callerId: ME.id, now: NOW });

    answerCall({ id: call.id, userId: PARTNER.id, action: "aceitar", now: NOW + 1, random: seq(0.99, 0) });

    assert.throws(
        () => answerCall({ id: call.id, userId: PARTNER.id, action: "aceitar", now: NOW + 2, random: seq(0.99, 0) }),
        /já terminou/
    );

    assert.equal(get("SELECT COUNT(*) AS n FROM transactions WHERE type = 'gozofone'").n, 1);

    assert.throws(() => answerCall({ id: "naoexiste", userId: PARTNER.id, action: "aceitar" }), /não existe/);
});

test("atender depois do tempo vira 'ninguém atendeu' e devolve a espera", () => {
    reset();

    const call = startCall({ guildId: G, callerId: ME.id, now: NOW });

    const { outcome } = answerCall({
        id: call.id, userId: PARTNER.id, action: "aceitar", now: NOW + FAMILY_RULES.callTtl, random: seq(0, 0)
    });

    assert.equal(outcome.kind, "expired");
    assert.equal(lastCall(ME.id), 0);
    assert.equal(wallet(PARTNER.id), 0);
});

test("a espera: volta se recusou ou não atendeu, fica se quem ligou cancelou", () => {
    reset();

    let call = startCall({ guildId: G, callerId: ME.id, now: NOW });

    assert.equal(expireCall(call.id, NOW + 1), null, "ainda toca");
    assert.equal(lastCall(ME.id), NOW);

    assert.equal(answerCall({ id: call.id, userId: PARTNER.id, action: "recusar", now: NOW + 2 }).outcome.kind, "declined");
    assert.equal(lastCall(ME.id), 0, "recusada devolve");

    call = startCall({ guildId: G, callerId: ME.id, now: NOW + 3 });

    assert.equal(expireCall(call.id, NOW + 3 + FAMILY_RULES.callTtl).id, call.id);
    assert.equal(lastCall(ME.id), 0, "sem resposta devolve");
    assert.equal(expireCall(call.id, NOW + 100), null, "só expira uma vez");

    call = startCall({ guildId: G, callerId: ME.id, now: NOW + 20 });

    assert.equal(answerCall({ id: call.id, userId: ME.id, action: "cancelar", now: NOW + 21 }).outcome.kind, "cancelled");
    assert.equal(lastCall(ME.id), NOW + 20, "cancelada mantém");
});

test("casamento desfeito durante a ligação: ninguém recebe nada e a espera volta", () => {
    reset();

    const call = startCall({ guildId: G, callerId: ME.id, now: NOW });

    divorce(G, ME.id);

    assert.throws(
        () => answerCall({ id: call.id, userId: PARTNER.id, action: "aceitar", now: NOW + 1, random: seq(0.99, 0) }),
        /casamento acabou/
    );

    assert.equal(wallet(PARTNER.id), 0);
    assert.equal(lastCall(ME.id), 0);
});

test("cônjuge preso no meio da ligação não atende", () => {
    reset();

    const call = startCall({ guildId: G, callerId: ME.id, now: NOW });

    imprison(G, PARTNER.id, 600, "teste", NOW + 1);

    assert.throws(
        () => answerCall({ id: call.id, userId: PARTNER.id, action: "aceitar", now: NOW + 2, random: seq(0.99, 0) }),
        /preso/
    );
});

// ==========================================
// REGISTRAR O FILHO
// ==========================================

function birthOf(babies = 1) {
    return Number(set(
        "INSERT INTO family_births (guild_id, parent_a, parent_b, babies, expires_at) VALUES (?, ?, ?, ?, ?)",
        G, ...[ME.id, PARTNER.id].sort(), babies, NOW + FAMILY_RULES.nameWindow
    ).lastInsertRowid);
}

test("os pais registram o nome (qualquer um dos dois) e o bebê entra na família", () => {
    reset();

    const names = registerChildren({ guildId: G, userId: PARTNER.id, birthId: birthOf(), names: ["  Maria   Clara "], now: NOW + 5 });

    assert.deepEqual(names, ["Maria Clara"]);
    assert.deepEqual(children(), ["Maria Clara"]);
    assert.equal(get("SELECT COUNT(*) AS n FROM family_births").n, 0, "o pedido de nome some");
});

test("gêmeos precisam de dois nomes, diferentes entre si e dos irmãos", () => {
    reset();

    const id = birthOf(2);

    assert.throws(() => registerChildren({ guildId: G, userId: ME.id, birthId: id, names: ["Ana"], now: NOW + 5 }), /um nome cada/);
    assert.throws(() => registerChildren({ guildId: G, userId: ME.id, birthId: id, names: ["Ana", "ANA"], now: NOW + 5 }), /Já existe/);

    assert.deepEqual(registerChildren({ guildId: G, userId: ME.id, birthId: id, names: ["Ana", "Beto"], now: NOW + 5 }), ["Ana", "Beto"]);

    // um irmão com o mesmo nome (sem acento e em outra caixa) é recusado
    const next = birthOf();

    assert.throws(() => registerChildren({ guildId: G, userId: ME.id, birthId: next, names: ["ânA"], now: NOW + 5 }), /Já existe/);
    assert.deepEqual(children(), ["Ana", "Beto"], "nada foi gravado pela metade");
});

test("só os pais registram, o prazo vale e o nome precisa ser de letras", () => {
    reset();

    const id = birthOf();

    assert.throws(() => registerChildren({ guildId: G, userId: STRANGER.id, birthId: id, names: ["Ana"], now: NOW + 5 }), /Só os pais/);
    assert.throws(() => registerChildren({ guildId: G, userId: ME.id, birthId: id, names: ["A"], now: NOW + 5 }), /de 2 a 32/);
    assert.throws(() => registerChildren({ guildId: G, userId: ME.id, birthId: id, names: ["Ana123"], now: NOW + 5 }), /só letras/);
    assert.throws(() => registerChildren({ guildId: G, userId: ME.id, birthId: id, names: ["<@1234>"], now: NOW + 5 }), /só letras/);
    assert.throws(() => registerChildren({ guildId: G, userId: ME.id, birthId: id, names: ["x".repeat(33)], now: NOW + 5 }), /de 2 a 32/);

    // prazo vencido: o bebê não é registrado
    assert.throws(
        () => registerChildren({ guildId: G, userId: ME.id, birthId: id, names: ["Ana"], now: NOW + FAMILY_RULES.nameWindow }),
        /prazo/
    );

    assert.equal(children().length, 0);
    assert.equal(getBirth(id, NOW + FAMILY_RULES.nameWindow + 1), null);

    assert.throws(() => registerChildren({ guildId: G, userId: ME.id, birthId: id, names: ["Ana"], now: NOW + 5 }), /não está esperando/);
});

test("cleanChildName aceita acentos e nome composto", () => {
    assert.equal(cleanChildName("José  Álvaro"), "José Álvaro");
    assert.equal(cleanChildName("Zoë"), "Zoë");
    assert.throws(() => cleanChildName(""), /de 2 a 32/);
    assert.throws(() => cleanChildName("Ana-Maria"), /só letras/);
});

// ==========================================
// FAMÍLIA E DIVÓRCIO
// ==========================================

test("familyOf lista o casal, os filhos em ordem e o bebê esperando nome", () => {
    reset();

    assert.equal(familyOf(G, STRANGER.id, NOW), null);

    registerChildren({ guildId: G, userId: ME.id, birthId: birthOf(), names: ["Ana"], now: NOW + 1 });
    registerChildren({ guildId: G, userId: ME.id, birthId: birthOf(), names: ["Beto"], now: NOW + 2 });

    const pending = birthOf();

    const family = familyOf(G, PARTNER.id, NOW + 3);

    assert.deepEqual([family.a, family.b], [ME.id, PARTNER.id].sort());
    assert.deepEqual(family.children.map(child => child.name), ["Ana", "Beto"]);
    assert.equal(family.birth.id, pending);

    // os dois lados veem a mesma família
    assert.deepEqual(familyOf(G, ME.id, NOW + 3).children, family.children);
});

test("o divórcio leva os filhos e o bebê esperando; a espera do Gozofone fica", () => {
    reset();

    registerChildren({ guildId: G, userId: ME.id, birthId: birthOf(), names: ["Ana"], now: NOW + 1 });
    birthOf();

    startCall({ guildId: G, callerId: ME.id, now: NOW });

    const result = divorce(G, PARTNER.id);

    assert.equal(result.children, 1);
    assert.equal(result.spouseId, ME.id);
    assert.equal(children().length, 0);
    assert.equal(get("SELECT COUNT(*) AS n FROM family_births").n, 0);
    assert.equal(lastCall(ME.id), NOW, "a espera é da pessoa");
});

test("casal de outro servidor não se mistura", () => {
    reset();

    set("INSERT INTO marriages (guild_id, user_id, spouse_id, married_at) VALUES (?, ?, ?, ?)", "outro", ME.id, PARTNER.id, NOW);
    set("INSERT INTO marriages (guild_id, user_id, spouse_id, married_at) VALUES (?, ?, ?, ?)", "outro", PARTNER.id, ME.id, NOW);

    const [a, b] = [ME.id, PARTNER.id].sort();

    set("INSERT INTO family_children (guild_id, parent_a, parent_b, name, born_at) VALUES (?, ?, ?, ?, ?)", "outro", a, b, "Outra", NOW);

    registerChildren({ guildId: G, userId: ME.id, birthId: birthOf(), names: ["Ana"], now: NOW + 1 });

    assert.deepEqual(familyOf(G, ME.id, NOW).children.map(child => child.name), ["Ana"]);

    divorce(G, ME.id);

    assert.equal(get("SELECT COUNT(*) AS n FROM family_children WHERE guild_id = 'outro'").n, 1);
});

// ==========================================
// TELAS E BOTÕES
// ==========================================

test("os botões da ligação: o cônjuge atende pelo clique e a mensagem vira o resultado", () => {
    reset();

    const call = startCall({ guildId: G, callerId: ME.id });

    const intruder = handlePanelClick({
        guildId: G, user: STRANGER, data: { customId: `gf:aceitar:${call.id}` }
    });

    assert.equal(intruder.data.ephemeral, true, "o aviso é só de quem clicou");
    assert.match(JSON.stringify(intruder), /cônjuge/);

    const caller = handlePanelClick({
        guildId: G, user: ME, data: { customId: `gf:aceitar:${call.id}` }
    });

    assert.match(JSON.stringify(caller), /cônjuge/, "quem ligou não atende");

    const answered = handlePanelClick({
        guildId: G, user: PARTNER, data: { customId: `gf:recusar:${call.id}` }
    });

    assert.equal(answered.type, "update");
    assert.match(answered.data.embeds[0].title, /recusada/);
    assert.deepEqual(answered.data.components, [], "sem botões depois de resolvida");
});

test("o filho nascido tem o botão de registro, que abre o formulário só para os pais", () => {
    reset();

    const call = startCall({ guildId: G, callerId: ME.id });

    const answered = handlePanelClick({
        guildId: G, user: PARTNER, data: { customId: `gf:aceitar:${call.id}` }
    });

    // sorteio real: pode ser filho ou dinheiro, então força um bebê esperando nome
    const birthId = birthOf();

    const open = handlePanelClick({ guildId: G, user: ME, data: { customId: `gf:nome:${birthId}` } });

    assert.equal(open.type, "modal");
    assert.equal(open.data.customId, `gf:nome:${birthId}`);
    assert.equal(open.data.fields.length, 1);
    assert.ok(answered.type === "update");

    const twins = handlePanelClick({ guildId: G, user: PARTNER, data: { customId: `gf:nome:${birthOf(2)}` } });

    assert.equal(twins.data.fields.length, 2);

    const intruder = handlePanelClick({ guildId: G, user: STRANGER, data: { customId: `gf:nome:${birthId}` } });

    assert.equal(intruder.type, "message");
    assert.match(JSON.stringify(intruder), /Só os pais/);

    const gone = handlePanelClick({ guildId: G, user: ME, data: { customId: "gf:nome:99999" } });

    assert.match(JSON.stringify(gone), /não está mais esperando/);
});

test("o formulário registra o filho e responde para todo mundo ver", async () => {
    reset();

    const id = birthOf(2);

    const answer = await handleModalSubmit({
        guildId: G,
        user: ME,
        data: {
            customId: `gf:nome:${id}`,
            fields: [{ customId: "nome1", value: "Lia" }, { customId: "nome2", value: "Noa" }]
        }
    });

    assert.equal(answer.type, "message");
    assert.notEqual(answer.data.ephemeral, true);
    assert.match(answer.data.embeds[0].title, /Gêmeos/);
    assert.match(answer.data.embeds[0].description, /Lia.*Noa/);
    assert.deepEqual(children(), ["Lia", "Noa"]);

    // nome inválido volta como aviso privado e não grava nada
    const bad = await handleModalSubmit({
        guildId: G,
        user: ME,
        data: { customId: `gf:nome:${birthOf()}`, fields: [{ customId: "nome1", value: "12" }] }
    });

    assert.equal(bad.data.ephemeral, true);
    assert.equal(children().length, 2);
});

test("o relógio da ligação: toca, cai e some quando já foi respondida", () => {
    reset();

    // ligação antiga (já passou do tempo): a edição troca por "ninguém atendeu"
    const old = startCall({ guildId: G, callerId: ME.id, now: Math.floor(Date.now() / 1000) - 100 });

    const live = callLive(old.id);

    assert.ok(live.intervalMs <= 2_000 && live.maxMs > FAMILY_RULES.callTtl * 1000);

    const fallen = live.render({ stale: false });

    assert.equal(fallen.done, true);
    assert.match(fallen.payload.embeds[0].title, /Ninguém atendeu/);
    assert.deepEqual(fallen.payload.components, []);

    assert.equal(live.render({ stale: false }), null, "já resolvida: nada a editar");

    // ligação tocando: mantém a mensagem com os botões
    reset();

    const fresh = startCall({ guildId: G, callerId: ME.id });

    const ringing = callLive(fresh.id).render({ stale: false });

    assert.equal(ringing.done, false);
    assert.equal(ringing.payload.components[0].components.length, 3);

    // respondida pelo botão: o relógio sai de cena
    answerCall({ id: fresh.id, userId: ME.id, action: "cancelar" });

    assert.equal(callLive(fresh.id).render({ stale: false }), null);
});

test("a ligação traz os três botões gf:, com os IDs únicos", () => {
    reset();

    const call = startCall({ guildId: G, callerId: ME.id, now: NOW });

    const view = inviteView(call);

    const ids = view.components[0].components.map(component => component.customId);

    assert.deepEqual(ids, [`gf:aceitar:${call.id}`, `gf:recusar:${call.id}`, `gf:cancelar:${call.id}`]);
    assert.match(view.embed.description, new RegExp(`<@${ME.id}>.*<@${PARTNER.id}>`));
});

test("a tela da família: solteiro vê o convite ao casamento; casado, filhos e bebê", () => {
    reset({ married: false });

    const single = buildFamily({ guildId: G, userId: ME.id, now: NOW });

    assert.match(single.embed.description, /\/casar/);
    assert.deepEqual(single.components, []);

    reset();

    const empty = buildFamily({ guildId: G, userId: ME.id, now: NOW });

    assert.match(JSON.stringify(empty.embed.fields), /Ainda não têm filhos/);
    assert.equal(empty.components.length, 0);

    registerChildren({ guildId: G, userId: ME.id, birthId: birthOf(), names: ["Ana"], now: NOW + 1 });

    const id = birthOf();

    const full = buildFamily({ guildId: G, userId: PARTNER.id, now: NOW + 2 });

    const text = JSON.stringify(full.embed.fields);

    assert.match(text, new RegExp(`<@${ME.id}>.*<@${PARTNER.id}>`));
    assert.match(text, /Ana/);
    assert.match(text, /Esperando nome/);
    assert.equal(full.components[0].components[0].customId, `gf:nome:${id}`);
});

// ==========================================
// OS COMANDOS
// ==========================================

test("/gozofone: menciona o cônjuge, traz os botões e pede a edição ao vivo", async () => {
    reset();

    const r = await run("hgozofone");

    assert.equal(r.title, "📞 Gozofone tocando");
    assert.equal(r.body, `<@${PARTNER.id}>`);
    assert.equal(r.components[0].components.length, 3);
    assert.match(r.components[0].components[0].customId, /^gf:aceitar:/);
});

test("o apelido gf chama o mesmo comando", async () => {
    reset();

    const r = await run("hgf");

    assert.equal(r.title, "📞 Gozofone tocando");
});

test("/gozofone sem casamento e na espera explica o motivo", async () => {
    reset({ married: false });

    assert.match((await run("hgozofone")).text, /casais/);

    reset();

    await run("hgozofone");

    const again = await run("hgozofone", ME);

    assert.match(again.text, /tocando|ligou há pouco/);
});

test("preso não liga (o Gozofone entra na lista de bloqueios da prisão)", async () => {
    assert.ok(PRISON_BLOCKED_COMMANDS.has("gozofone"));

    reset();

    imprison(G, ME.id, 600, "teste");

    const r = await run("hgozofone");

    assert.doesNotMatch(r.title ?? "", /Gozofone$/);
    assert.equal(get("SELECT COUNT(*) AS n FROM family_calls").n, 0);
});

test("/familia mostra a família e o /divorciar avisa dos filhos", async () => {
    reset();

    registerChildren({ guildId: G, userId: ME.id, birthId: birthOf(), names: ["Ana"], now: Math.floor(Date.now() / 1000) });

    const family = await run("hfamilia");

    assert.equal(family.title, "👨‍👩‍👧 Família");
    assert.match(family.text, /Ana/);

    const split = await run("hdivorciar");

    assert.equal(split.title, "💔 Divórcio registrado");
    assert.match(split.text, /filho do casal saiu/);

    assert.match((await run("hfamilia")).text, /\/casar/);
});
