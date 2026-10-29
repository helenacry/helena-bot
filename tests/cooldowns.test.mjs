import { set, getPlayer, createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { buildCooldowns, cooldownsOf } = await import("../services/economy/cooldowns-view.mjs");
const { handlePanelClick } = await import("../services/panels/panels.mjs");
const { layoutProblems } = await import("../utils/components-v2.mjs");
const { ensureCrimePlayer } = await import("../services/crime/crime-player.mjs");
const { imprison } = await import("../services/crime/prison.mjs");
const { carregarComandos } = await import("../command-registry.mjs");

const G = "900000000000000001";
const ME = { id: "111111111111111111", username: "eu", displayName: "Eu Mesmo", avatarUrl: "https://cdn.exemplo.test/eu.png" };
const OTHER = { id: "222222222222222222", username: "outro", displayName: "Outro" };

const NOW = 1_800_000_000;

const texts = layout => JSON.stringify(layout);

// "✅ **Trabalhar:** Pronto para uso" -> { Trabalhar: "Pronto para uso" } (o ícone vai junto: ["✅", valor]).
function linesOf(value) {
    const lines = {};

    for (const text of value.split("\n")) {
        const found = text.match(/^(\S+) \*\*(.+):\*\* (.+)$/u);

        assert.ok(found, `linha fora do formato: ${text}`);

        lines[found[2]] = [found[1], found[3]];
    }

    return lines;
}

const READY = ["✅", "Pronto para uso"];

// o Gozofone de quem não é casado(a): a linha existe, mas não está pronta nem esperando
const LOCKED = ["💍", "Só para casais"];

// o relógio do Discord: <t:quando:R>, "em 2 horas"
const waitsUntil = (line, when) => assert.deepEqual(line, ["⏳", `<t:${when}:R>`]);

function reset(user = ME) {
    getPlayer(G, user.id);
    ensureCrimePlayer(G, user.id);

    set("UPDATE players SET last_work = 0, last_daily = 0 WHERE guild_id = ? AND user_id = ?", G, user.id);
    set("UPDATE crime_players SET last_crime = 0, last_rob = 0, launder_ready_at = 0 WHERE guild_id = ? AND user_id = ?", G, user.id);
    set("DELETE FROM prison_players WHERE guild_id = ? AND user_id = ?", G, user.id);
    set("UPDATE global_users SET last_gem_claim = 0 WHERE user_id = ?", user.id);
}

test.beforeEach(() => reset());

// ==========================================
// OS TEMPOS
// ==========================================

test("tudo pronto: '✅ Pronto para uso' em todas as linhas, nos dois grupos, sem a cadeia", () => {
    const view = buildCooldowns({ guildId: G, user: ME, now: NOW });

    const legal = view.embed.fields[0];
    const illegal = view.embed.fields[1];

    assert.equal(legal.name, "⚖️ Legal");
    assert.equal(illegal.name, "🦹 Ilegal");

    // cada grupo é uma lista (✅ **nome:** Pronto para uso), na ordem de sempre
    assert.deepEqual(Object.entries(linesOf(legal.value)), [
        ["Trabalhar", READY],
        ["Recompensa diária", READY],
        ["Bônus de gemas", READY],
        ["Gozofone", LOCKED]
    ]);

    assert.deepEqual(Object.entries(linesOf(illegal.value)), [
        ["Crime", READY],
        ["Roubar", READY],
        ["Lavagem", READY]
    ]);

    assert.equal(view.waiting, 0);
    assert.doesNotMatch(texts(view.layout), /Cadeia/);
});

test("em recarga: o tempo que falta de cada atividade", () => {
    set("UPDATE players SET last_work = ?, last_daily = ? WHERE guild_id = ? AND user_id = ?", NOW - 600, NOW - 3_600, G, ME.id);
    set("UPDATE crime_players SET last_crime = ? WHERE guild_id = ? AND user_id = ?", NOW - 10, G, ME.id);
    set("UPDATE global_users SET last_gem_claim = ? WHERE user_id = ?", NOW - 3 * 3_600, ME.id);

    const view = buildCooldowns({ guildId: G, user: ME, now: NOW });

    const legal = linesOf(view.embed.fields[0].value);
    const illegal = linesOf(view.embed.fields[1].value);

    // trabalho: 1 hora - 10 minutos; daily: 24 h - 1 h; gemas: 5 h - 3 h (o relógio do Discord leva a hora em que libera)
    waitsUntil(legal["Trabalhar"], NOW + 50 * 60);
    waitsUntil(legal["Recompensa diária"], NOW + 23 * 3_600);
    waitsUntil(legal["Bônus de gemas"], NOW + 2 * 3_600);
    assert.equal(illegal["Crime"][0], "⏳");
    assert.match(illegal["Crime"][1], /^<t:\d+:R>$/);
    assert.deepEqual(illegal["Roubar"], READY);

    assert.equal(view.waiting, 4);
});

test("preso: a cadeia aparece no grupo ilegal, com o relógio de quando sai", () => {
    imprison(G, ME.id, 1_200, "teste");

    const view = buildCooldowns({ guildId: G, user: ME });

    const jail = linesOf(view.embed.fields[1].value)["Cadeia"];

    assert.equal(jail[0], "🔒");
    assert.match(jail[1], /^<t:\d+:R>$/);
    assert.match(texts(view.layout), /Cadeia/);
});

test("as atividades vêm das mesmas fontes do jogo (daily e gemas pelo serviço, não por coluna solta)", () => {
    const data = cooldownsOf(G, ME.id, NOW);

    assert.deepEqual(data.legal.map(item => item.label), ["Trabalhar", "Recompensa diária", "Bônus de gemas", "Gozofone"]);
    assert.deepEqual(data.illegal.map(item => item.label), ["Crime", "Roubar", "Lavagem"]);
    assert.equal(data.prison, null);
});

// ==========================================
// O DESENHO
// ==========================================

test("o V2: avatar ao lado do título, os dois grupos separados por linhas finas, nota e botão Atualizar", () => {
    const view = buildCooldowns({ guildId: G, user: ME, now: NOW });

    assert.deepEqual(layoutProblems(view.layout), []);

    const inside = view.layout[0].components;

    // o cabeçalho é uma seção: a seção, o título e a linha de apoio à esquerda, o avatar à direita
    assert.equal(inside[0].type, "section");
    assert.equal(inside[0].texts[0], "-# HELENA · RECARGAS");
    assert.equal(inside[0].texts[1], "## ⏱️ Tempos de recarga");
    assert.equal(inside[0].texts[2], `**Eu Mesmo** · atualizado <t:${NOW}:R>`);
    assert.deepEqual(inside[0].accessory, { type: "thumbnail", url: ME.avatarUrl });

    const kinds = inside.map(component => component.type);

    assert.deepEqual(kinds, ["section", "separator", "text", "separator", "text", "separator", "text", "row"]);

    assert.match(inside[2].content, /^### ⚖️ Legal\n/);
    assert.match(inside[4].content, /^### 🦹 Ilegal\n/);
    assert.match(inside[6].content, /^-# Toque em Atualizar/);

    const refresh = inside[7].components[0];

    assert.equal(refresh.customId, `cd:atualizar:${ME.id}`);
    assert.equal(refresh.label, "Atualizar");
    assert.equal(refresh.emoji, "🔄");
});

test("sem avatar https o cabeçalho vira texto solto (a seção exige um acessório)", () => {
    const view = buildCooldowns({ guildId: G, user: { ...ME, avatarUrl: "http://inseguro.test/a.png" }, now: NOW });

    assert.deepEqual(layoutProblems(view.layout), []);
    assert.equal(view.layout[0].components[0].type, "text");
    assert.equal(view.layout[0].components[0].content, "-# HELENA · RECARGAS");
    assert.equal(view.layout[0].components[1].content, "## ⏱️ Tempos de recarga");
});

test("a cor muda com o estado: verde com tudo pronto, a da espera com alguma recarga", async () => {
    const { HELENA_COLORS } = await import("../utils/embed.mjs");

    assert.equal(buildCooldowns({ guildId: G, user: ME, now: NOW }).layout[0].accentColor.toLowerCase(), HELENA_COLORS.success);

    set("UPDATE players SET last_work = ? WHERE guild_id = ? AND user_id = ?", NOW - 60, G, ME.id);

    assert.equal(buildCooldowns({ guildId: G, user: ME, now: NOW }).layout[0].accentColor.toLowerCase(), HELENA_COLORS.wait);
});

// ==========================================
// O COMANDO E O BOTÃO
// ==========================================

test("o comando devolve o embed clássico, o botão e o layout V2 (o layout nunca vai para o clássico)", async () => {
    const command = (await carregarComandos()).get("cooldowns");

    const result = await command.execute({ guildId: G, user: ME, data: { options: {} } });

    assert.equal(result.type, "message");
    assert.equal(result.data.embeds.length, 1);
    assert.equal(result.data.components[0].components[0].customId, `cd:atualizar:${ME.id}`);
    assert.ok(Array.isArray(result.data.layout));

    // pelo prefixo: o texto sai no clássico, sem o campo layout
    const run = await createPrefixRunner({ guildId: G, author: ME });

    const sent = (await run("hcd")).sent[0];

    assert.ok(!("layout" in sent), "o layout não vai para a API no clássico");
    assert.equal(sent.embeds[0].title, "⏱️ Tempos de recarga");
    assert.equal(sent.components[0].components[0].label, "Atualizar");
});

test("o botão Atualizar: só quem abriu atualiza, e a tela sai de novo com os tempos de agora", () => {
    const click = user => handlePanelClick({
        guildId: G,
        user,
        data: { customId: `cd:atualizar:${ME.id}` }
    });

    const refreshed = click(ME);

    assert.equal(refreshed.type, "update");
    assert.equal(refreshed.data.embeds[0].title, "⏱️ Tempos de recarga");
    assert.ok(Array.isArray(refreshed.data.layout));
    assert.equal(refreshed.data.components[0].components[0].customId, `cd:atualizar:${ME.id}`);

    const blocked = click(OTHER);

    assert.equal(blocked.type, "message");
    assert.equal(blocked.data.ephemeral, true);
});

// ==========================================
// GOZOFONE
// ==========================================

const { FAMILY_RULES } = await import("../config/family.mjs");
const { callWait } = await import("../services/social/family.mjs");

function marry() {
    set("DELETE FROM marriages WHERE guild_id = ?", G);
    set("DELETE FROM family_calls WHERE guild_id = ?", G);

    for (const [user, spouse] of [[ME.id, OTHER.id], [OTHER.id, ME.id]]) {
        set("INSERT INTO marriages (guild_id, user_id, spouse_id, married_at) VALUES (?, ?, ?, ?)", G, user, spouse, NOW - 1000);
    }
}

test("Gozofone: a linha é a última do grupo Legal para todos; sem casamento diz 'Só para casais'", () => {
    set("DELETE FROM marriages WHERE guild_id = ?", G);

    assert.deepEqual(callWait(G, ME.id, NOW), { married: false, remaining: 0 });
    assert.ok(cooldownsOf(G, ME.id, NOW).legal.some(item => item.label === "Gozofone"));

    const single = buildCooldowns({ guildId: G, user: ME, now: NOW });

    // nem pronto (o comando recusaria) nem esperando (não entra na conta dos que esperam)
    assert.deepEqual(Object.entries(linesOf(single.embed.fields[0].value)).at(-1), ["Gozofone", LOCKED]);
    assert.ok(JSON.stringify(single.layout).includes("💍 **Gozofone:** Só para casais"));
    assert.equal(single.waiting, 0);

    marry();

    const view = buildCooldowns({ guildId: G, user: ME, now: NOW });

    assert.deepEqual(Object.entries(linesOf(view.embed.fields[0].value)).at(-1), ["Gozofone", READY]);
    assert.equal(view.waiting, 0);
});

test("Gozofone: a espera de 1 hora aparece com o tempo e conta nos que esperam; volta a 'pronto' depois", () => {
    marry();

    assert.equal(FAMILY_RULES.cooldown, 60 * 60);

    // ligou há 20 minutos: faltam 40
    set("INSERT INTO family_calls (guild_id, user_id, last_call) VALUES (?, ?, ?)", G, ME.id, NOW - 20 * 60);

    const view = buildCooldowns({ guildId: G, user: ME, now: NOW });

    waitsUntil(linesOf(view.embed.fields[0].value)["Gozofone"], NOW + 40 * 60);
    assert.equal(view.waiting, 1);

    // no V2, a mesma linha no bloco Legal
    assert.ok(JSON.stringify(view.layout).includes(`⏳ **Gozofone:** <t:${NOW + 40 * 60}:R>`));

    // a espera é de quem ligou: o cônjuge está liberado
    assert.equal(callWait(G, OTHER.id, NOW).remaining, 0);

    // passada 1 hora, liberado
    const later = buildCooldowns({ guildId: G, user: ME, now: NOW + 40 * 60 });

    assert.deepEqual(linesOf(later.embed.fields[0].value)["Gozofone"], READY);
    assert.equal(later.waiting, 0);

    set("DELETE FROM marriages WHERE guild_id = ?", G);
    set("DELETE FROM family_calls WHERE guild_id = ?", G);
});
