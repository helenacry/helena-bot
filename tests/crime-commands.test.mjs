import {
    db, set, get, seq, createPrefixRunner, fieldsOf
} from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { imprison } = await import("../services/prison.mjs");
const { addItem } = await import("../services/inventory.mjs");
const { equipWeapon } = await import("../services/equipment.mjs");
const { status, tx } = await import("../services/combat.mjs");
const { clearUserLookupCache } = await import("../services/user-lookup.mjs");
const { savePlayerName } = await import("../services/player-names.mjs");
const { ensureCrimePlayer } = await import("../services/crime-player.mjs");
const { getPlayer } = await import("./helpers.mjs");

const G = "900000000000000001";
const ME = { id: "111111111111111111", username: "eu", displayName: "Eu Mesmo" };

const member = (id, username, displayName, bot = false) => ({
    id, username, displayName, nickname: null, bot,
    avatarUrl: "https://cdn.exemplo.test/" + id + ".png"
});

const MEMBERS = [
    member(ME.id, "eu", "Eu Mesmo"),
    member("200000000000000001", "maria", "Maria Silva"),
    member("200000000000000002", "mario", "Mário Souza"),
    member("200000000000000003", "ricardo", "Ricardo"),
    member("200000000000000009", "helena", "Helena", true)
];

// API simulada: lista de membros e membro individual.
globalThis.fetch = async url => {
    const u = String(url);

    const reply = (status, body) => ({
        ok: status < 300, status, json: async () => body,
        text: async () => JSON.stringify(body), headers: { get: () => null }
    });

    let m;

    if ((m = u.match(/\/guilds\/[^/]+\/members\/([^/]+)$/))) {
        const found = MEMBERS.find(x => x.id === decodeURIComponent(m[1]));

        return found ? reply(200, { member: found }) : reply(404, {});
    }

    if (/\/guilds\/[^/]+$/.test(u)) {
        return reply(200, { members: MEMBERS });
    }

    return reply(404, {});
};

const run = await createPrefixRunner({ guildId: G, author: ME });

function arm(user, itemId, ammo = 10) {
    tx(() => addItem(G, user, itemId, 1));
    equipWeapon(G, user, itemId);
    set("UPDATE combat_gear SET ammo = ? WHERE guild_id=? AND user_id=?", ammo, G, user);
}

const MARIA = "200000000000000001";

function prepare() {
    clearUserLookupCache();

    for (const table of [
        "players", "combat_players", "combat_gear", "inventory",
        "equipped_items", "crime_players", "prison_players", "transactions"
    ]) {
        db.exec(`DELETE FROM ${table}`);
    }

    getPlayer(G, ME.id);
    getPlayer(G, MARIA);
    status(G, ME.id);
    status(G, MARIA);

    set("UPDATE players SET wallet = 100000 WHERE guild_id=? AND user_id=?", G, MARIA);
}

// ==========================================
// ROUBAR
// ==========================================

test("hroubar sem alvo pede o alvo", async () => {
    prepare();

    const r = await run("hroubar");

    assert.match(r.text, /alvo/i);
});

test("hroubar com nome inexistente avisa que não encontrou", async () => {
    prepare();

    const r = await run("hroubar ninguemassim");

    assert.match(r.title, /Usuário não encontrado/);
    assert.equal(get("SELECT COUNT(*) c FROM crime_players WHERE criminal_record > 0").c, 0, "não gastou nada");
});

test("hroubar com nome ambíguo pede mais detalhe", async () => {
    prepare();

    const r = await run("hroubar mar");

    assert.match(r.title, /Mais de um usuário/);
    assert.match(r.text, /Maria Silva/);
    assert.match(r.text, /Mário Souza/);
});

test("não dá para roubar bot nem a si mesmo", async () => {
    prepare();
    arm(ME.id, "revolver");

    assert.match((await run("hroubar helena")).title, /Alvo inválido/);
    assert.match((await run("hroubar eu mesmo")).title, /Alvo inválido/);
});

test("sem arma equipada o comando avisa", async () => {
    prepare();

    const r = await run("hroubar Maria Silva");

    assert.match(r.title, /Sem arma/);
});

