import { db, getPlayer, seq, set, get, blockedTitle } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { attemptRobbery, robberyCap, robberyChance } =
    await import("../services/robbery.mjs");
const { addItem } = await import("../services/inventory.mjs");
const { equipWeapon } = await import("../services/equipment.mjs");
const { status, tx } = await import("../services/combat.mjs");
const { imprison } = await import("../services/prison.mjs");
const { getItem } = await import("../config/items.mjs");
const { ROBBERY_CONFIG } = await import("../config/crime.mjs");

const G = "g-rob";
const THIEF = "thief";
const VICTIM = "victim";
const T0 = 1_800_000_000;

const reais = n => n * 100;

function reset() {
    for (const table of [
        "players", "combat_players", "combat_gear", "inventory",
        "equipped_items", "crime_players", "prison_players", "transactions"
    ]) {
        db.exec(`DELETE FROM ${table}`);
    }

    getPlayer(G, THIEF);
    getPlayer(G, VICTIM);
    status(G, THIEF);
    status(G, VICTIM);

    set("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?", reais(1000), G, VICTIM);
}

function arm(user, itemId, ammo = 10) {
    tx(() => addItem(G, user, itemId, 1));
    equipWeapon(G, user, itemId);
    set("UPDATE combat_gear SET ammo = ? WHERE guild_id = ? AND user_id = ?", ammo, G, user);
}

const wallet = user => get("SELECT wallet FROM players WHERE guild_id=? AND user_id=?", G, user).wallet;
const dirty = user => get("SELECT dirty_money d FROM players WHERE guild_id=? AND user_id=?", G, user).d;
const hp = user => get("SELECT hp FROM combat_players WHERE guild_id=? AND user_id=?", G, user).hp;
const gear = user => ({ ...get("SELECT ammo, durability FROM combat_gear WHERE guild_id=? AND user_id=?", G, user) });
const crime = user => get("SELECT * FROM crime_players WHERE guild_id=? AND user_id=?", G, user);

// Ordem dos sorteios: [sucesso, taxa do roubo, ferimento na fuga]
const WIN = (rate = 0, injury = 0.9) => seq(0.1, rate, injury);

test("a chance vem da arma equipada", () => {
    assert.equal(robberyChance(getItem("revolver")), 25);
    assert.equal(robberyChance(getItem("assault_rifle")), 85);
    assert.equal(robberyChance(getItem("pocket_knife")), 10);
    assert.equal(robberyChance({ id: "arma-desconhecida" }), 10);
});

test("o teto do roubo segue a fórmula", () => {
    assert.equal(robberyCap(reais(1000)), reais(4000));
    assert.equal(robberyCap(reais(16000)), reais(4000));
    // acima de 16.000: 4.000 + 3,3% do excedente
    assert.equal(robberyCap(reais(26000)), reais(4000) + Math.floor(reais(10000) * 0.033));
    // nunca passa do máximo
    assert.equal(robberyCap(reais(100_000_000)), reais(15000));
});

test("sucesso: leva de 10% a 25%, metade limpa e metade suja", async () => {
    reset();
    arm(THIEF, "revolver", 5);

    const result = attemptRobbery(G, THIEF, VICTIM, { now: T0, rng: WIN(0) });

    assert.equal(result.success, true);
    // taxa mínima de 10% de R$1.000 = R$100
    assert.equal(result.amount, reais(100));
    assert.equal(result.clean, reais(50));
    assert.equal(result.dirty, reais(50));

    assert.equal(wallet(VICTIM), reais(900), "a carteira do alvo diminuiu");
    assert.equal(wallet(THIEF), reais(50), "metade limpa na carteira");
    assert.equal(dirty(THIEF), reais(50), "metade como dinheiro sujo");
});

test("a taxa máxima leva 25%", () => {
    reset();
    arm(THIEF, "revolver");

    // seq: sucesso, taxa ~1 (25%), sem ferimento
    const result = attemptRobbery(G, THIEF, VICTIM, { now: T0, rng: seq(0.1, 0.999999, 0.9) });

    assert.ok(result.amount >= reais(249) && result.amount <= reais(250));
});

