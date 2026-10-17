import { db, getPlayer, set, get, blockedTitle } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const {
    startLaundering, settleDue, unlockPrivate, getLaunderingStatus,
    startLaunderingSweeper, stopLaunderingSweeper
} = await import("../services/crime/laundering.mjs");
const { imprison } = await import("../services/crime/prison.mjs");

const G = "g-laundry";
const A = "ana";
const B = "bia";
const T0 = 1_800_000_000;
const reais = n => n * 100;

function reset() {
    for (const table of ["players", "crime_players", "prison_players", "laundering_jobs", "transactions"]) {
        db.exec(`DELETE FROM ${table}`);
    }

    db.exec("DELETE FROM global_users");

    for (const user of [A, B]) {
        getPlayer(G, user);
        set("UPDATE players SET dirty_money = ?, energy = 100, energy_updated_at = 0 WHERE guild_id=? AND user_id=?", reais(30000), G, user);
    }
}

const wallet = u => get("SELECT wallet w FROM players WHERE guild_id=? AND user_id=?", G, u).w;
const job = u => get("SELECT * FROM laundering_jobs WHERE user_id=? AND settled_at IS NULL", u);

test("valor fora dos limites é recusado", async () => {
    reset();

    assert.equal(await blockedTitle(() => startLaundering(G, A, { amount: reais(500), kind: "public", now: T0 })), "Valor fora do limite");
    assert.equal(await blockedTitle(() => startLaundering(G, A, { amount: reais(40000), kind: "public", now: T0 })), "Valor fora do limite");
});

test("pública: lotes de 1 min, retorno mínimo de 35%, credita ao fim", () => {
    reset();

    const r = startLaundering(G, A, { amount: reais(5000), kind: "public", channelId: "c1", now: T0, rng: () => 0 });

    assert.equal(r.duration, 7 * 60, "R$5.000 a R$750/min = 7 lotes");
    assert.equal(job(A).payout, reais(1750), "35% de R$5.000");
    assert.equal(get("SELECT dirty_money d FROM players WHERE user_id=?", A).d, reais(25000), "o sujo sai na hora");
    assert.equal(get("SELECT energy e FROM players WHERE user_id=?", A).e, 60);

    assert.equal(settleDue(T0 + 100).length, 0, "antes do fim nada entra");
    assert.equal(wallet(A), 0);

    const done = settleDue(T0 + 420);

    assert.equal(done.length, 1);
    assert.equal(wallet(A), reais(1750));
    assert.equal(settleDue(T0 + 9999).length, 0, "não credita duas vezes");
});

test("uma lavagem por jogador e uma pública por servidor", async () => {
    reset();

    startLaundering(G, A, { amount: reais(2000), kind: "public", now: T0, rng: () => 0 });

    assert.equal(await blockedTitle(() => startLaundering(G, A, { amount: reais(1000), kind: "public", now: T0 + 5 })), "Lavagem em andamento");
    assert.equal(await blockedTitle(() => startLaundering(G, B, { amount: reais(1000), kind: "public", now: T0 + 5 })), "Lavanderia pública ocupada");

    assert.ok(getLaunderingStatus(G, B, T0 + 5).publicBusyRemaining > 0);
});

test("recarga de 24h na pública é compartilhada com a privada", async () => {
    reset();

    startLaundering(G, A, { amount: reais(1000), kind: "public", now: T0, rng: () => 0 });
    settleDue(T0 + 9999);

    assert.equal(await blockedTitle(() => startLaundering(G, A, { amount: reais(1000), kind: "public", now: T0 + 500 })), "Lavanderia em recarga");
});

test("privada exige gemas, uma vez só", async () => {
    reset();

    assert.equal(await blockedTitle(() => startLaundering(G, A, { amount: reais(1000), kind: "private", now: T0 })), "Lavanderia privada bloqueada");
    assert.equal(await blockedTitle(() => unlockPrivate(G, A)), "Gemas insuficientes");

    set("UPDATE global_users SET gems = 10 WHERE user_id = ?", A);

    unlockPrivate(G, A);

    assert.equal(get("SELECT gems g FROM global_users WHERE user_id=?", A).g, 0);
    assert.equal(await blockedTitle(() => unlockPrivate(G, A)), "Já liberada");

    startLaundering(G, A, { amount: reais(1200), kind: "private", now: T0, rng: () => 0.999 });

    assert.ok(job(A).payout >= reais(1200) * 0.84, "privada rende cerca de 85%");
});

test("a prisão pausa a lavagem; as penas acompanham", () => {
    reset();

    startLaundering(G, A, { amount: reais(1000), kind: "public", now: T0, rng: () => 0 });

    const before = job(A).finish_at;

    imprison(G, A, 1800, "teste", T0 + 10);

    assert.equal(job(A).finish_at, before + 1800);
    assert.equal(settleDue(before).length, 0, "durante a pena não conclui");
    assert.equal(settleDue(before + 1800).length, 1);
});

test("preso não inicia lavagem", async () => {
    reset();

    imprison(G, A, 1800, "teste", T0);

    assert.equal(await blockedTitle(() => startLaundering(G, A, { amount: reais(1000), kind: "public", now: T0 + 5 })), "Você está preso");
});

test("o sweeper credita o que venceu e avisa o canal", async () => {
    reset();

    set(`INSERT INTO laundering_jobs
         (guild_id, user_id, channel_id, kind, amount, payout, started_at, finish_at)
         VALUES (?, ?, 'c9', 'private', 100000, 80000, 1, 2)`, G, B);

    const notices = [];

    startLaunderingSweeper(async notice => { notices.push(notice); }, 60_000);

    await new Promise(resolve => setTimeout(resolve, 100));

    stopLaunderingSweeper();

    assert.equal(notices.length, 1);
    assert.equal(notices[0].channelId, "c9");
    assert.match(notices[0].body, new RegExp(`<@${B}>`));
    assert.match(notices[0].body, /800,00/);
    assert.equal(wallet(B), 80000);
});
