import {
    db, set, get, seq, getPlayer, discordMember, discordGuildFetch
} from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// O botão Reagir do /roubar: a oferta na resposta do roubo, quem pode clicar, o prazo, a chance única
// e o resultado escrito na própria mensagem. As regras do tiro estão em robbery.test.mjs.

const { addItem } = await import("../services/economy/inventory.mjs");
const { equipWeapon } = await import("../services/combat/equipment.mjs");
const { status, tx } = await import("../services/combat/combat.mjs");
const { clearUserLookupCache } = await import("../services/platform/user-lookup.mjs");
const { carregarComandos } = await import("../command-registry.mjs");
const { handlePanelClick } = await import("../services/panels/panels.mjs");
const { ROBBERY_CONFIG } = await import("../config/crime.mjs");

const panel = await import("../services/panels/rob-panel.mjs");

const G = "900000000000000001";
const THIEF = { id: "111111111111111111", username: "eu", displayName: "Eu Mesmo" };
const VICTIM = "200000000000000001";
const OTHER = "300000000000000003";

globalThis.fetch = discordGuildFetch([
    discordMember(THIEF.id, "eu", "Eu Mesmo"),
    discordMember(VICTIM, "maria", "Maria Silva")
]);

const quietly = async fn => {
    const log = console.log;
    console.log = () => {};

    try { return await fn(); } finally { console.log = log; }
};

const comandos = await quietly(() => carregarComandos());

const hp = user => get("SELECT hp FROM combat_players WHERE guild_id=? AND user_id=?", G, user).hp;
const ammo = user => get("SELECT ammo FROM combat_gear WHERE guild_id=? AND user_id=?", G, user).ammo;

function arm(user, itemId, bullets = 5) {
    tx(() => addItem(G, user, itemId, 1));
    equipWeapon(G, user, itemId);
    set("UPDATE combat_gear SET ammo = ? WHERE guild_id=? AND user_id=?", bullets, G, user);
}

function prepare({ victimWeapon = null } = {}) {
    clearUserLookupCache();
    panel.resetReactions();

    for (const table of [
        "players", "combat_players", "combat_gear", "inventory",
        "equipped_items", "crime_players", "prison_players", "transactions"
    ]) {
        db.exec(`DELETE FROM ${table}`);
    }

    getPlayer(G, THIEF.id);
    getPlayer(G, VICTIM);
    status(G, THIEF.id);
    status(G, VICTIM);

    set("UPDATE players SET wallet = 100000 WHERE guild_id=? AND user_id=?", G, VICTIM);

    arm(THIEF.id, "assault_rifle", 10);

    if (victimWeapon) {
        arm(VICTIM, victimWeapon, 5);
    }
}

const rob = () => quietly(() => comandos.get("roubar").execute({
    guildId: G, channelId: "c1", user: THIEF, data: { options: { alvo: "Maria Silva" } }
}));

let sequence = 0;

const click = (token, userId, customId = `rob:rea:${token}`) => ({
    id: "k" + (++sequence), guildId: G, channelId: "c1",
    user: { id: userId, username: "x", displayName: "X" }, data: { customId }
});

const tokenOf = response => response.data.components[0].components[0].customId.split(":")[2];

const titleOf = response => response.data.embeds[0].title;

// ==========================================
// A OFERTA NA RESPOSTA DO ROUBO
// ==========================================

test("alvo armado: a resposta do /roubar traz a menção e o botão Reagir (dando certo ou errado)", async () => {
    prepare({ victimWeapon: "pistol" });

    const response = await rob();

    assert.match(response.data.embeds[0].title, /Roubo bem-sucedido|O roubo deu errado/);

    assert.match(response.data.body, new RegExp(`<@${VICTIM}>`));
    assert.match(response.data.body, /30 segundos/);

    const [row] = response.data.components;
    const [reagir] = row.components;

    assert.equal(reagir.label, "Reagir");
    assert.equal(reagir.style, "danger");
    assert.match(reagir.customId, /^rob:rea:[a-f0-9]{12}$/);
    assert.ok(reagir.customId.length < 100);

    assert.equal(panel.pendingReactions(), 1);
});

test("alvo sem arma, ou com arma de fogo sem bala: nenhuma oferta, nenhuma menção", async () => {
    prepare();

    const unarmed = await rob();

    assert.equal(unarmed.data.components, undefined);
    assert.ok(!unarmed.data.body);
    assert.equal(panel.pendingReactions(), 0);

    prepare({ victimWeapon: "pistol" });
    set("UPDATE combat_gear SET ammo = 0 WHERE guild_id=? AND user_id=?", G, VICTIM);

    const empty = await rob();

    assert.equal(empty.data.components, undefined);
    assert.equal(panel.pendingReactions(), 0);
});

// ==========================================
// O CLIQUE
// ==========================================

test("só o alvo reage: outra pessoa recebe um aviso privado e o botão segue valendo", async () => {
    prepare({ victimWeapon: "pistol" });

    const token = tokenOf(await rob());

    const intruder = handlePanelClick(click(token, OTHER));

    assert.equal(intruder.data.ephemeral, true);
    assert.equal(titleOf(intruder), "⚠️ Não é com você");
    assert.equal(panel.pendingReactions(), 1, "a chance do alvo continua guardada");

    const thiefClick = handlePanelClick(click(token, THIEF.id));

    assert.equal(thiefClick.data.ephemeral, true, "nem o ladrão reage por ele");
    assert.equal(ammo(VICTIM), 5);
});

