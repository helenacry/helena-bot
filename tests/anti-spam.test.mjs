import { createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const anti = await import("../services/platform/anti-spam.mjs");

const { createAntiSpam, buildCommandGate, antiSpamEnabled, antiSpamText, commandGate } =
    await import("../services/platform/anti-spam.mjs");

const { ANTI_SPAM } = await import("../config/anti-spam.mjs");

// Relógio que o teste controla, em milissegundos.
function clock(start = 1_000_000) {
    let t = start;

    return {
        now: () => t,
        advance: ms => { t += ms; }
    };
}

test("o intervalo padrão entre comandos é de 3 segundos", () => {
    assert.equal(ANTI_SPAM.commandCooldownSeconds, 3);
});

test("o primeiro comando passa, o seguinte espera o intervalo inteiro", () => {
    const time = clock();
    const gate = createAntiSpam({ cooldownMs: 3000, now: time.now });

    assert.deepEqual(gate.check("A"), { allowed: true });

    time.advance(1000);

    const blocked = gate.check("A");

    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remainingMs, 2000);

    time.advance(1999);

    assert.equal(gate.check("A").allowed, false, "faltando 1 ms ainda barra");

    time.advance(1);

    assert.deepEqual(gate.check("A"), { allowed: true }, "no instante certo passa");
});

test("tentar de novo não empurra a espera: quem insiste não fica barrado para sempre", () => {
    const time = clock();
    const gate = createAntiSpam({ cooldownMs: 3000, now: time.now });

    gate.check("A");

    // insiste a cada 500 ms durante a janela
    for (let i = 0; i < 5; i++) {
        time.advance(500);
        assert.equal(gate.check("A").allowed, false);
    }

    time.advance(500); // 3000 ms depois do comando aceito

    assert.equal(gate.check("A").allowed, true);
});

test("só a primeira tentativa barrada de cada janela pede aviso", () => {
    const time = clock();
    const gate = createAntiSpam({ cooldownMs: 3000, now: time.now });

    gate.check("A");

    time.advance(100);
    assert.equal(gate.check("A").firstWarning, true);

    time.advance(100);
    assert.equal(gate.check("A").firstWarning, false);

    time.advance(100);
    assert.equal(gate.check("A").firstWarning, false);

    // libera, usa de novo e é barrado na janela seguinte: o aviso volta
    time.advance(3000);
    assert.equal(gate.check("A").allowed, true);

    time.advance(100);
    assert.equal(gate.check("A").firstWarning, true);
});

test("cada pessoa tem o seu próprio intervalo", () => {
    const time = clock();
    const gate = createAntiSpam({ cooldownMs: 3000, now: time.now });

    assert.equal(gate.check("A").allowed, true);
    assert.equal(gate.check("B").allowed, true);
    assert.equal(gate.check("A").allowed, false);
    assert.equal(gate.check("B").allowed, false);
    assert.equal(gate.check("C").allowed, true);
});

test("dono isento, intervalo zero desliga e sem identificação não barra", () => {
    const time = clock();

    const owner = createAntiSpam({ cooldownMs: 3000, now: time.now, exempt: id => id === "DONO" });

    for (let i = 0; i < 5; i++) assert.equal(owner.check("DONO").allowed, true);

    assert.equal(owner.check("outro").allowed, true);
    assert.equal(owner.check("outro").allowed, false);

    const off = createAntiSpam({ cooldownMs: 0, now: time.now });

    for (let i = 0; i < 5; i++) assert.equal(off.check("A").allowed, true);

    const gate = createAntiSpam({ cooldownMs: 3000, now: time.now });

    for (const who of ["", null, undefined]) {
        assert.equal(gate.check(who).allowed, true);
        assert.equal(gate.check(who).allowed, true);
    }

    assert.equal(gate.size(), 0);
});

test("quem já foi liberado é esquecido: a memória não cresce para sempre", () => {
    const time = clock();
    const gate = createAntiSpam({ cooldownMs: 3000, now: time.now });

    for (let i = 0; i < 1000; i++) gate.check("velho" + i);

    assert.equal(gate.size(), 1000);

    time.advance(10_000);

    // gente nova chegando dispara a limpeza dos vencidos
    for (let i = 0; i < 600; i++) gate.check("novo" + i);

    assert.ok(gate.size() <= 700, `ficaram ${gate.size()} pessoas guardadas`);

    // quem passou da janela e voltou continua sendo atendido normalmente
    assert.equal(gate.check("velho1").allowed, true);
});

test("HELENA_ANTI_SPAM=off desliga o intervalo; sem a variável, fica ligado", () => {
    for (const value of ["off", "OFF", "0", "false", "no", " off "]) {
        assert.equal(antiSpamEnabled({ HELENA_ANTI_SPAM: value }), false, value);
    }

    for (const value of [undefined, "", "on", "1", "true", "qualquer"]) {
        assert.equal(antiSpamEnabled({ HELENA_ANTI_SPAM: value }), true, String(value));
    }

    // os testes rodam com ele desligado (tests/helpers.mjs)
    assert.equal(commandGate.check("qualquer").allowed, true);
    assert.equal(commandGate.check("qualquer").allowed, true);
});

