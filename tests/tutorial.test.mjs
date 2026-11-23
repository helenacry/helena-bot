import { db, getPlayer } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// O tutorial (config/tutorial.mjs, services/progress/tutorial.mjs, tutorial-view.mjs, services/panels/tutorial-panel.mjs)
// e o comando /tutorial.

const { TUTORIAL_CLAIM_KEY, TUTORIAL_REWARD, TUTORIAL_STEPS } = await import("../config/tutorial.mjs");
const { claimTutorial, tutorialStatus } = await import("../services/progress/tutorial.mjs");
const { buildTutorial } = await import("../services/progress/tutorial-view.mjs");
const { handlePanelClick } = await import("../services/panels/panels.mjs");
const { addStat, getStat } = await import("../services/progress/stats.mjs");
const { layoutProblems, countComponents, V2_LIMITS } = await import("../utils/components-v2.mjs");
const { localizeData } = await import("../services/platform/i18n.mjs");
const { carregarComandos, resolverComando } = await import("../command-registry.mjs");

const ME = "111111111111111111";
const OTHER = "222222222222222222";

let counter = 0;

const guild = () => `g-tut-${++counter}`;

const setup = () => {
    const g = guild();

    getPlayer(g, ME);

    return g;
};

const wallet = (g, user = ME) => db.prepare("SELECT wallet FROM players WHERE guild_id = ? AND user_id = ?").get(g, user).wallet;

const ledger = (g, type) => db.prepare("SELECT amount FROM transactions WHERE guild_id = ? AND user_id = ? AND type = ?").all(g, ME, type).map(row => row.amount);

const texto = value => JSON.stringify(value);

// Cumpre um passo do jeito que o jogo o cumpre: um contador, uma linha no extrato ou o emprego.
function complete(g, id, user = ME) {
    const step = TUTORIAL_STEPS.find(entry => entry.id === id);

    const condition = step.check.any[0];

    if (condition.kind === "job") {
        db.prepare("UPDATE players SET job_id = 'entregador' WHERE guild_id = ? AND user_id = ?").run(g, user);

    } else if (condition.kind === "stat") {
        addStat(g, user, condition.key);

    } else {
        db.prepare("INSERT INTO transactions (guild_id, user_id, target_id, type, amount) VALUES (?, ?, NULL, ?, 100)").run(g, user, condition.type);
    }
}

const completeAll = (g, user = ME) => TUTORIAL_STEPS.forEach(step => complete(g, step.id, user));

const click = (g, customId, user = ME) => handlePanelClick({ guildId: g, user: { id: user }, data: { customId } });

// ==========================================
// A LISTA
// ==========================================

test("os passos: IDs únicos, um jeito de conferir cada um, o que fazer, e um prêmio que cabe na carteira", () => {
    assert.ok(TUTORIAL_STEPS.length >= 5 && TUTORIAL_STEPS.length <= 9, "uma lista curta");

    assert.equal(new Set(TUTORIAL_STEPS.map(step => step.id)).size, TUTORIAL_STEPS.length);

    for (const step of TUTORIAL_STEPS) {
        assert.ok(step.emoji && step.title && step.hint, step.id);
        assert.ok(step.check.any.length >= 1, step.id);

        for (const condition of step.check.any) {
            assert.ok(["job", "stat", "transaction"].includes(condition.kind), `${step.id}: ${condition.kind}`);

            if (condition.kind === "stat") assert.match(condition.key, /^[a-z0-9_:.-]{1,64}$/);
            if (condition.kind === "transaction") assert.ok(condition.type);
        }

        // o texto do passo cita o comando (a pessoa sabe onde ir)
        assert.match(`${step.title} ${step.hint}`, /\/[a-z]+/, step.id);
    }

    assert.ok(TUTORIAL_REWARD.money > 0 && TUTORIAL_REWARD.xp > 0);
    assert.equal(TUTORIAL_CLAIM_KEY, "tutorial_claimed");
});

// ==========================================
// O ESTADO
// ==========================================

test("conta nova: nenhum passo feito, e cada passo se marca sozinho pelo que a pessoa fez", () => {
    const g = setup();

    let status = tutorialStatus(g, ME);

    assert.equal(status.completed, 0);
    assert.equal(status.total, TUTORIAL_STEPS.length);
    assert.equal(status.finished, false);
    assert.equal(status.claimed, false);

    for (const step of TUTORIAL_STEPS) {
        complete(g, step.id);

        status = tutorialStatus(g, ME);

        assert.equal(status.steps.find(entry => entry.id === step.id).done, true, step.id);
    }

    assert.equal(status.finished, true);
    assert.equal(status.completed, status.total);
});

test("quem já jogou antes dos contadores existirem tem os passos pelo extrato (trabalho, daily, depósito, loja, missão)", () => {
    const g = setup();

    for (const type of ["work", "daily", "deposit", "shop_buy", "mission"]) {
        db.prepare("INSERT INTO transactions (guild_id, user_id, target_id, type, amount) VALUES (?, ?, NULL, ?, 100)").run(g, ME, type);
    }

    db.prepare("UPDATE players SET job_id = 'garcom' WHERE guild_id = ? AND user_id = ?").run(g, ME);

    const status = tutorialStatus(g, ME);

    assert.deepEqual(status.steps.filter(step => !step.done).map(step => step.id), ["fish"], "só a pesca é nova: não há como ter feito antes");
});