test("o alvo acerta: a mensagem do roubo ganha o resultado, o botão some e o ladrão se fere", async () => {
    prepare({ victimWeapon: "pistol" });

    const original = await rob();
    const token = tokenOf(original);
    const before = hp(THIEF.id);

    // pistola 40%: o sorteio 0.1 acerta
    const response = panel.handleRobClick(click(token, VICTIM), { rng: seq(0.1) });

    assert.equal(response.type, "update", "edita a mensagem do roubo, em vez de abrir outra");
    assert.deepEqual(response.data.components, [], "o botão some");

    const [embed] = response.data.embeds;

    assert.ok(embed.description.startsWith(original.data.embeds[0].description), "o resultado do roubo continua lá");
    assert.match(embed.description, /Maria Silva\*\* reagiu e \*\*acertou\*\* o tiro em \*\*Eu Mesmo\*\*/);
    assert.match(embed.description, /Ferimento grave: -45 HP/);
    assert.match(embed.description, /`\/curar`/);

    assert.equal(hp(THIEF.id), before - 45);
    assert.equal(ammo(VICTIM), 4, "gastou 1 bala");
    assert.equal(panel.pendingReactions(), 0);
});

test("o alvo erra: o resultado diz que errou e a bala foi gasta; uma chance por roubo", async () => {
    prepare({ victimWeapon: "pistol" });

    const token = tokenOf(await rob());

    const before = hp(THIEF.id);

    const response = panel.handleRobClick(click(token, VICTIM), { rng: seq(0.99) });

    assert.match(response.data.embeds[0].description, /reagiu, mas \*\*errou\*\* o tiro \(40% de chance com /);
    assert.match(response.data.embeds[0].description, /\(-1 bala\)/);
    assert.equal(hp(THIEF.id), before);
    assert.equal(ammo(VICTIM), 4);

    // segundo clique no mesmo botão (o Discord ainda mostrava): a chance já foi usada
    const again = handlePanelClick(click(token, VICTIM));

    assert.equal(again.data.ephemeral, true);
    assert.equal(titleOf(again), "⚠️ Tempo esgotado");
    assert.equal(ammo(VICTIM), 4, "sem segundo tiro");
});

test("passados os 30 segundos o botão não funciona mais", async () => {
    prepare({ victimWeapon: "pistol" });

    const token = tokenOf(await rob());

    const late = panel.handleRobClick(click(token, VICTIM), { now: Date.now() + (ROBBERY_CONFIG.reaction.windowSeconds + 1) * 1000 });

    assert.equal(late.data.ephemeral, true);
    assert.equal(titleOf(late), "⚠️ Tempo esgotado");
    assert.match(late.data.embeds[0].description, /30 segundos/);
    assert.equal(ammo(VICTIM), 5, "nada foi gasto");
    assert.equal(panel.pendingReactions(), 0, "a oferta vencida é descartada");
});

test("se o alvo perdeu a arma ou a bala nesse meio tempo, o clique é recusado sem gastar a chance", async () => {
    prepare({ victimWeapon: "pistol" });

    const token = tokenOf(await rob());

    set("UPDATE combat_gear SET ammo = 0 WHERE guild_id=? AND user_id=?", G, VICTIM);

    const blocked = panel.handleRobClick(click(token, VICTIM));

    assert.equal(blocked.data.ephemeral, true);
    assert.equal(titleOf(blocked), "⚠️ Sem munição");
    assert.equal(panel.pendingReactions(), 1, "recusado, a oferta continua");
});

test("ladrão já ferido demais não leva o tiro: a mensagem diz que a bala foi poupada", async () => {
    prepare({ victimWeapon: "pistol" });

    const token = tokenOf(await rob());

    set("UPDATE combat_players SET hp = ? WHERE guild_id=? AND user_id=?", ROBBERY_CONFIG.minHp - 5, G, THIEF.id);

    const response = panel.handleRobClick(click(token, VICTIM), { rng: seq(0) });

    assert.match(response.data.embeds[0].description, /vida baixa demais para roubar/);
    assert.equal(ammo(VICTIM), 5);
});

// ==========================================
// AS OFERTAS NA MEMÓRIA
// ==========================================

test("ofertas vencidas somem quando entra uma nova, e o teto de ofertas não deixa a memória crescer", () => {
    panel.resetReactions();

    const base = { guildId: G, thiefId: THIEF.id, victimId: VICTIM, thiefName: "A", victimName: "B", embeds: [{ description: "x" }] };

    panel.offerReaction({ ...base, now: 1_000 });
    panel.offerReaction({ ...base, now: 1_000 });

    assert.equal(panel.pendingReactions(), 2);

    panel.offerReaction({ ...base, now: 1_000 + 31_000 });

    assert.equal(panel.pendingReactions(), 1, "as duas de 31 s atrás venceram");

    panel.resetReactions();

    for (let i = 0; i < 2_100; i++) {
        panel.offerReaction({ ...base, now: 1_000 + i });
    }

    assert.ok(panel.pendingReactions() <= 2_001, `guardou ${panel.pendingReactions()}`);
});

test("botão de outra ação não é tratado como reação", () => {
    const response = panel.handleRobClick(click("x", VICTIM, "rob:inventada:x"));

    assert.equal(response.data.ephemeral, true);
    assert.equal(titleOf(response), "⚠️ Botão desconhecido");
});
