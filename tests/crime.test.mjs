import { db, getPlayer, seq, set, get, blockedTitle } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { attemptCrime } = await import("../services/crime/crime.mjs");
const { getPrison, imprison, prisonBlock } = await import("../services/crime/prison.mjs");
const { rewardScale, CRIME_CONFIG } = await import("../config/crime.mjs");

const G = "g-crime";
const U = "u-crime";
const T0 = 1_800_000_000;

function reset() {
    for (const table of ["players", "combat_players", "combat_gear", "crime_players", "prison_players", "transactions"]) {
        db.exec(`DELETE FROM ${table}`);
    }

    getPlayer(G, U);
}

const row = () => get("SELECT * FROM players WHERE guild_id=? AND user_id=?", G, U);
const hp = () => get("SELECT hp FROM combat_players WHERE guild_id=? AND user_id=?", G, U).hp;

// Ordem dos sorteios no sucesso: [sucesso?, jackpot?, história, xp, valor]
// Na falha: [sucesso?, história, multa, (ferimento)]

test("sucesso rende dinheiro sujo e XP e gasta energia", () => {
    reset();

    const r = attemptCrime(G, U, { now: T0, rng: seq(0.1, 0.9, 0, 0, 0) });

    assert.equal(r.success, true);
    assert.equal(r.jackpot, false);
    assert.equal(r.amount, 40000, "mínimo da primeira história no nível 1 = R$400");
    assert.equal(row().dirty_money, 40000);
    assert.equal(row().xp, 30);
    assert.equal(row().energy, 100 - CRIME_CONFIG.energyCost);
});

test("jackpot rende pelo menos R$4.000", () => {
    reset();

    const r = attemptCrime(G, U, { now: T0, rng: seq(0.1, 0.01, 0, 0, 0) });

    assert.equal(r.jackpot, true);
    assert.ok(r.amount >= 400000);
});

test("recarga de 1h vale com sucesso ou falha", async () => {
    reset();

    attemptCrime(G, U, { now: T0, rng: seq(0.1, 0.9, 0, 0, 0) });

    assert.equal(
        await blockedTitle(() => attemptCrime(G, U, { now: T0 + 60 })),
        "Recarga em andamento"
    );
});

test("falha: multa, prisão de 30 min, e a multa sai da carteira", () => {
    reset();
    set("UPDATE players SET wallet = 100000 WHERE guild_id=? AND user_id=?", G, U);

    const r = attemptCrime(G, U, { now: T0, rng: seq(0.9, 0, 0) });

    const expected = Math.round(8000 * rewardScale(1) / 100) * 100;

    assert.equal(r.success, false);
    assert.equal(r.fine, expected);
    assert.equal(row().wallet, 100000 - expected);
    assert.equal(r.hpLost, 0, "a primeira história não fere");
    assert.equal(getPrison(G, U, T0).remaining, 1800);
});

test("a multa nunca passa do que há na carteira", () => {
    reset();
    set("UPDATE players SET wallet = 3000 WHERE guild_id=? AND user_id=?", G, U);

    const r = attemptCrime(G, U, { now: T0, rng: seq(0.9, 0, 0) });

    assert.equal(r.fine, 3000);
    assert.equal(row().wallet, 0, "a carteira não fica negativa");
});

test("história com ferimento tira HP", () => {
    reset();

    // história 7 (a última) termina em ferimento; ferimento mínimo = 15
    const r = attemptCrime(G, U, { now: T0, rng: seq(0.9, 0.99, 0, 0) });

    assert.equal(r.hpLost, 15);
    assert.equal(hp(), 85);
});

test("preso, ferido demais ou sem energia: recusa sem gastar nada", async () => {
    reset();

    set("UPDATE combat_players SET hp = 100 WHERE guild_id=? AND user_id=?", G, U);
    attemptCrime(G, U, { now: T0, rng: seq(0.9, 0, 0) });   // fica preso

    assert.equal(await blockedTitle(() => attemptCrime(G, U, { now: T0 + 5 })), "Você está preso");

    db.exec("DELETE FROM prison_players");
    set("UPDATE crime_players SET last_crime = 0 WHERE guild_id=? AND user_id=?", G, U);

    set("UPDATE combat_players SET hp = 20 WHERE guild_id=? AND user_id=?", G, U);
    assert.equal(await blockedTitle(() => attemptCrime(G, U, { now: T0 + 7200 })), "Ferido demais");

    set("UPDATE combat_players SET hp = 100 WHERE guild_id=? AND user_id=?", G, U);
    set("UPDATE players SET energy = 10, energy_updated_at = ? WHERE guild_id=? AND user_id=?", T0 + 7200, G, U);
    assert.equal(await blockedTitle(() => attemptCrime(G, U, { now: T0 + 7200 })), "Energia insuficiente");
    assert.equal(row().energy, 10, "recusar não consome energia");
});

test("os contadores e a ficha criminal batem", () => {
    reset();

    attemptCrime(G, U, { now: T0, rng: seq(0.1, 0.9, 0, 0, 0) });
    attemptCrime(G, U, { now: T0 + 7200, rng: seq(0.9, 0, 0) });

    const crime = get("SELECT * FROM crime_players WHERE guild_id=? AND user_id=?", G, U);

    assert.equal(crime.crimes, 2);
    assert.equal(crime.successes, 1);
    assert.equal(crime.failures, 1);
    assert.equal(crime.criminal_record, 2);
});

test("prisonBlock bloqueia só os comandos da lista", () => {
    reset();
    imprison(G, U, 1800, "teste", Math.floor(Date.now() / 1000));

    assert.ok(prisonBlock("trabalhar", G, U));
    assert.ok(prisonBlock("roubar", G, U));
    assert.equal(prisonBlock("saldo", G, U), null, "consulta continua liberada");
    assert.equal(prisonBlock("trabalhar", G, "outra-pessoa"), null);
});

test("penas se somam", () => {
    reset();

    imprison(G, U, 1800, "a", T0);

    const second = imprison(G, U, 1800, "b", T0 + 100);

    assert.equal(second.sentence, 3600);
    assert.equal(second.remaining, 3500);
});
