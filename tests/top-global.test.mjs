import { db, set, getPlayer } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// O Top XP e o Top Coins globais no status do bot e nos canais de voz do servidor de suporte
// (services/platform/status-data.mjs e support-stats.mjs).

const data = await import("../services/platform/status-data.mjs");
const stats = await import("../services/platform/support-stats.mjs");
const { globalRanking } = await import("../services/economy/global-ranking.mjs");
const { savePlayerName } = await import("../services/platform/player-names.mjs");
const { STATUS_CONFIG } = await import("../config/status.mjs");

const ANA = "100000000000000001";
const BETO = "100000000000000002";
const CAIO = "100000000000000003";

const reais = n => n * 100;

function seed() {
    for (const table of ["players", "player_names", "global_users"]) {
        db.exec(`DELETE FROM ${table}`);
    }

    for (const [id, name] of [[ANA, "Ana"], [BETO, "Beto"], [CAIO, "Caio"]]) {
        savePlayerName({ id, username: name.toLowerCase(), displayName: name });
    }

    // Ana: rica em um servidor; Beto: dinheiro repartido em dois (soma maior); Caio: só XP
    getPlayer("g1", ANA);
    getPlayer("g1", BETO);
    getPlayer("g2", BETO);
    getPlayer("g1", CAIO);

    const put = (guild, user, wallet, bank, xp) =>
        set("UPDATE players SET wallet=?, bank=?, xp=? WHERE guild_id=? AND user_id=?", wallet, bank, xp, guild, user);

    put("g1", ANA, reais(5_000), reais(1_000), 100);
    put("g1", BETO, reais(3_000), reais(500), 200);
    put("g2", BETO, reais(2_000), reais(1_500), 300);
    put("g1", CAIO, reais(10), 0, 99_900);
}

// ==========================================
// O DINHEIRO COMPACTO
// ==========================================

test("formatMoneyCompact: R$ 850, R$ 12,3k, R$ 1,5M e R$ 2,1B", () => {
    const f = data.formatMoneyCompact;

    assert.equal(f(0), "R$ 0");
    assert.equal(f(reais(850)), "R$ 850");
    assert.equal(f(reais(999)), "R$ 999");
    assert.equal(f(reais(1_000)), "R$ 1,0k");
    assert.equal(f(reais(12_345)), "R$ 12,3k");
    assert.equal(f(reais(1_500_000)), "R$ 1,5M");
    assert.equal(f(reais(2_100_000_000)), "R$ 2,1B");
    assert.equal(f(99), "R$ 0", "menos de um real");
    assert.equal(f("lixo"), "R$ 0");
    assert.equal(f(NaN), "R$ 0");
});

// ==========================================
// O TOP COINS GLOBAL
// ==========================================

test("getTopMoney soma carteira e banco de todos os servidores e acha o mais rico", () => {
    seed();

    const top = data.getTopMoney();

    // Beto: 3.000 + 500 + 2.000 + 1.500 = 7.000; Ana: 6.000
    assert.equal(top.userId, BETO);
    assert.equal(top.name, "Beto");
    assert.equal(top.money, reais(7_000));
});

test("getTopMoney é o mesmo primeiro lugar do ranking global de dinheiro", () => {
    seed();

    assert.equal(data.getTopMoney().userId, globalRanking("money")[0].user_id);
    assert.equal(data.getTopMoney().money, Number(globalRanking("money")[0].value));
});

test("empate de dinheiro: quem tem mais XP fica na frente, depois o menor ID", () => {
    seed();

    set("UPDATE players SET wallet=?, bank=0 WHERE user_id=?", reais(1_000), BETO);
    set("UPDATE players SET wallet=?, bank=0, xp=? WHERE user_id=?", reais(1_000), 5, ANA);

    // Beto tem 2 contas com 1.000 cada = 2.000: sai do empate. Deixa as contas iguais:
    db.exec(`DELETE FROM players WHERE guild_id = 'g2'`);

    // Ana: 1.000 e 5 de XP; Beto: 1.000 e 200 de XP -> Beto
    assert.equal(data.getTopMoney().userId, BETO);

    set("UPDATE players SET xp=200 WHERE user_id=?", ANA);

    assert.equal(data.getTopMoney().userId, ANA, "XP igual: o menor ID");
});

test("sem nome salvo, o nome é 'Jogador' e os seis últimos dígitos; sem jogadores, null", () => {
    seed();

    db.exec("DELETE FROM player_names");

    assert.equal(data.getTopMoney().name, "Jogador 000002");

    db.exec("DELETE FROM players");

    assert.equal(data.getTopMoney(), null);
    assert.equal(data.getTopXP(), null);
});

// ==========================================
// O STATUS DO BOT
// ==========================================

test("o status mostra o Top XP e o Top Coins globais", () => {
    seed();

    const messages = data.getStatusMessages({ guildCount: 3 });

    assert.ok(messages.includes("Top XP: Caio 99,9k"), messages.join(" | "));
    assert.ok(messages.includes("Top Coins: Beto R$ 7,0k"), messages.join(" | "));
});

