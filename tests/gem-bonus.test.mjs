import { db, set, get } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { claimGemBonus, getGemBonusStatus } = await import("../services/gem-bonus.mjs");
const { GEM_BONUS } = await import("../config/gems.mjs");

const U = "111111111111111111";
const T = 1_800_000_000;

function reset() {
    db.exec("DELETE FROM global_users");
}

const row = () => get("SELECT gems, last_gem_claim FROM global_users WHERE user_id=?", U);

test("as gemas de cada coleta ficam entre o mínimo e o máximo, nas pontas também", () => {
    assert.deepEqual([GEM_BONUS.min, GEM_BONUS.max, GEM_BONUS.cooldown], [1, 3, 5 * 3600]);

    const got = [0, 0.3, 0.34, 0.5, 0.67, 0.999999].map(value => {
        reset();

        return claimGemBonus(U, { now: T, random: () => value }).amount;
    });

    assert.deepEqual(got, [1, 1, 2, 2, 3, 3]);
});

test("a coleta soma na conta e abre a recarga de 5 horas", () => {
    reset();

    const first = claimGemBonus(U, { now: T, random: () => 0.5 });

    assert.deepEqual({ ...first }, { status: "claimed", amount: 2, gems: 2, remaining: GEM_BONUS.cooldown });
    assert.deepEqual({ ...row() }, { gems: 2, last_gem_claim: T });
});

test("antes de 5 horas só mostra o que falta, sem pagar", () => {
    reset();

    claimGemBonus(U, { now: T, random: () => 0 });

    const again = claimGemBonus(U, { now: T + 3600, random: () => 0.99 });

    assert.deepEqual({ ...again }, { status: "cooldown", gems: 1, remaining: GEM_BONUS.cooldown - 3600 });
    assert.equal(row().gems, 1);
    assert.equal(row().last_gem_claim, T, "a recarga não é empurrada para frente");
});

test("exatamente 5 horas depois já libera", () => {
    reset();

    claimGemBonus(U, { now: T, random: () => 0 });

    assert.equal(claimGemBonus(U, { now: T + GEM_BONUS.cooldown - 1, random: () => 0 }).status, "cooldown");
    assert.equal(claimGemBonus(U, { now: T + GEM_BONUS.cooldown, random: () => 0.99 }).status, "claimed");
    assert.equal(row().gems, 1 + 3);
});

test("duas coletas na mesma hora: só uma paga", () => {
    reset();

    const results = [
        claimGemBonus(U, { now: T, random: () => 0.99 }),
        claimGemBonus(U, { now: T, random: () => 0.99 })
    ];

    assert.deepEqual(results.map(r => r.status), ["claimed", "cooldown"]);
    assert.equal(row().gems, 3);
});

test("as gemas já existentes (dadas pelo admin) são preservadas", () => {
    reset();
    set("INSERT INTO global_users (user_id, gems) VALUES (?, 40)", U);

    const result = claimGemBonus(U, { now: T, random: () => 0 });

    assert.equal(result.gems, 41);
    assert.equal(row().gems, 41);
});

test("a situação só lê: não cria registro de quem nunca coletou", () => {
    reset();

    assert.deepEqual({ ...getGemBonusStatus(U, T) }, { gems: 0, available: true, remaining: 0 });
    assert.equal(get("SELECT COUNT(*) c FROM global_users").c, 0);

    claimGemBonus(U, { now: T, random: () => 0 });

    const wait = getGemBonusStatus(U, T + 100);

    assert.deepEqual({ ...wait }, { gems: 1, available: false, remaining: GEM_BONUS.cooldown - 100 });
});

test("a recarga é da conta: vale para qualquer servidor", () => {
    reset();

    // não existe servidor na chamada: é global por construção
    claimGemBonus(U, { now: T, random: () => 0 });

    assert.equal(claimGemBonus(U, { now: T + 10, random: () => 0 }).status, "cooldown");
    assert.equal(claimGemBonus("222222222222222222", { now: T + 10, random: () => 0 }).status, "claimed", "outra pessoa não é afetada");
});