test("roubo por nome completo, por menção e pelo alias hassaltar", async () => {
    prepare();
    arm(ME.id, "assault_rifle");   // 85% de chance

    // O sorteio real é aleatório: repete com as chances altas até
    // acertar; o importante é o formato da resposta.
    let success = null;

    for (let i = 0; i < 12 && !success; i++) {
        set("UPDATE crime_players SET last_rob = 0 WHERE guild_id=?", G);
        set("UPDATE players SET energy = 100, energy_updated_at = 0 WHERE guild_id=? AND user_id=?", G, ME.id);
        set("UPDATE players SET wallet = 100000 WHERE guild_id=? AND user_id=?", G, MARIA);
        set("UPDATE combat_gear SET ammo = 10, durability = 100 WHERE guild_id=? AND user_id=?", G, ME.id);
        set("UPDATE combat_players SET hp = 100 WHERE guild_id=? AND user_id=?", G, ME.id);

        const command = ["hroubar Maria Silva", `hroubar <@${MARIA}>`, "hassaltar maria silva"][i % 3];
        const r = await run(command);

        if (/Roubo bem-sucedido/.test(r.title)) success = { r, command };
    }

    assert.ok(success, "alguma tentativa com 85% de chance deveria ter dado certo");

    const fields = fieldsOf(JSON.parse(success.r.text).embeds[0]);

    assert.ok(fields["💸 Total levado"]);
    assert.ok(fields["🧺 Dinheiro sujo"]);
    assert.match(JSON.parse(success.r.text).embeds[0].description, /Maria Silva/);
});

test("preso não rouba (o comando é bloqueado na cadeia)", async () => {
    prepare();
    arm(ME.id, "revolver");

    imprison(G, ME.id, 1800, "teste");

    const r = await run("hroubar Maria Silva");

    assert.match(r.title, /Você está preso/);
    assert.equal(r.components.length, 1, "com o botão de fuga");
});

// ==========================================
// PROCURADOS
// ==========================================

test("hprocurados lista quem tem ficha, com paginação", async () => {
    prepare();

    savePlayerName({ id: MARIA, displayName: "Maria Silva" });
    savePlayerName({ id: ME.id, displayName: "Eu Mesmo" });

    // ninguém ainda
    assert.match((await run("hprocurados")).text, /Ninguém tem ficha/);

    ensureCrimePlayer(G, MARIA);
    ensureCrimePlayer(G, ME.id);

    set("UPDATE crime_players SET criminal_record = 3 WHERE guild_id=? AND user_id=?", G, MARIA);
    set("UPDATE crime_players SET criminal_record = 1 WHERE guild_id=? AND user_id=?", G, ME.id);

    const list = await run("hprocurados");
    const embed = JSON.parse(list.text).embeds[0];

    assert.match(embed.title, /Procurados/);
    assert.match(embed.description, /1\.\*\* Maria Silva — 3 registros/);
    assert.match(embed.description, /2\.\*\* Eu Mesmo — 1 registro\b/);
    assert.match(embed.footer.text, /Página 1 de 1/);

    // alias em inglês e página inexistente
    assert.match((await run("hwanted pagina:9")).title, /Procurados/);
});

test("a ficha cresce com crime, roubo e lavagem", async () => {
    prepare();

    set("UPDATE players SET energy = 100, energy_updated_at = 0, dirty_money = 3000000 WHERE guild_id=? AND user_id=?", G, ME.id);

    await run("hcrime");
    assert.equal(get("SELECT criminal_record r FROM crime_players WHERE user_id=?", ME.id).r, 1);

    set("UPDATE players SET energy = 100, energy_updated_at = 0 WHERE guild_id=? AND user_id=?", G, ME.id);
    set("UPDATE crime_players SET launder_ready_at = 0");
    db.exec("DELETE FROM prison_players");

    await run("hlavagem 5000 publica");
    assert.equal(get("SELECT criminal_record r FROM crime_players WHERE user_id=?", ME.id).r, 2);
});

// ==========================================
// BOTÃO DE FUGA NO HPRISAO
// ==========================================

test("hprisao preso mostra o botão de fuga; livre, não", async () => {
    prepare();

    imprison(G, ME.id, 1800, "teste");

    const jailed = await run("hprisao");

    assert.match(jailed.title, /Você está preso/);
    assert.equal(jailed.components.length, 1);

    const button = jailed.components[0].components[0];

    assert.equal(button.type, "button");
    assert.equal(button.customId, `fuga:iniciar:${ME.id}`);

    db.exec("DELETE FROM prison_players");

    const free = await run("hprisao");

    assert.match(free.title, /Você está livre/);
    assert.equal(free.components.length, 0);
});

test("comando bloqueado na cadeia também mostra o botão", async () => {
    prepare();

    imprison(G, ME.id, 1800, "teste");

    const r = await run("htrabalhar");

    assert.match(r.title, /Você está preso/);
    assert.equal(r.components[0].components[0].customId, `fuga:iniciar:${ME.id}`);
});

test("cooldowns inclui o roubo", async () => {
    prepare();

    const r = await run("hcooldowns");

    assert.match(r.text, /Roubo/);
    assert.match(r.text, /\/roubar/);
});
