import { db, getPlayer, set, get } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// Duelo, hospital e arsenal. Estes testes fixam o que o código faz hoje (a
// wiki descreve estas regras e usa os valores de DUEL_RULES, HOSPITAL_RULES e
// ARMORY_RULES): se uma regra mudar de propósito, mude o teste junto.

const combat = await import("../services/combat/combat.mjs");
const { heal } = await import("../services/combat/hospital.mjs");
const { buyAmmo, buyVest, repair, reload } = await import("../services/combat/armory.mjs");
const { addItem } = await import("../services/economy/inventory.mjs");
const { equipWeapon } = await import("../services/combat/equipment.mjs");

const { challenge, accept, refuse, status, history, tx } = combat;

const A = "111111111111111111";
const B = "222222222222222222";

let counter = 0;

const guild = () => `g-combat-${++counter}`;

function player(g, user, { money = 0, weapon = null } = {}) {
    getPlayer(g, user);

    set("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?", money, g, user);

    combat.ensure(g, user);

    if (weapon) {
        tx(() => addItem(g, user, weapon, 1));
        equipWeapon(g, user, weapon);
    }
}

const gear = (g, user, fields) =>
    set(
        `UPDATE combat_gear SET ${Object.keys(fields).map(key => `${key} = ?`).join(", ")} WHERE guild_id = ? AND user_id = ?`,
        ...Object.values(fields), g, user
    );

const hp = (g, user, value, extra = {}) =>
    set(
        `UPDATE combat_players SET hp = ?${Object.keys(extra).map(key => `, ${key} = ?`).join("")} WHERE guild_id = ? AND user_id = ?`,
        value, ...Object.values(extra), g, user
    );

const wallet = (g, user) =>
    get("SELECT wallet w FROM players WHERE guild_id = ? AND user_id = ?", g, user).w;

const xp = (g, user) =>
    get("SELECT xp x FROM players WHERE guild_id = ? AND user_id = ?", g, user).x;

const duel = g => {
    challenge(g, A, B);

    return accept(g, B);
};

// ==========================================
// DUELO: DANO E RESULTADO
// ==========================================

test("sem arma cada um causa 5 de dano e empatar não dá vencedor nem XP", () => {
    const g = guild();

    player(g, A);
    player(g, B);

    const result = duel(g);

    assert.deepEqual(
        [result.senderDamage, result.targetDamage, result.senderHp, result.targetHp],
        [5, 5, 95, 95]
    );

    assert.equal(result.winner, null);
    assert.equal(xp(g, A) + xp(g, B), 0);
    assert.deepEqual(history(g, A), []);
});

test("vence quem termina com mais vida, ganha 30 de XP, e o duelo entra no histórico", () => {
    const g = guild();

    player(g, A, { weapon: "pocket_knife" });   // dano 8
    player(g, B);

    const result = duel(g);

    assert.deepEqual([result.senderDamage, result.targetDamage], [8, 5]);
    assert.deepEqual([result.senderHp, result.targetHp], [95, 92]);
    assert.equal(result.winner, A);
    assert.equal(result.loser, B);

    assert.equal(xp(g, A), 30);
    assert.equal(xp(g, B), 0);

    assert.deepEqual(
        [status(g, A).wins, status(g, A).losses, status(g, B).wins, status(g, B).losses],
        [1, 0, 0, 1]
    );

    const [row] = history(g, B);

    assert.deepEqual([row.winner_id, row.loser_id, row.damage], [A, B, 8]);
});

test("a arma gasta 1 de durabilidade por duelo, e arma sem dano definido bate 10", () => {
    const g = guild();

    player(g, A, { weapon: "wooden_sword" });
    player(g, B);

    const result = duel(g);

    assert.equal(result.senderDamage, 10);
    assert.equal(status(g, A).durability, 99);
    assert.equal(status(g, B).durability, 100, "quem não tem arma não gasta");
});

test("arma de fogo gasta 1 munição por duelo e, sem munição, o duelo nem começa", () => {
    const g = guild();

    player(g, A, { weapon: "revolver" });   // dano 20
    player(g, B);

    challenge(g, A, B);

    assert.throws(() => accept(g, B), /sem munição/);
    assert.equal(status(g, A).durability, 100, "nada foi gasto");
    assert.equal(status(g, A).hp, 100);

    // a falha desfaz tudo, inclusive o fim do desafio: ele continua pendente
    assert.equal(get("SELECT COUNT(*) c FROM combat_challenges WHERE guild_id = ?", g).c, 1);

    gear(g, A, { ammo: 3 });

    const result = accept(g, B);

    assert.equal(result.senderDamage, 20);
    assert.equal(status(g, A).ammo, 2);
});