test("o teto limita carteiras grandes", () => {
    reset();
    arm(THIEF, "revolver");
    set("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?", reais(100_000), G, VICTIM);

    const result = attemptRobbery(G, THIEF, VICTIM, { now: T0, rng: seq(0.1, 0.999999, 0.9) });

    // 25% de R$100.000 = R$25.000, mas o teto é 4.000 + 3,3% de (100.000-16.000)
    assert.equal(result.amount, robberyCap(reais(100_000)));
    assert.ok(result.amount < reais(25_000));
});

test("só o sucesso gasta munição e durabilidade", () => {
    reset();
    arm(THIEF, "revolver", 5);

    attemptRobbery(G, THIEF, VICTIM, { now: T0, rng: WIN() });

    assert.deepEqual(gear(THIEF), { ammo: 4, durability: 99 });

    // falha: nada é gasto
    set("UPDATE crime_players SET last_rob = 0 WHERE guild_id=? AND user_id=?", G, THIEF);
    set("UPDATE players SET energy = 100, energy_updated_at = 0 WHERE guild_id=? AND user_id=?", G, THIEF);

    const failed = attemptRobbery(G, THIEF, VICTIM, { now: T0 + 7200, rng: seq(0.99) });

    assert.equal(failed.success, false);
    assert.deepEqual(gear(THIEF), { ammo: 4, durability: 99 }, "falha não gasta bala");
});

test("arma branca não precisa de munição", () => {
    reset();
    arm(THIEF, "machete", 0);

    const result = attemptRobbery(G, THIEF, VICTIM, { now: T0, rng: seq(0.1, 0, 0.9) });

    assert.equal(result.success, true);
    assert.equal(result.spentAmmo, false);
});

test("falha: nada é levado, mas energia e recarga são gastas", () => {
    reset();
    arm(THIEF, "revolver");

    const result = attemptRobbery(G, THIEF, VICTIM, { now: T0, rng: seq(0.99) });

    assert.equal(result.success, false);
    assert.equal(wallet(VICTIM), reais(1000));
    assert.equal(wallet(THIEF), 0);
    assert.equal(get("SELECT energy FROM players WHERE guild_id=? AND user_id=?", G, THIEF).energy, 50);
    assert.equal(crime(THIEF).last_rob, T0);
});

test("carteira de R$100 ou menos sempre falha, sem sortear", () => {
    reset();
    arm(THIEF, "assault_rifle");
    set("UPDATE players SET wallet = ? WHERE guild_id=? AND user_id=?", reais(100), G, VICTIM);

    // chance 85% e sorteio favorável: ainda assim falha
    const result = attemptRobbery(G, THIEF, VICTIM, { now: T0, rng: seq(0) });

    assert.equal(result.success, false);
    assert.equal(result.poor, true);
    assert.equal(wallet(VICTIM), reais(100));
    assert.equal(get("SELECT energy FROM players WHERE guild_id=? AND user_id=?", G, THIEF).energy, 50, "gasta energia mesmo assim");
});

test("alvo sem registro não é criado nem alterado", () => {
    reset();
    arm(THIEF, "revolver");

    const result = attemptRobbery(G, THIEF, "fantasma", { now: T0, rng: seq(0) });

    assert.equal(result.poor, true);
    assert.equal(get("SELECT COUNT(*) c FROM players WHERE guild_id=? AND user_id=?", G, "fantasma").c, 0);
});

test("revide: alvo armado fere o ladrão quando o roubo falha", () => {
    reset();
    arm(THIEF, "revolver");
    arm(VICTIM, "pistol", 3);

    // falha (0.99); revide (0.1 < 50%); dano 30 + floor(0*21) = 30
    const result = attemptRobbery(G, THIEF, VICTIM, { now: T0, rng: seq(0.99, 0.1, 0) });

    assert.equal(result.retaliated, true);
    assert.equal(result.hpLost, 30);
    assert.equal(hp(THIEF), 70);
    assert.equal(gear(VICTIM).ammo, 3, "o revide não gasta a munição do alvo");
});

