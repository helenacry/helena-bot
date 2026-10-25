import { set, get, getPlayer, createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { buildRanking, typeForScope } = await import("../services/economy/ranking-view.mjs");
const { globalRanking } = await import("../services/economy/global-ranking.mjs");
const { getTopXP } = await import("../services/platform/status-data.mjs");
const { handlePanelClick } = await import("../services/panels/panels.mjs");
const { savePlayerName } = await import("../services/platform/player-names.mjs");
const { db } = await import("./helpers.mjs");

// Dois servidores: a Ana joga nos dois, o Beto só no primeiro, a Cris só no segundo.
const G1 = "900000000000000071";
const G2 = "900000000000000072";

const ANA = "700000000000000001";
const BETO = "700000000000000002";
const CRIS = "700000000000000003";

function reset() {
    for (const table of ["players", "global_users", "player_names"]) {
        db.exec(`DELETE FROM ${table}`);
    }

    const rows = [
        // servidor, pessoa, xp, carteira, banco
        [G1, ANA, 400, 10_000, 5_000],
        [G2, ANA, 700, 20_000, 0],
        [G1, BETO, 1_000, 50_000, 0],
        [G2, CRIS, 900, 1_000, 1_000]
    ];

    for (const [guild, user, xp, wallet, bank] of rows) {
        getPlayer(guild, user);

        set("UPDATE players SET xp = ?, wallet = ?, bank = ? WHERE guild_id = ? AND user_id = ?", xp, wallet, bank, guild, user);
    }

    set("INSERT INTO global_users (user_id, gems) VALUES (?, 5) ON CONFLICT(user_id) DO UPDATE SET gems = 5", CRIS);

    savePlayerName({ id: ANA, username: "ana", displayName: "Ana" });
    savePlayerName({ id: BETO, username: "beto", displayName: "Beto" });
    savePlayerName({ id: CRIS, username: "cris", displayName: "Cris" });
}

test.beforeEach(() => reset());

const ids = rows => rows.map(row => row.user_id);

// ==========================================
// A CONSULTA
// ==========================================

test("global: o XP soma todos os servidores (a Ana junta 400 + 700 e passa o Beto)", () => {
    const rows = globalRanking("xp");

    assert.deepEqual(ids(rows), [ANA, BETO, CRIS]);
    assert.deepEqual(rows.map(row => Number(row.value)), [1_100, 1_000, 900]);
});

test("global: o primeiro do XP total é quem o status do bot mostra (o mesmo cálculo e a mesma ordem)", () => {
    const top = getTopXP();

    assert.equal(top.userId, globalRanking("xp")[0].user_id);
    assert.equal(top.xp, Number(globalRanking("xp")[0].value));
    assert.equal(top.name, "Ana");

    // e quando o XP empata, o mesmo desempate (o menor ID) nos dois
    set("UPDATE players SET xp = 550 WHERE user_id = ?", ANA);
    set("UPDATE players SET xp = 1100 WHERE user_id = ? AND guild_id = ?", BETO, G1);

    assert.equal(getTopXP().userId, globalRanking("xp")[0].user_id);
});

test("global: patrimônio soma carteira e banco de todos os servidores", () => {
    const rows = globalRanking("money");

    // Beto 50.000 · Ana 10.000 + 5.000 + 20.000 = 35.000 · Cris 2.000
    assert.deepEqual(ids(rows), [BETO, ANA, CRIS]);
    assert.deepEqual(rows.map(row => Number(row.value)), [50_000, 35_000, 2_000]);
});

test("global: gemas são da conta e entram uma vez só, mesmo para quem joga em dois servidores", () => {
    set("UPDATE global_users SET gems = 9 WHERE user_id = ?", CRIS);
    set("INSERT INTO global_users (user_id, gems) VALUES (?, 3) ON CONFLICT(user_id) DO UPDATE SET gems = 3", ANA);

    const rows = globalRanking("gems");

    assert.deepEqual(ids(rows), [CRIS, ANA, BETO]);
    assert.deepEqual(rows.map(row => Number(row.value)), [9, 3, 0]);
});

test("global: tipo que não existe recusa; a consulta não cria nem muda jogador", () => {
    const before = get("SELECT COUNT(*) n FROM players").n;

    assert.throws(() => globalRanking("level"), /inválido/);

    globalRanking("xp");
    globalRanking("money");

    assert.equal(get("SELECT COUNT(*) n FROM players").n, before);
});

// ==========================================
// A TELA
// ==========================================

test("a tela global: título, contagem, nomes, posição de quem pediu e os botões do alcance", () => {
    const view = buildRanking({ guildId: G1, userId: CRIS, type: "xp", scope: "global" });

    assert.equal(view.embed.title, "🏆 Ranking global · XP total");
    assert.match(view.embed.description, /3 jogadores classificados em todos os servidores/);
    assert.match(view.embed.description, /🥇 \*\*Ana\*\* — 1\.100 XP • nível \d+/);
    assert.match(view.embed.description, /🥉 \*\*Cris\*\* · Você — 900 XP/);
    assert.match(view.embed.footer.text, /Sua posição global: #3/);

    const [types, scopes] = view.components;

    assert.deepEqual(types.components.map(item => item.customId), [
        `rank:tipo:${CRIS}:xp:g`, `rank:tipo:${CRIS}:money:g`, `rank:tipo:${CRIS}:gems:g`
    ]);
    assert.equal(types.components[0].disabled, true);

    assert.deepEqual(scopes.components.map(item => item.customId), [
        `rank:escopo:${CRIS}:s:xp`, `rank:escopo:${CRIS}:g:xp`
    ]);
    assert.equal(scopes.components[1].disabled, true, "o alcance atual fica desligado");
});

test("o servidor segue como sempre: só quem joga ali, e os botões de tipo sem sufixo", () => {
    const view = buildRanking({ guildId: G1, userId: ANA, type: "money" });

    assert.equal(view.embed.title, "🏆 Ranking · Patrimônio");
    assert.match(view.embed.description, /2 jogadores classificados/);
    assert.doesNotMatch(view.embed.description, /Cris/);
    assert.equal(view.components[0].components[0].customId, `rank:tipo:${ANA}:money`);
});

test("quem está fora do top 10 global vê a própria posição à parte", () => {
    for (let i = 0; i < 12; i++) {
        const id = String(700000000000000100n + BigInt(i));

        getPlayer(G1, id);
        set("UPDATE players SET xp = ? WHERE guild_id = ? AND user_id = ?", 5_000 + i, G1, id);
    }

    const view = buildRanking({ guildId: G1, userId: CRIS, type: "xp", scope: "global" });

    assert.equal(view.embed.fields[0].name, "📍 Sua posição global");
    assert.match(view.embed.fields[0].value, /\*\*15º lugar\*\*/);
});

test("typeForScope leva o tipo junto: nível do servidor vira XP total no global, e o contrário", () => {
    assert.equal(typeForScope("level", "global"), "xp");
    assert.equal(typeForScope("xp", "server"), "level");
    assert.equal(typeForScope("money", "global"), "money");
    assert.equal(typeForScope("gems", "server"), "gems");
    assert.equal(typeForScope("qualquer", "global"), "xp");
    assert.equal(typeForScope("qualquer", "server"), "money");
});

// ==========================================
// OS BOTÕES
// ==========================================

const click = (customId, user = { id: ANA }) => handlePanelClick({ guildId: G1, user, data: { customId } });

test("o botão Global troca o alcance na mesma mensagem e leva o tipo; o do servidor volta", () => {
    const toGlobal = click(`rank:escopo:${ANA}:g:level`);

    assert.equal(toGlobal.type, "update");
    assert.equal(toGlobal.data.embeds[0].title, "🏆 Ranking global · XP total", "nível do servidor vira XP total");

    const money = click(`rank:escopo:${ANA}:g:money`);

    assert.equal(money.data.embeds[0].title, "🏆 Ranking global · Patrimônio");

    const back = click(`rank:escopo:${ANA}:s:xp`);

    assert.equal(back.data.embeds[0].title, "🏆 Ranking · Nível", "XP total do global vira nível no servidor");
});

test("no alcance global, os botões de tipo continuam no global (sufixo :g) e só o dono mexe", () => {
    const gems = click(`rank:tipo:${ANA}:gems:g`);

    assert.equal(gems.data.embeds[0].title, "🏆 Ranking global · Gemas");

    const other = click(`rank:tipo:${ANA}:gems:g`, { id: BETO });

    assert.equal(other.data.ephemeral, true);
    assert.match(JSON.stringify(other), /outra pessoa/);

    assert.match(JSON.stringify(click(`rank:tipo:${ANA}:level:g`)), /Tipo de ranking inválido/);
    assert.match(JSON.stringify(click(`rank:xyz:${ANA}:g`)), /Botão desconhecido/);
});

// ==========================================
// O COMANDO
// ==========================================

test("/ranking escopo:global e o atalho do prefixo; o tipo 'nível' no global vira XP total", async () => {
    const run = await createPrefixRunner({ guildId: G1, author: { id: ANA, username: "ana", displayName: "Ana" } });

    const global = (await run("hranking escopo:global")).sent[0];

    assert.equal(global.embeds[0].title, "🏆 Ranking global · XP total");
    assert.equal(global.components.length, 2, "tipos e alcance");

    const level = (await run("hranking tipo:level escopo:global")).sent[0];

    assert.equal(level.embeds[0].title, "🏆 Ranking global · XP total");

    const money = (await run("hranking tipo:money escopo:global")).sent[0];

    assert.equal(money.embeds[0].title, "🏆 Ranking global · Patrimônio");

    const server = (await run("hranking")).sent[0];

    assert.equal(server.embeds[0].title, "🏆 Ranking · Patrimônio");

    const xpOnServer = (await run("hranking tipo:xp")).sent[0];

    assert.equal(xpOnServer.embeds[0].title, "🏆 Ranking · Nível", "XP total no servidor é o nível");
});