test("arma sem durabilidade não luta", () => {
    const g = guild();

    player(g, A, { weapon: "pocket_knife" });
    player(g, B);

    gear(g, A, { durability: 0 });

    challenge(g, A, B);

    assert.throws(() => accept(g, B), /sem durabilidade/);
});

// O colete protege quem o veste: tira pontos do golpe que essa pessoa recebe. (Antes de
// 2026-10-13 o código descontava o colete do próprio atacante, enfraquecendo o golpe de
// quem o comprava; o teste logo abaixo garante que isso não volta.)
test("o colete de quem apanha tira dano do golpe, até 15 pontos, e o dano nunca fica abaixo de 1", () => {
    const g = guild();

    player(g, A, { weapon: "revolver" });   // dano 20
    player(g, B);

    gear(g, A, { ammo: 5 });
    gear(g, B, { vest: 10 });

    assert.equal(duel(g).senderDamage, 10, "20 menos o colete de 10 de quem apanha");

    set("UPDATE combat_players SET last_duel = 0, hp = 100 WHERE guild_id = ?", g);
    gear(g, B, { vest: 100 });

    assert.equal(duel(g).senderDamage, 5, "colete 100 só tira 15");

    // o golpe de quem não tem arma (5) contra um colete de 10 nunca zera: o mínimo é 1
    set("UPDATE combat_players SET last_duel = 0, hp = 100 WHERE guild_id = ?", g);
    gear(g, A, { vest: 10 });

    assert.equal(duel(g).targetDamage, 1, "5 menos o colete de 10 de A, no mínimo 1");
});

test("o colete de quem ataca não enfraquece o próprio golpe, e protege só de quem o enfrenta", () => {
    const g = guild();

    player(g, A, { weapon: "revolver" });   // dano 20
    player(g, B, { weapon: "pocket_knife" });   // dano 8

    gear(g, A, { ammo: 3, vest: 10 });

    const result = duel(g);

    assert.equal(result.senderDamage, 20, "A tem colete, mas o golpe de A continua valendo 20");
    assert.equal(result.targetDamage, 1, "o golpe de B (8) contra o colete de 10 de A cai para o mínimo");

    assert.deepEqual([result.senderHp, result.targetHp], [99, 80], "o colete protegeu A, não B");
    assert.equal(result.winner, A);
});

// ==========================================
// DUELO: QUEM PODE E QUANDO
// ==========================================

test("precisa de pelo menos 20 de vida, nos dois lados", () => {
    const g = guild();

    player(g, A);
    player(g, B);

    hp(g, A, 19);
    assert.throws(() => challenge(g, A, B), /pelo menos 20 HP/);

    hp(g, A, 20);
    hp(g, B, 19);
    assert.throws(() => challenge(g, A, B), /pelo menos 20 HP/);

    hp(g, B, 20);
    assert.equal(challenge(g, A, B), true);
});

test("espera de 5 minutos entre duelos", () => {
    const g = guild();

    player(g, A);
    player(g, B);

    duel(g);

    assert.throws(() => challenge(g, A, B), /cooldown de 5 minutos/);

    const lastDuel = get("SELECT last_duel d FROM combat_players WHERE guild_id = ? AND user_id = ?", g, A).d;

    set("UPDATE combat_players SET last_duel = ? WHERE guild_id = ?", lastDuel - 299, g);
    assert.throws(() => challenge(g, A, B), /cooldown/, "299 segundos atrás ainda vale");

    set("UPDATE combat_players SET last_duel = ? WHERE guild_id = ?", lastDuel - 300, g);
    assert.equal(challenge(g, A, B), true, "300 segundos libera");
});

test("quem está protegido pelo hospital não duela", () => {
    const g = guild();

    player(g, A);
    player(g, B);

    set("UPDATE combat_players SET protected_until = ? WHERE guild_id = ? AND user_id = ?", combat.now() + 100, g, B);

    assert.throws(() => challenge(g, A, B), /protegido pelo hospital/);
});