test("o intervalo de verdade (o que o bot usa) vale para o dono também, e só poupa o dono se a config mandar", () => {
    const owner = id => id === "DONO";

    // ambiente sem HELENA_ANTI_SPAM = como o bot em produção
    const real = buildCommandGate({ env: {}, owner });

    assert.equal(ANTI_SPAM.exemptOwners, false, "por padrão o dono espera como todo mundo");

    assert.equal(real.check("DONO").allowed, true);
    assert.equal(real.check("DONO").allowed, false, "o dono é barrado no segundo comando seguido");
    assert.equal(real.check("outro").allowed, true);
    assert.equal(real.check("outro").allowed, false);

    // com exemptOwners ligado, só o dono passa direto
    const lenient = buildCommandGate({ env: {}, owner, exemptOwners: true });

    for (let i = 0; i < 4; i++) assert.equal(lenient.check("DONO").allowed, true);

    assert.equal(lenient.check("outro").allowed, true);
    assert.equal(lenient.check("outro").allowed, false);

    // HELENA_ANTI_SPAM=off desliga para todos, dono inclusive
    const off = buildCommandGate({ env: { HELENA_ANTI_SPAM: "off" }, owner });

    for (let i = 0; i < 4; i++) {
        assert.equal(off.check("DONO").allowed, true);
        assert.equal(off.check("outro").allowed, true);
    }
});

test("o aviso diz quanto falta, em segundos inteiros, nunca zero", () => {
    assert.match(antiSpamText(2400), /Espere mais 3s/);
    assert.match(antiSpamText(3000), /Espere mais 3s/);
    assert.match(antiSpamText(1), /Espere mais 1s/);
    assert.match(antiSpamText(0), /Espere mais 1s/);
    assert.match(antiSpamText(1000), /Espere mais 1s/);
});

// ==========================================
// PELO PREFIXO H (o mesmo caminho do bot)
// ==========================================

const G = "333333333333333333";

const ANA = { id: "100000000000000001", username: "ana", displayName: "Ana" };
const BIA = { id: "100000000000000002", username: "bia", displayName: "Bia" };

test("pelo prefixo: o segundo comando seguido é barrado e as outras tentativas são ignoradas", async () => {
    const time = clock();
    const gate = createAntiSpam({ cooldownMs: 3000, now: time.now });
    const run = await createPrefixRunner({ guildId: G, author: ANA, gate });

    const first = await run("hsaldo");

    assert.equal(first.sent.length, 1);
    assert.doesNotMatch(first.text, /Devagar/);

    time.advance(500);

    const second = await run("hsaldo");

    assert.equal(second.sent.length, 1);
    assert.match(second.body, /Devagar! Espere mais 3s/);

    // as outras tentativas da janela não geram mensagem
    time.advance(500);

    assert.equal((await run("hsaldo")).sent.length, 0);
    assert.equal((await run("hperfil")).sent.length, 0);

    // vale o intervalo para qualquer comando, não só o repetido
    time.advance(2000);

    const later = await run("hsaldo");

    assert.equal(later.sent.length, 1);
    assert.doesNotMatch(later.text, /Devagar/);
});

test("pelo prefixo: conversa que começa com h e comando desconhecido não gastam o intervalo", async () => {
    const time = clock();
    const gate = createAntiSpam({ cooldownMs: 3000, now: time.now });
    const run = await createPrefixRunner({ guildId: G, author: ANA, gate });

    assert.equal((await run("hoje foi um dia legal")).sent.length, 0);
    assert.equal((await run("hxyzabc")).sent.length, 0);
    assert.equal((await run("h")).sent.length, 0);

    const real = await run("hsaldo");

    assert.equal(real.sent.length, 1);
    assert.doesNotMatch(real.text, /Devagar/);
});

test("pelo prefixo: o intervalo é por pessoa, e barrar uma não atrapalha a outra", async () => {
    const time = clock();
    const gate = createAntiSpam({ cooldownMs: 3000, now: time.now });

    const ana = await createPrefixRunner({ guildId: G, author: ANA, gate });
    const bia = await createPrefixRunner({ guildId: G, author: BIA, gate });

    assert.doesNotMatch((await ana("hsaldo")).text, /Devagar/);
    assert.match((await ana("hsaldo")).body, /Devagar/);

    assert.doesNotMatch((await bia("hsaldo")).text, /Devagar/);
});

test("pelo prefixo: uma pessoa isenta pela regra não espera", async () => {
    const time = clock();
    const gate = createAntiSpam({ cooldownMs: 3000, now: time.now, exempt: id => id === ANA.id });
    const run = await createPrefixRunner({ guildId: G, author: ANA, gate });

    for (let i = 0; i < 4; i++) {
        const r = await run("hsaldo");

        assert.equal(r.sent.length, 1);
        assert.doesNotMatch(r.text, /Devagar/);
    }
});

