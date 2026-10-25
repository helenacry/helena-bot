import { db, getPlayer, set, get, createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { parseAmount, ALL_AMOUNT_WORDS } = await import("../database/economy.mjs");

const G = "222222222222222222";
const ME = { id: "111111111111111111", username: "t", displayName: "T" };

const run = await createPrefixRunner({ guildId: G, author: ME });

getPlayer(G, ME.id);

const money = () => ({ ...get("SELECT wallet, bank FROM players WHERE guild_id=? AND user_id=?", G, ME.id) });
const setMoney = (wallet, bank = 0) =>
    set("UPDATE players SET wallet=?, bank=? WHERE guild_id=? AND user_id=?", wallet, bank, G, ME.id);

const quiet = async fn => {
    const error = console.error;
    console.error = () => {};

    try { return await fn(); } finally { console.error = error; }
};

test("'tudo' e 'all' são as palavras para o saldo inteiro", () => {
    assert.deepEqual([...ALL_AMOUNT_WORDS], ["tudo", "all"]);

    assert.equal(parseAmount("tudo", 5000), 5000);
    assert.equal(parseAmount("all", 5000), 5000);
    assert.equal(parseAmount(" ALL ", 5000), 5000);
    assert.throws(() => parseAmount("all", 0), /não possui saldo/);
    assert.throws(() => parseAmount("todos", 5000));
});

test("hdep tudo e hdep all depositam toda a carteira", async () => {
    setMoney(123456);
    await run("hdep tudo");
    assert.deepEqual(money(), { wallet: 0, bank: 123456 });

    setMoney(50000);
    await run("hdep all");
    assert.deepEqual(money(), { wallet: 0, bank: 50000 });

    setMoney(7000);
    await run("hdepositar ALL");
    assert.deepEqual(money(), { wallet: 0, bank: 7000 });
});

test("valor normal continua funcionando", async () => {
    setMoney(100000);
    await run("hdep 300");

    assert.deepEqual(money(), { wallet: 70000, bank: 30000 });
});

test("carteira zerada e palavra desconhecida não depositam", async () => {
    setMoney(0);

    await quiet(async () => {
        assert.match((await run("hdep all")).text, /não possui saldo/i);
        await run("hdep todos");
    });

    assert.deepEqual(money(), { wallet: 0, bank: 0 });
});

test("hsacar all e hsacar tudo sacam todo o banco", async () => {
    setMoney(0, 80000);
    await run("hsacar all");
    assert.deepEqual(money(), { wallet: 80000, bank: 0 });

    setMoney(0, 20000);
    await run("hsacar tudo");
    assert.deepEqual(money(), { wallet: 20000, bank: 0 });
});

test("hlavagem all lava todo o dinheiro sujo (até o limite por operação)", async () => {
    db.exec("DELETE FROM laundering_jobs; DELETE FROM crime_players;");

    set("UPDATE players SET dirty_money = 2500000, energy = 100, energy_updated_at = 0 WHERE guild_id=? AND user_id=?", G, ME.id);

    const r = await run("hlavagem all");

    assert.match(r.title, /Lavagem iniciada/);
    assert.equal(get("SELECT amount a FROM laundering_jobs WHERE user_id=?", ME.id).a, 2500000);
});