test("o estado é por servidor e por pessoa", () => {
    const g = setup();
    const other = setup();

    completeAll(g);

    assert.equal(tutorialStatus(g, ME).finished, true);
    assert.equal(tutorialStatus(other, ME).completed, 0, "outro servidor");

    getPlayer(g, OTHER);

    assert.equal(tutorialStatus(g, OTHER).completed, 0, "outra pessoa");
});

test("sem emprego escolhido (job_id vazio) o passo do emprego não conta", () => {
    const g = setup();

    assert.equal(db.prepare("SELECT job_id FROM players WHERE guild_id = ? AND user_id = ?").get(g, ME).job_id, "");
    assert.equal(tutorialStatus(g, ME).steps.find(step => step.id === "job").done, false);

    db.prepare("UPDATE players SET job_id = 'inexistente' WHERE guild_id = ? AND user_id = ?").run(g, ME);

    assert.equal(tutorialStatus(g, ME).steps.find(step => step.id === "job").done, false, "emprego que não existe não vale");
});

// ==========================================
// O PRÊMIO
// ==========================================

test("o prêmio: incompleto recusa, completo paga dinheiro e XP uma vez só e anota no extrato", () => {
    const g = setup();

    assert.deepEqual(claimTutorial(g, ME), { status: "incomplete", completed: 0, total: TUTORIAL_STEPS.length });

    complete(g, "job");

    assert.equal(claimTutorial(g, ME).completed, 1);

    completeAll(g);

    const before = db.prepare("SELECT wallet, xp FROM players WHERE guild_id = ? AND user_id = ?").get(g, ME);

    const paid = claimTutorial(g, ME);

    assert.equal(paid.status, "ok");
    assert.equal(paid.money, TUTORIAL_REWARD.money);
    assert.equal(paid.xp, TUTORIAL_REWARD.xp);
    assert.equal(paid.wallet, before.wallet + TUTORIAL_REWARD.money);

    const after = db.prepare("SELECT wallet, xp FROM players WHERE guild_id = ? AND user_id = ?").get(g, ME);

    assert.equal(after.wallet, before.wallet + TUTORIAL_REWARD.money);
    assert.equal(after.xp, before.xp + TUTORIAL_REWARD.xp);

    assert.deepEqual(ledger(g, "tutorial"), [TUTORIAL_REWARD.money]);
    assert.equal(getStat(g, ME, TUTORIAL_CLAIM_KEY), 1);

    assert.deepEqual(claimTutorial(g, ME), { status: "claimed" });
    assert.equal(wallet(g), after.wallet, "não paga duas vezes");
    assert.equal(tutorialStatus(g, ME).claimed, true);
});

test("o prêmio é por servidor: em outro servidor é outro prêmio", () => {
    const g = setup();
    const other = setup();

    completeAll(g);
    completeAll(other);

    assert.equal(claimTutorial(g, ME).status, "ok");
    assert.equal(claimTutorial(other, ME).status, "ok");
});

test("carteira no teto: recusa sem pagar nem marcar, e dá para resgatar depois", () => {
    const g = setup();

    completeAll(g);

    db.prepare("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?").run(100_000_000_000_000, g, ME);

    assert.throws(() => claimTutorial(g, ME), /não comporta/);
    assert.equal(getStat(g, ME, TUTORIAL_CLAIM_KEY), 0, "não marcou");
    assert.deepEqual(ledger(g, "tutorial"), []);

    db.prepare("UPDATE players SET wallet = 0 WHERE guild_id = ? AND user_id = ?").run(g, ME);

    assert.equal(claimTutorial(g, ME).status, "ok");
});

// ==========================================
// A TELA E OS CLIQUES
// ==========================================

const buttonsOf = view => view.components.flatMap(line => line.components);

test("a tela: ⬜ nos que faltam e ✅ nos feitos, a barra de progresso, e o botão do prêmio só quando tudo está feito", () => {
    const g = setup();

    complete(g, "job");
    complete(g, "work");

    const view = buildTutorial({ guildId: g, userId: ME });

    const description = view.embed.description;

    assert.equal((description.match(/✅/g) ?? []).length, 2);
    assert.equal((description.match(/⬜/g) ?? []).length, TUTORIAL_STEPS.length - 2);
    assert.match(description, new RegExp(`\\*\\*2/${TUTORIAL_STEPS.length}\\*\\*`));
    assert.match(description, /ganhe \*\*R\$/);

    assert.deepEqual(buttonsOf(view).map(button => button.label), ["Atualizar"], "sem prêmio para resgatar ainda");

    completeAll(g);

    const ready = buildTutorial({ guildId: g, userId: ME });

    assert.deepEqual(buttonsOf(ready).map(button => button.label), ["Resgatar prêmio", "Atualizar"]);
    assert.match(ready.embed.description, /Tudo feito!/);

    claimTutorial(g, ME);

    const claimed = buildTutorial({ guildId: g, userId: ME });

    assert.deepEqual(buttonsOf(claimed).map(button => button.label), ["Atualizar"], "depois do prêmio, só o atualizar");
    assert.match(claimed.embed.description, /já recebeu o prêmio/);
});