test("um comando barrado não é executado: numa rajada de depósitos só o primeiro vale", async () => {
    const { getPlayer, set, get } = await import("./helpers.mjs");

    const time = clock();
    const gate = createAntiSpam({ cooldownMs: 3000, now: time.now });

    const gated = await createPrefixRunner({ guildId: G, author: BIA, gate });
    const free = await createPrefixRunner({ guildId: G, author: BIA });

    getPlayer(G, BIA.id);

    const bank = () => get("SELECT bank FROM players WHERE guild_id=? AND user_id=?", G, BIA.id).bank;
    const reset = () => set("UPDATE players SET wallet=?, bank=0 WHERE guild_id=? AND user_id=?", 10_000_000, G, BIA.id);

    // quanto um depósito de "hdep 10" move, sem intervalo nenhum
    reset();
    await free("hdep 10");

    const one = bank();

    assert.ok(one > 0, "o depósito de referência aconteceu");

    // a mesma rajada de três, com o intervalo ligado
    reset();
    await gated("hdep 10");
    await gated("hdep 10");
    await gated("hdep 10");

    assert.equal(bank(), one, "só o primeiro depósito foi feito");

    // passada a janela, o próximo comando vale de novo
    time.advance(3000);
    await gated("hdep 10");

    assert.equal(bank(), one * 2);
});

// ==========================================
// A BARRA (helena.mjs não roda em teste: confere a ordem no código)
// ==========================================

test("a barra usa o mesmo intervalo, depois de achar o comando e antes da prisão e do /perfil", () => {
    const source = readFileSync(new URL("../helena.mjs", import.meta.url), "utf8");

    const find = text => {
        const at = source.indexOf(text);

        assert.ok(at >= 0, `não achei «${text}» em helena.mjs`);

        return at;
    };

    const resolved = find("resolverComando(comandos, commandName)");
    const gate = find("commandGate.check(actorId)");
    const prison = find("prisonBlock(\n        comando.name");
    const profile = find("comando.name === \"perfil\"");

    assert.ok(resolved < gate, "comando desconhecido não gasta o intervalo");
    assert.ok(gate < prison, "o intervalo vem antes da prisão");
    assert.ok(gate < profile, "o intervalo vem antes do /perfil, que gera imagem");

    // a resposta é só para quem usou e diz quanto falta
    const block = source.slice(gate, prison);

    assert.match(block, /mensagemErro\(\s*antiSpamText\(espera\.remainingMs\)\s*\)/);
    assert.match(block, /responderInteracao/);
});

// ==========================================
// BOTÕES, MENUS E FORMULÁRIOS
// ==========================================

test("botões, menus e formulários têm o próprio intervalo: curto e separado do dos comandos", () => {
    const { buildInteractionGate, interactionGate } = anti;

    assert.equal(ANTI_SPAM.interactionCooldownSeconds, 1);
    assert.ok(ANTI_SPAM.interactionCooldownSeconds < ANTI_SPAM.commandCooldownSeconds, "navegar não pode ser mais lento que comandar");

    const gate = buildInteractionGate({ env: {}, owner: () => false });

    assert.equal(gate.check("ana").allowed, true);

    const blocked = gate.check("ana");

    assert.equal(blocked.allowed, false);
    assert.ok(blocked.remainingMs > 0 && blocked.remainingMs <= 1000);

    assert.equal(gate.check("bia").allowed, true, "cada pessoa tem o seu");

    // o relógio é outro: gastar o intervalo dos comandos não barra o clique logo depois
    assert.notEqual(interactionGate, commandGate);

    const who = "pessoa-do-relogio-separado";

    assert.equal(commandGate.check(who).allowed, true);
    assert.equal(interactionGate.check(who).allowed, true);

    // HELENA_ANTI_SPAM=off desliga os dois
    const off = buildInteractionGate({ env: { HELENA_ANTI_SPAM: "off" }, owner: () => false });

    for (let i = 0; i < 4; i++) assert.equal(off.check("ana").allowed, true);
});

test("a interação confere o intervalo antes de executar: botão é ignorado em silêncio, formulário recebe aviso", () => {
    const source = readFileSync(new URL("../helena.mjs", import.meta.url), "utf8");

    const find = (text, from = 0) => {
        const at = source.indexOf(text, from);

        assert.ok(at >= 0, `não achei «${text}» em helena.mjs`);

        return at;
    };

    // botões e menus
    const component = find("interaction.type === \"component\"");
    const componentGate = find("interactionGate.check(actorId)", component);
    const runComponent = find("executarComponente(", componentGate);

    assert.ok(componentGate < runComponent, "o intervalo vem antes de rodar o componente");

    const silent = source.slice(componentGate, runComponent);

    assert.ok(silent.includes("defer_update"), "ignora em silêncio, sem mexer na mensagem");
    assert.ok(source.slice(component, componentGate).includes("(fuga|gf):"), "a fuga e o Gozofone, que são cronometrados, ficam de fora");

    // formulários
    const modal = find("interaction.type === \"modal_submit\"");
    const modalGate = find("interactionGate.check(actorId)", modal);
    const runModal = find("executarModal(", modalGate);

    assert.ok(modalGate < runModal, "o intervalo vem antes de rodar o formulário");
    assert.match(source.slice(modalGate, runModal), /mensagemErro\(\s*antiSpamText\(espera\.remainingMs\)\s*\)/);
});
