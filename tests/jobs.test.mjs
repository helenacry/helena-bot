import { set, get, getPlayer, createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { buildJobs, chooseJob } = await import("../services/economy/jobs.mjs");
const { handlePanelClick } = await import("../services/panels/panels.mjs");
const { carregarComandos } = await import("../command-registry.mjs");
const { JOBS, getJob } = await import("../config/jobs.mjs");

const G = "900000000000000011";
const ME = { id: "111111111111111121", username: "eu", displayName: "Eu Mesmo", avatarUrl: "https://cdn.exemplo.test/eu.png" };
const OTHER = { id: "222222222222222232", username: "outro", displayName: "Outro" };

const reset = (level = 1) => {
    set("DELETE FROM players WHERE guild_id = ?", G);

    getPlayer(G, ME.id);

    set("UPDATE players SET level = ? WHERE guild_id = ? AND user_id = ?", level, G, ME.id);
};

test.beforeEach(() => reset());

const jobOf = user => get("SELECT job_id FROM players WHERE guild_id = ? AND user_id = ?", G, user.id).job_id;

// ==========================================
// QUEM CHEGA NÃO TEM EMPREGO
// ==========================================

test("o jogador novo começa sem emprego, e getJob não inventa um", () => {
    assert.equal(jobOf(ME), "");
    assert.equal(getJob(""), null);
    assert.equal(getJob("cargo-que-nao-existe"), null);
    assert.equal(getJob("entregador").name, "Entregador");
});

test("o primeiro /trabalhar abre a escolha do emprego em vez de pagar", async () => {
    const command = (await carregarComandos()).get("trabalhar");

    const before = get("SELECT wallet, xp, last_work FROM players WHERE guild_id = ? AND user_id = ?", G, ME.id);

    const result = await command.execute({ guildId: G, user: ME, data: { options: {} } });

    assert.equal(result.type, "message");

    const embed = result.data.embeds[0];

    assert.match(embed.description, /Antes de trabalhar, escolha um emprego/);
    assert.match(embed.description, /Você está sem emprego/);

    const menu = result.data.components[0].components[0];

    assert.equal(menu.type, "select");
    assert.equal(menu.placeholder, "Escolha uma profissão");
    assert.equal(menu.customId, `emp:escolher:${ME.id}`);

    // nada foi pago nem gasto
    assert.deepEqual(
        get("SELECT wallet, xp, last_work FROM players WHERE guild_id = ? AND user_id = ?", G, ME.id),
        before
    );
});

test("pelo prefixo, o htrabalhar sem emprego também mostra o menu", async () => {
    const run = await createPrefixRunner({ guildId: G, author: ME });

    const sent = (await run("htrabalhar")).sent[0];

    assert.match(sent.embeds[0].description, /Antes de trabalhar/);
    assert.equal(sent.components[0].components[0].placeholder, "Escolha uma profissão");
});

// ==========================================
// A TELA
// ==========================================

test("a tela separa o que está liberado do que está bloqueado, pelo nível", () => {
    reset(5);

    const view = buildJobs({ guildId: G, user: ME });

    const open = JOBS.filter(job => job.level <= 5);
    const locked = JOBS.filter(job => job.level > 5);

    const text = view.embed.description;

    assert.match(text, new RegExp(`### ✅ Disponíveis para você \\(${open.length}\\)`));
    assert.match(text, new RegExp(`### 🔒 Ainda bloqueados \\(${locked.length}\\)`));

    for (const job of open) assert.match(text, new RegExp(`💼 \\*\\*${job.name}\\*\\* · R\\$`));
    for (const job of locked) assert.match(text, new RegExp(`🔒 ${job.name} · R\\$`));

    // o menu só oferece os cargos liberados
    const menu = view.components[0].components[0];

    assert.deepEqual(menu.options.map(option => option.value), open.map(job => job.id));
    assert.ok(menu.options.every(option => option.description.includes("nível")));
});

test("quem já tem emprego vê o cargo marcado e o menu o deixa selecionado", () => {
    reset(5);

    chooseJob(G, ME.id, "motorista");

    const view = buildJobs({ guildId: G, user: ME });

    assert.match(view.embed.description, /Você é \*\*Motorista\*\*/);
    assert.match(view.embed.description, /⭐ \*\*Motorista\*\* · .* · seu emprego/);

    const selected = view.components[0].components[0].options.filter(option => option.default);

    assert.deepEqual(selected.map(option => option.value), ["motorista"]);
});

test("com todos os cargos liberados, não existe a seção de bloqueados", () => {
    reset(100);

    assert.doesNotMatch(buildJobs({ guildId: G, user: ME }).embed.description, /Ainda bloqueados/);
});

test("a descrição cabe no limite do embed e o menu no de 25 opções, mesmo com todos os cargos", () => {
    reset(100);

    const view = buildJobs({ guildId: G, user: ME });

    assert.ok(view.embed.description.length <= 4096);
    assert.ok(view.components[0].components[0].options.length <= 25);
});

// ==========================================
// ESCOLHER
// ==========================================

test("chooseJob: grava o cargo liberado, recusa o bloqueado e o que já é seu", () => {
    reset(3);

    assert.equal(chooseJob(G, ME.id, "nao-existe").status, "unknown");

    assert.equal(chooseJob(G, ME.id, "motorista").status, "locked");
    assert.equal(jobOf(ME), "");

    const done = chooseJob(G, ME.id, "faxineiro");

    assert.equal(done.status, "ok");
    assert.equal(done.previous, null);
    assert.equal(jobOf(ME), "faxineiro");

    assert.equal(chooseJob(G, ME.id, "faxineiro").status, "same");

    const swapped = chooseJob(G, ME.id, "entregador");

    assert.equal(swapped.status, "ok");
    assert.equal(swapped.previous.id, "faxineiro");
});

test("o menu: só o dono escolhe, e a escolha vira a confirmação sem o menu", () => {
    reset(2);

    const pick = (user, value) => handlePanelClick({
        guildId: G,
        user,
        data: { customId: `emp:escolher:${ME.id}`, values: [value] }
    });

    const blocked = pick(OTHER, "entregador");

    assert.equal(blocked.type, "message");
    assert.equal(blocked.data.ephemeral, true);
    assert.equal(jobOf(ME), "");

    const locked = pick(ME, "engenheiro");

    assert.equal(locked.data.ephemeral, true);
    assert.match(locked.data.embeds[0].title, /bloqueado/);
    assert.equal(jobOf(ME), "");

    const done = pick(ME, "atendente");

    assert.equal(done.type, "update");
    assert.deepEqual(done.data.components, []);
    assert.match(done.data.embeds[0].title, /Novo emprego/);
    assert.match(done.data.embeds[0].description, /\/trabalhar/);
    assert.equal(jobOf(ME), "atendente");

    const again = pick(ME, "atendente");

    assert.match(again.data.embeds[0].title, /já tem esse emprego/);
});

test("depois de escolher, o /trabalhar paga o salário do cargo", async () => {
    reset(1);

    chooseJob(G, ME.id, "entregador");

    const command = (await carregarComandos()).get("trabalhar");

    const result = await command.execute({ guildId: G, user: ME, data: { options: {} } });

    assert.match(result.data.embeds[0].title, /Expediente concluído/);
    assert.match(result.data.embeds[0].description, /Entregador/);
});

test("/empregos cargo:... assume o emprego direto, e sem opção mostra a tela com o menu", async () => {
    reset(4);

    const command = (await carregarComandos()).get("empregos");

    const list = await command.execute({ guildId: G, user: ME, data: { options: {} } });

    assert.equal(list.data.components[0].components[0].customId, `emp:escolher:${ME.id}`);

    const taken = await command.execute({ guildId: G, user: ME, data: { options: { cargo: "garcom" } } });

    assert.match(taken.data.embeds[0].title, /Novo emprego/);
    assert.equal(jobOf(ME), "garcom");

    const locked = await command.execute({ guildId: G, user: ME, data: { options: { cargo: "magnata" } } });

    assert.match(locked.data.embeds[0].title, /Emprego bloqueado/);
    assert.equal(jobOf(ME), "garcom");
});