test("o desafio vale 10 minutos, e só um por vez para cada jogador", () => {
    const g = guild();

    player(g, A);
    player(g, B);

    assert.throws(() => challenge(g, A, A), /Escolha outro jogador/);

    challenge(g, A, B);

    assert.throws(() => challenge(g, B, A), /desafio pendente/, "já existe um envolvendo os dois");

    set("UPDATE combat_challenges SET created_at = ? WHERE guild_id = ?", combat.now() - 601, g);

    assert.throws(() => accept(g, B), /expirou/);

    // aceitar um desafio vencido falha e desfaz tudo, então ele ainda está lá; quem o
    // varre é o próximo desafio criado no servidor
    assert.equal(get("SELECT COUNT(*) c FROM combat_challenges WHERE guild_id = ?", g).c, 1);

    assert.equal(challenge(g, B, A), true, "o vencido não bloqueia mais ninguém");
    assert.equal(get("SELECT COUNT(*) c FROM combat_challenges WHERE guild_id = ?", g).c, 1, "só o novo ficou");
});

test("recusar apaga o desafio", () => {
    const g = guild();

    player(g, A);
    player(g, B);

    challenge(g, A, B);

    assert.equal(refuse(g, B), true);
    assert.equal(refuse(g, B), false, "não havia mais nada para recusar");
    assert.throws(() => accept(g, B), /não tem desafio pendente/);
});

// ==========================================
// HOSPITAL
// ==========================================

test("curar custa R$ 1,00 por ponto de vida que falta, enche a vida e dá 10 minutos de proteção", () => {
    const g = guild();

    player(g, A, { money: 10_000 });

    hp(g, A, 40);

    const before = combat.now();

    assert.equal(heal(g, A), 6000);
    assert.equal(wallet(g, A), 4000);

    const after = status(g, A);

    assert.equal(after.hp, 100);
    assert.ok(after.protected_until >= before + 600 && after.protected_until <= combat.now() + 600);
});

test("curar não funciona com a vida cheia nem sem dinheiro", () => {
    const g = guild();

    player(g, A, { money: 10_000 });

    assert.throws(() => heal(g, A), /vida já está cheia/);

    hp(g, A, 50);
    set("UPDATE players SET wallet = 4999 WHERE guild_id = ? AND user_id = ?", g, A);

    assert.throws(() => heal(g, A), /Carteira insuficiente/);
    assert.equal(status(g, A).hp, 50);
    assert.equal(wallet(g, A), 4999);
});

// ==========================================
// ARSENAL
// ==========================================

test("munição custa R$ 1,00 cada, de 1 a 100 por compra", () => {
    const g = guild();

    player(g, A, { money: 50_000 });

    assert.equal(buyAmmo(g, A, 10), 1000);
    assert.equal(status(g, A).ammo, 10);
    assert.equal(wallet(g, A), 49_000);

    for (const bad of [0, 101, 1.5, "abc"]) {
        assert.throws(() => buyAmmo(g, A, bad), /entre 1 e 100/, String(bad));
    }

    assert.equal(buyAmmo(g, A, 100), 10_000, "100 é o máximo por compra");

    set("UPDATE players SET wallet = 50 WHERE guild_id = ? AND user_id = ?", g, A);

    assert.throws(() => buyAmmo(g, A, 1), /Carteira insuficiente/);
});

test("o colete custa R$ 100,00 e dá 10 pontos de defesa", () => {
    const g = guild();

    player(g, A, { money: 20_000 });

    assert.equal(buyVest(g, A), 10_000);
    assert.equal(status(g, A).vest, 10);
    assert.equal(wallet(g, A), 10_000);

    set("UPDATE players SET wallet = 9999 WHERE guild_id = ? AND user_id = ?", g, A);

    assert.throws(() => buyVest(g, A), /Carteira insuficiente/);
});

test("reparar custa R$ 50,00, devolve a durabilidade a 100 e pede arma equipada", () => {
    const g = guild();

    player(g, A, { money: 20_000 });

    assert.throws(() => repair(g, A), /Equipe uma arma primeiro/);

    tx(() => addItem(g, A, "pocket_knife", 1));
    equipWeapon(g, A, "pocket_knife");
    gear(g, A, { durability: 12 });

    assert.equal(repair(g, A), 5000);
    assert.equal(status(g, A).durability, 100);
    assert.equal(wallet(g, A), 15_000);
});

test("recarregar só confere a munição da arma de fogo equipada", () => {
    const g = guild();

    player(g, A, { money: 0 });

    assert.throws(() => reload(g, A), /Equipe uma arma de fogo/);

    tx(() => addItem(g, A, "pocket_knife", 1));
    equipWeapon(g, A, "pocket_knife");

    assert.throws(() => reload(g, A), /Equipe uma arma de fogo/, "arma branca não usa munição");

    tx(() => addItem(g, A, "pistol", 1));
    equipWeapon(g, A, "pistol");
    gear(g, A, { ammo: 7 });

    assert.equal(reload(g, A), 7);
});