test("sem dados, as duas atividades dizem 'Sem dados'", () => {
    db.exec("DELETE FROM players");

    const messages = data.getStatusMessages({});

    assert.ok(messages.includes("Top XP: Sem dados"));
    assert.ok(messages.includes("Top Coins: Sem dados"));
});

test("os fragmentos aparecem no status só quando o bot informa, e tudo cabe no limite", () => {
    seed();

    assert.equal(data.getStatusMessages({}).some(message => message.startsWith("Shards")), false);

    const withShards = data.getStatusMessages({ guildCount: 3, shards: { ready: 2, total: 3 } });

    assert.ok(withShards.includes("Shards: 2/3"));
    assert.equal(withShards.length, 7);

    set("UPDATE players SET xp = 1 WHERE 1=1");
    savePlayerName({ id: BETO, username: "b", displayName: "B".repeat(60) });

    for (const message of data.getStatusMessages({ guildCount: 1_200_000, shards: { ready: 480, total: 480 } })) {
        assert.ok(Array.from(message).length <= STATUS_CONFIG.maxActivityLength, `"${message}"`);
    }
});

// ==========================================
// OS CANAIS DE VOZ
// ==========================================

test("channelsFromEnv: só os canais com ID, com espaços cortados, e o antigo clusters vale como shards", () => {
    assert.deepEqual(stats.channelsFromEnv({}), {});

    assert.deepEqual(stats.channelsFromEnv({
        HELENA_USERS_CHANNEL_ID: " 111 ",
        HELENA_SERVERS_CHANNEL_ID: "222",
        HELENA_CLUSTERS_CHANNEL_ID: "333",
        HELENA_TOPXP_CHANNEL_ID: "",
        HELENA_TOPCOINS_CHANNEL_ID: "   "
    }), { users: "111", servers: "222", shards: "333" });

    // o nome novo vence o antigo
    assert.equal(stats.channelsFromEnv({
        HELENA_SHARDS_CHANNEL_ID: "444",
        HELENA_CLUSTERS_CHANNEL_ID: "333"
    }).shards, "444");

    assert.deepEqual(Object.keys(stats.CHANNEL_VARIABLES), ["users", "servers", "shards", "topXp", "topCoins"]);
});

test("os nomes dos canais: usuários, servidores, shards, Top XP e Top Coins", () => {
    const names = stats.buildChannelNames({
        users: 1234,
        servers: 12,
        shards: { ready: 2, total: 3 },
        topXp: { name: "Caio", xp: 99_900 },
        topMoney: { name: "Beto", money: reais(1_500_000) }
    });

    assert.deepEqual(names, {
        users: "👥 Usuários: 1.234",
        servers: "🌐 Servidores: 12",
        shards: "🛰️ Shards: 2/3",
        topXp: "🏆 Top XP: Caio (99,9k)",
        topCoins: "💰 Top Coins: Beto (R$ 1,5M)"
    });
});

test("sem ninguém no ranking, os dois canais dizem 'sem dados'; os padrões são zero e 0/1", () => {
    const names = stats.buildChannelNames({});

    assert.equal(names.topXp, "🏆 Top XP: sem dados");
    assert.equal(names.topCoins, "💰 Top Coins: sem dados");
    assert.equal(names.users, "👥 Usuários: 0");
    assert.equal(names.servers, "🌐 Servidores: 0");
    assert.equal(names.shards, "🛰️ Shards: 0/1");
});

test("o nome de uma pessoa no canal: sem invisíveis, sem quebra de linha, até 40 letras", () => {
    assert.equal(stats.channelSafeName("Ana"), "Ana");
    assert.equal(stats.channelSafeName("  Ana   Maria  "), "Ana Maria");
    assert.equal(stats.channelSafeName("An​a‮\nMaria"), "AnaMaria", "invisíveis e direção do texto saem");
    assert.equal(stats.channelSafeName("​‮"), "?", "nada sobrando vira ?");
    assert.equal(stats.channelSafeName(null), "?");
    assert.equal(stats.channelSafeName("😀".repeat(50)), "😀".repeat(39) + "…", "corta por letra, sem partir um emoji");
    assert.ok(Array.from(stats.channelSafeName("x".repeat(100))).length <= 40);
});

test("todos os nomes cabem nos 100 caracteres de um canal, mesmo com nome e números enormes", () => {
    const names = stats.buildChannelNames({
        users: 999_999_999,
        servers: 999_999,
        shards: { ready: 1024, total: 1024 },
        topXp: { name: "N".repeat(200), xp: 9_999_999_999 },
        topMoney: { name: "M".repeat(200), money: reais(9_999_999_999) }
    });

    for (const [key, name] of Object.entries(names)) {
        assert.ok(Array.from(name).length <= 100, `${key}: ${name.length}`);
    }
});
