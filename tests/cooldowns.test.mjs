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

test("tudo pronto: ✅ em todas as linhas, nos dois grupos, sem a cadeia", () => {
    const view = buildCooldowns({ guildId: G, user: ME, now: NOW });

    const legal = view.embed.fields[0];
    const illegal = view.embed.fields[1];

    assert.equal(legal.name, "⚖️ Legal");
    assert.equal(illegal.name, "🦹 Ilegal");

    assert.deepEqual(legal.value.split("\n"), [
        "✅ **Trabalhar:** Pronto para uso",
        "✅ **Recompensa diária:** Pronto para uso",
        "✅ **Bônus de gemas:** Pronto para uso"
    ]);

    assert.deepEqual(illegal.value.split("\n"), [
        "✅ **Crime:** Pronto para uso",
        "✅ **Roubar:** Pronto para uso",
        "✅ **Lavagem:** Pronto para uso"
    ]);

    assert.equal(view.waiting, 0);
    assert.doesNotMatch(texts(view.layout), /Cadeia/);
});

test("em recarga: ⏳ com o tempo que falta, de cada atividade", () => {
    set("UPDATE players SET last_work = ?, last_daily = ? WHERE guild_id = ? AND user_id = ?", NOW - 600, NOW - 3_600, G, ME.id);
    set("UPDATE crime_players SET last_crime = ? WHERE guild_id = ? AND user_id = ?", NOW - 10, G, ME.id);
    set("UPDATE global_users SET last_gem_claim = ? WHERE user_id = ?", NOW - 3 * 3_600, ME.id);

    const view = buildCooldowns({ guildId: G, user: ME, now: NOW });

    const legal = view.embed.fields[0].value;
    const illegal = view.embed.fields[1].value;

    // trabalho: 1 hora - 10 minutos; daily: 24 h - 1 h; gemas: 5 h - 3 h
    assert.match(legal, /⏳ \*\*Trabalhar:\*\* `em 50m`/);
    assert.match(legal, /⏳ \*\*Recompensa diária:\*\* `em 23h`/);
    assert.match(legal, /⏳ \*\*Bônus de gemas:\*\* `em 2h`/);
    assert.match(illegal, /⏳ \*\*Crime:\*\* `em /);
    assert.match(illegal, /✅ \*\*Roubar:\*\* Pronto para uso/);

    assert.equal(view.waiting, 4);
});

test("preso: a cadeia aparece no grupo ilegal, com o tempo que falta", () => {
    imprison(G, ME.id, 1_200, "teste");

    const view = buildCooldowns({ guildId: G, user: ME });

    assert.match(view.embed.fields[1].value, /⛓️ \*\*Cadeia:\*\* `falta /);
    assert.match(texts(view.layout), /Cadeia/);
});

test("as atividades vêm das mesmas fontes do jogo (daily e gemas pelo serviço, não por coluna solta)", () => {
    const data = cooldownsOf(G, ME.id, NOW);

    assert.deepEqual(data.legal.map(item => item.label), ["Trabalhar", "Recompensa diária", "Bônus de gemas"]);
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

    // o cabeçalho é uma seção: título e linha de apoio à esquerda, o avatar à direita
    assert.equal(inside[0].type, "section");
    assert.equal(inside[0].texts[0], "## ⏱️ Tempos de recarga");
    assert.match(inside[0].texts[1], new RegExp(`^<@${ME.id}> · atualizado às \\d\\d:\\d\\d$`));
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
    assert.equal(view.layout[0].components[0].content, "## ⏱️ Tempos de recarga");
});

test("a cor muda com o estado: verde com tudo pronto, a da marca com alguma recarga", () => {
    assert.equal(buildCooldowns({ guildId: G, user: ME, now: NOW }).layout[0].accentColor.toLowerCase(), "#22c55e");

    set("UPDATE players SET last_work = ? WHERE guild_id = ? AND user_id = ?", NOW - 60, G, ME.id);

    assert.equal(buildCooldowns({ guildId: G, user: ME, now: NOW }).layout[0].accentColor.toLowerCase(), "#8755da");
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