test("o V2: uma seção por passo, o estado ao lado, IDs únicos e dentro do limite do Discord", () => {
    const g = setup();

    for (const prepare of [() => {}, () => complete(g, "job"), () => completeAll(g)]) {
        prepare();

        const view = buildTutorial({ guildId: g, userId: ME });

        assert.deepEqual(layoutProblems(view.layout), []);
        assert.ok(countComponents(view.layout) <= V2_LIMITS.components, String(countComponents(view.layout)));

        const sections = view.layout[0].components.filter(component => component.type === "section");

        assert.equal(sections.length, TUTORIAL_STEPS.length);

        for (const section of sections) {
            assert.equal(section.accessory.disabled, true);
            assert.ok(["Feito", "Falta"].includes(section.accessory.label));
        }
    }
});

test("os cliques: Atualizar reconfere, Resgatar prêmio paga e avisa na mesma mensagem, e só o dono mexe", () => {
    const g = setup();

    // faltam passos: o botão forjado só avisa
    assert.match(texto(click(g, `tut:claim:${ME}`)), /Ainda faltam passos/);
    assert.equal(wallet(g), 0);

    complete(g, "job");

    const refreshed = click(g, `tut:ref:${ME}`);

    assert.equal(refreshed.type, "update");
    assert.match(texto(refreshed.data.embeds), new RegExp(`\\*\\*1/${TUTORIAL_STEPS.length}\\*\\*`));

    completeAll(g);

    // de outra pessoa não paga
    assert.match(texto(click(g, `tut:claim:${ME}`, OTHER)), /de outra pessoa/);
    assert.equal(wallet(g), 0);

    const claimed = click(g, `tut:claim:${ME}`);

    assert.equal(claimed.type, "update");
    assert.match(texto(claimed.data.embeds), /Prêmio resgatado/);
    assert.match(texto(claimed.data.layout), /Prêmio resgatado/);
    assert.equal(wallet(g), TUTORIAL_REWARD.money);

    // apertar de novo (mensagem velha) só avisa
    assert.match(texto(click(g, `tut:claim:${ME}`)), /Prêmio já recebido/);
    assert.equal(wallet(g), TUTORIAL_REWARD.money);

    assert.match(texto(click(g, `tut:xyz:${ME}`)), /Botão desconhecido/);

    // fora de um servidor não faz nada
    assert.equal(handlePanelClick({ user: { id: ME }, data: { customId: `tut:ref:${ME}` } }), null);
});

// ==========================================
// O COMANDO E O INGLÊS
// ==========================================

test("/tutorial: nome, sem alias, descrição curta, e responde com o clássico e o V2", async () => {
    const log = console.log;

    console.log = () => {};

    const comandos = await carregarComandos();

    console.log = log;

    const command = resolverComando(comandos, "tutorial");

    assert.ok(command);
    assert.equal(command.aliases, undefined, "alias gasta vaga de comando de barra");
    assert.ok(command.description.length <= 70);

    const g = guild();

    const response = await command.execute({ id: "i", guildId: g, channelId: "c", user: { id: ME }, data: { options: {} } });

    assert.match(texto(response.data.embeds), /Primeiros passos/);
    assert.equal(response.data.components.length, 1);
    assert.deepEqual(layoutProblems(response.data.layout), []);

    assert.match(texto(await command.execute({ id: "x", user: { id: ME }, data: { options: {} } })), /identificar/);
});

test("em inglês, o tutorial inteiro sai traduzido, nos três estados", () => {
    const g = setup();

    for (const prepare of [() => {}, () => completeAll(g), () => claimTutorial(g, ME)]) {
        prepare();

        const view = buildTutorial({ guildId: g, userId: ME });

        const english = texto(localizeData({ body: "", embeds: [view.embed], components: view.components, layout: view.layout }, "en-US"));

        assert.match(english, /First steps/);
        assert.match(english, /Steps check themselves off/);
        assert.match(english, /Pick a job|Done/);

        assert.doesNotMatch(english, /Primeiros passos|Escolha um emprego|Faça o primeiro|Pesque pela primeira|Resgate o daily|Resgatar prêmio|Os passos se marcam/);
    }

    // o aviso do prêmio resgatado
    const g2 = setup();

    completeAll(g2);

    const paid = click(g2, `tut:claim:${ME}`);

    const text = texto(localizeData({ body: "", embeds: paid.data.embeds, layout: paid.data.layout }, "en-US"));

    assert.match(text, /Reward claimed/);
    assert.doesNotMatch(text, /Prêmio resgatado/);
});