test("sem revide quando o alvo não tem munição ou não tem arma", () => {
    reset();
    arm(THIEF, "revolver");
    arm(VICTIM, "pistol", 0);

    const noAmmo = attemptRobbery(G, THIEF, VICTIM, { now: T0, rng: seq(0.99, 0.1, 0) });
    assert.equal(noAmmo.retaliated, false);

    reset();
    arm(THIEF, "revolver");
    const unarmed = attemptRobbery(G, THIEF, VICTIM, { now: T0, rng: seq(0.99, 0.1, 0) });
    assert.equal(unarmed.retaliated, false);
    assert.equal(hp(THIEF), 100);
});

test("ferimento na fuga depois do sucesso", () => {
    reset();
    arm(THIEF, "revolver");

    // sucesso, taxa, ferimento (0.1 < 18%), nível moderado (peso 60: ponto entre 20 e 80)
    const result = attemptRobbery(G, THIEF, VICTIM, { now: T0, rng: seq(0.1, 0, 0.1, 0.5) });

    assert.equal(result.injury, "moderado");
    assert.equal(result.hpLost, 25);
    assert.equal(hp(THIEF), 75);
});

test("regras que impedem a tentativa e NÃO gastam energia", async () => {
    reset();
    const energy = () => get("SELECT energy FROM players WHERE guild_id=? AND user_id=?", G, THIEF).energy;

    assert.equal(await blockedTitle(() => attemptRobbery(G, THIEF, THIEF, { now: T0 })), "Alvo inválido");
    assert.equal(await blockedTitle(() => attemptRobbery(G, THIEF, VICTIM, { now: T0 })), "Sem arma");

    arm(THIEF, "revolver", 0);
    assert.equal(await blockedTitle(() => attemptRobbery(G, THIEF, VICTIM, { now: T0 })), "Sem munição");

    set("UPDATE combat_gear SET ammo = 5, durability = 0 WHERE guild_id=? AND user_id=?", G, THIEF);
    assert.equal(await blockedTitle(() => attemptRobbery(G, THIEF, VICTIM, { now: T0 })), "Arma quebrada");

    set("UPDATE combat_gear SET durability = 100 WHERE guild_id=? AND user_id=?", G, THIEF);
    set("UPDATE combat_players SET hp = 20 WHERE guild_id=? AND user_id=?", G, THIEF);
    assert.equal(await blockedTitle(() => attemptRobbery(G, THIEF, VICTIM, { now: T0 })), "Ferido demais");

    set("UPDATE combat_players SET hp = 100 WHERE guild_id=? AND user_id=?", G, THIEF);
    set("UPDATE players SET energy = 10, energy_updated_at = ? WHERE guild_id=? AND user_id=?", T0, G, THIEF);
    assert.equal(await blockedTitle(() => attemptRobbery(G, THIEF, VICTIM, { now: T0 })), "Energia insuficiente");
    assert.equal(energy(), 10, "recusa não consome energia");

    imprison(G, THIEF, 1800, "teste", T0);
    set("UPDATE players SET energy = 100 WHERE guild_id=? AND user_id=?", G, THIEF);
    assert.equal(await blockedTitle(() => attemptRobbery(G, THIEF, VICTIM, { now: T0 + 10 })), "Você está preso");
});

test("recarga de 1h e ficha criminal", async () => {
    reset();
    arm(THIEF, "revolver");

    attemptRobbery(G, THIEF, VICTIM, { now: T0, rng: WIN() });
    assert.equal(crime(THIEF).criminal_record, 1);

    assert.equal(await blockedTitle(() => attemptRobbery(G, THIEF, VICTIM, { now: T0 + 60 })), "Recarga em andamento");

    set("UPDATE players SET energy = 100, energy_updated_at = 0 WHERE guild_id=? AND user_id=?", G, THIEF);
    attemptRobbery(G, THIEF, VICTIM, { now: T0 + ROBBERY_CONFIG.cooldown, rng: seq(0.99) });
    assert.equal(crime(THIEF).criminal_record, 2, "falha também entra na ficha");
});

test("o roubo entra no histórico financeiro", () => {
    reset();
    arm(THIEF, "revolver");

    attemptRobbery(G, THIEF, VICTIM, { now: T0, rng: WIN() });

    const row = get("SELECT * FROM transactions WHERE type = 'robbery'");

    assert.equal(row.user_id, THIEF);
    assert.equal(row.target_id, VICTIM);
    assert.equal(row.amount, reais(100));
});
