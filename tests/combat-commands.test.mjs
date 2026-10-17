import { getPlayer, set, get } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// Os comandos de combate (/statuscombate, /hospital, /curar, /municao, /colete,
// /reparar, /recarregar, /protecaopvp, /historico, /armas) e o /ping: o que cada
// tela mostra e, principalmente, que as respostas de erro saem inteiras. (Antes,
// o erro vinha com um embed dentro de outro, e a VSync não conseguia mostrar.)

const { carregarComandos, resolverComando } = await import("../command-registry.mjs");
const combat = await import("../services/combat/combat.mjs");
const { addItem } = await import("../services/economy/inventory.mjs");
const { equipWeapon } = await import("../services/combat/equipment.mjs");
const { HOSPITAL_RULES } = await import("../services/combat/hospital.mjs");
const { ARMORY_RULES } = await import("../services/combat/armory.mjs");
const { formatMoney } = await import("../database/economy.mjs");
const { hpLine, durabilityLine } = await import("../services/combat/combat-view.mjs");
const { progressBar } = await import("../utils/bar.mjs");

const { DUEL_RULES, tx, ensure, challenge, accept } = combat;

const silently = async fn => {
    const log = console.log;
    const error = console.error;
    console.log = () => {};
    console.error = () => {};

    try { return await fn(); } finally { console.log = log; console.error = error; }
};

const comandos = await silently(() => carregarComandos());

const A = "111111111111111111";
const B = "222222222222222222";

let counter = 0;

const guild = () => `g-combatcmd-${++counter}`;

function player(g, user, { money = 0, weapon = null } = {}) {
    getPlayer(g, user);

    set("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?", money, g, user);

    ensure(g, user);

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

const hp = (g, user, value) =>
    set("UPDATE combat_players SET hp = ? WHERE guild_id = ? AND user_id = ?", value, g, user);

const wallet = (g, user) =>
    get("SELECT wallet w FROM players WHERE guild_id = ? AND user_id = ?", g, user).w;

let sequence = 0;

const run = (name, g, userId = A, options = {}) => silently(() =>
    resolverComando(comandos, name).execute({
        id: "i" + (++sequence), guildId: g, channelId: "c1",
        user: { id: userId, username: "u", displayName: "Jogador" },
        data: { options }
    })
);

const embedOf = response => response.data.embeds[0];
const field = (response, name) => embedOf(response).fields.find(item => item.name === name)?.value;

// Uma resposta bem formada: uma mensagem com embeds de verdade (sem "type" dentro).
function assertWellFormed(response, label) {
    assert.equal(response.type, "message", label);
    assert.ok(Array.isArray(response.data.embeds) && response.data.embeds.length >= 1, `${label}: tem embed`);

    for (const embed of response.data.embeds) {
        assert.equal(embed.type, undefined, `${label}: embed dentro de embed`);
        assert.ok(embed.title && typeof embed.title === "string", `${label}: título`);
        assert.ok(typeof embed.description === "string", `${label}: descrição`);
    }

    assert.doesNotMatch(JSON.stringify(response), /moedas?\b/i, `${label}: fala em moedas em vez de reais`);
}

// ==========================================
// RESPOSTAS BEM FORMADAS (SUCESSO E ERRO)
// ==========================================

test("nenhum comando de combate devolve embed dentro de embed, nem fala em 'moedas'", async () => {
    const g = guild();

    player(g, A, { money: 100_000, weapon: "revolver" });
    player(g, B);

    gear(g, A, { ammo: 5 });
    hp(g, A, 60);

    const names = ["statuscombate", "hospital", "protecaopvp", "historico", "armas", "recarregar", "ping"];

    for (const name of names) {
        assertWellFormed(await run(name, g), `/${name}`);
    }

    // ações com sucesso
    assertWellFormed(await run("municao", g, A, { quantidade: 3 }), "/municao");
    assertWellFormed(await run("colete", g), "/colete");
    assertWellFormed(await run("reparar", g), "/reparar");
    assertWellFormed(await run("curar", g), "/curar");

    // e os mesmos comandos falhando: erro precisa sair inteiro também
    const broke = guild();

    player(broke, A, { money: 0 });

    assertWellFormed(await run("curar", broke), "/curar com a vida cheia");
    assertWellFormed(await run("reparar", broke), "/reparar sem arma");
    assertWellFormed(await run("recarregar", broke), "/recarregar sem arma de fogo");
    assertWellFormed(await run("colete", broke), "/colete sem dinheiro");
    assertWellFormed(await run("municao", broke, A, { quantidade: 0 }), "/municao com 0");
    assertWellFormed(await run("municao", broke, A, { quantidade: 5 }), "/municao sem dinheiro");

    hp(broke, A, 50);

    assertWellFormed(await run("curar", broke), "/curar sem dinheiro");
});

test("o erro dos comandos de admin também sai inteiro", async () => {
    const g = guild();

    player(g, A);

    // sem estar na lista de administradores, o serviço recusa: o aviso precisa sair inteiro
    const response = await run("adminxp", g, A, { usuario: B, quantidade: 10 });

    assert.equal(response.type, "message");
    assert.equal(embedOf(response).type, undefined, "sem embed dentro de embed");
    assert.match(embedOf(response).description, /autorizado/);
});

test("as descrições dos comandos cabem na VSync (1 a 100) e não falam em 'moedas'", () => {
    for (const command of comandos.values()) {
        assert.ok(command.description.length >= 1 && command.description.length <= 100, `/${command.name}: ${command.description.length} caracteres`);
        assert.doesNotMatch(command.description, /moedas?\b/i, `/${command.name}`);

        for (const option of command.options ?? []) {
            assert.ok(option.description.length >= 1 && option.description.length <= 100, `/${command.name} ${option.name}`);
        }
    }
});

// ==========================================
// CONSULTAS
// ==========================================

test("/statuscombate mostra a vida em barra, o histórico, o equipamento e a proteção", async () => {
    const g = guild();

    player(g, A, { weapon: "pocket_knife" });
    gear(g, A, { ammo: 7, vest: 10, durability: 40 });
    hp(g, A, 60);
    set("UPDATE combat_players SET wins = 3, losses = 1 WHERE guild_id = ?", g);

    const response = await run("statuscombate", g);

    assert.equal(embedOf(response).description, hpLine(60));
    assert.match(embedOf(response).description, /██████░░░░ \*\*60\/100\*\*/);

    assert.equal(field(response, "🏆 Vitórias"), "3");
    assert.equal(field(response, "💀 Derrotas"), "1");
    assert.equal(field(response, "🗡️ Arma"), "🔪 Canivete");
    assert.equal(field(response, "🔫 Munição"), "7");
    assert.equal(field(response, "🛡️ Defesa"), "10 pontos");
    assert.equal(field(response, "🔧 Durabilidade da arma"), durabilityLine(40));
    assert.equal(field(response, "🛡️ Proteção"), "Sem proteção");
});

test("/statuscombate avisa quando a vida está abaixo do mínimo do duelo", async () => {
    const g = guild();

    player(g, A);
    hp(g, A, DUEL_RULES.minHp - 1);

    const response = await run("statuscombate", g);

    assert.match(embedOf(response).description, new RegExp(`menos de \\*\\*${DUEL_RULES.minHp}\\*\\* de vida`));
    assert.match(embedOf(response).description, /\/curar/);

    hp(g, A, DUEL_RULES.minHp);

    assert.doesNotMatch(embedOf(await run("statuscombate", g)).description, /menos de/);
});

test("/hospital mostra o custo em reais, ou diz que não há o que tratar", async () => {
    const g = guild();

    player(g, A);

    const full = await run("hospital", g);

    assert.equal(field(full, "💸 Custo para se curar"), "Nada");
    assert.match(embedOf(full).description, /vida cheia/);

    hp(g, A, 60);

    const hurt = await run("hospital", g);

    assert.ok(field(hurt, "💸 Custo para se curar").startsWith(formatMoney(40 * HOSPITAL_RULES.costPerHp)), field(hurt, "💸 Custo para se curar"));
    assert.match(embedOf(hurt).description, /\/curar/);
});

test("/protecaopvp mostra o tempo restante, ou como conseguir a proteção", async () => {
    const g = guild();

    player(g, A, { money: 100_000 });
    hp(g, A, 50);

    assert.match(embedOf(await run("protecaopvp", g)).description, /sem proteção/);
    assert.match(embedOf(await run("protecaopvp", g)).description, /\/curar/);

    await run("curar", g);

    const protectedNow = embedOf(await run("protecaopvp", g)).description;

    assert.match(protectedNow, /Você está protegido por/);
    assert.match(protectedNow, /ninguém pode te desafiar/);
});

test("/armas mostra a arma, o dano, o tipo, a durabilidade e a munição", async () => {
    const g = guild();

    player(g, A);

    const none = await run("armas", g);

    assert.match(embedOf(none).description, /sem arma equipada/);
    assert.match(embedOf(none).description, /\/equipar/);

    tx(() => addItem(g, A, "pistol", 1));
    equipWeapon(g, A, "pistol");
    gear(g, A, { ammo: 9, durability: 80 });

    const gun = await run("armas", g);

    assert.match(embedOf(gun).title, /Pistola/);
    assert.equal(field(gun, "⚔️ Dano"), "28");
    assert.equal(field(gun, "🧰 Tipo"), "Arma de fogo");
    assert.equal(field(gun, "🔫 Munição"), "9");
    assert.equal(field(gun, "🔧 Durabilidade"), durabilityLine(80));

    tx(() => addItem(g, A, "wooden_sword", 1));
    equipWeapon(g, A, "wooden_sword");

    const sword = await run("armas", g);

    assert.equal(field(sword, "⚔️ Dano"), String(DUEL_RULES.defaultWeaponDamage), "arma sem dano definido vale o padrão");
    assert.equal(field(sword, "🧰 Tipo"), "Arma branca");
    assert.equal(field(sword, "🔫 Munição"), "Não usa");
});

// ==========================================
// HISTÓRICO
// ==========================================

test("/historico conta do seu lado: quem você venceu, para quem perdeu, com menções", async () => {
    const g = guild();

    player(g, A, { weapon: "pocket_knife" });   // vence
    player(g, B);

    const empty = await run("historico", g, A);

    assert.match(embedOf(empty).description, /Nenhum duelo registrado/);
    assert.match(embedOf(empty).description, /\/atacar/);

    challenge(g, A, B);
    accept(g, B);

    const winner = embedOf(await run("historico", g, A)).description;
    const loser = embedOf(await run("historico", g, B)).description;

    assert.match(winner, /\*\*1\*\* vitórias • \*\*0\*\* derrotas/);
    assert.match(winner, new RegExp(`🏆 Você venceu <@${B}> • seu golpe: 8 • há `));

    assert.match(loser, /\*\*0\*\* vitórias • \*\*1\*\* derrotas/);
    assert.match(loser, new RegExp(`💀 Você perdeu para <@${A}> • golpe dele: 8 • há `));

    assert.doesNotMatch(winner, new RegExp(`(?<!<@)\\b${A}\\b(?!>)`), "nunca o ID cru");
});

// ==========================================
// AÇÕES
// ==========================================

test("/curar cobra em reais, enche a vida e mostra o que mudou", async () => {
    const g = guild();

    player(g, A, { money: 10_000 });
    hp(g, A, 40);

    const response = await run("curar", g);

    assert.match(embedOf(response).title, /Tratamento concluído/);
    assert.equal(embedOf(response).description, hpLine(HOSPITAL_RULES.maxHp));
    assert.equal(field(response, "💸 Custo"), formatMoney(60 * HOSPITAL_RULES.costPerHp));
    assert.equal(field(response, "🛡️ Proteção contra duelos"), "10 minutos");
    assert.equal(field(response, "👛 Carteira"), formatMoney(10_000 - 60 * HOSPITAL_RULES.costPerHp));
    assert.equal(wallet(g, A), 10_000 - 60 * HOSPITAL_RULES.costPerHp);
});

test("/curar com a vida cheia ou sem dinheiro avisa e não cobra nada", async () => {
    const g = guild();

    player(g, A, { money: 5000 });

    const full = await run("curar", g);

    assert.match(embedOf(full).title, /Não foi possível se curar/);
    assert.match(embedOf(full).description, /vida já está cheia/);
    assert.equal(wallet(g, A), 5000);

    hp(g, A, 10);
    set("UPDATE players SET wallet = 100 WHERE guild_id = ?", g);

    const poor = await run("curar", g);

    assert.match(embedOf(poor).description, /Carteira insuficiente/);
    assert.equal(wallet(g, A), 100);
});

test("/municao mostra a quantidade, o valor, o estoque e a carteira; recusa quantidade ruim", async () => {
    const g = guild();

    player(g, A, { money: 10_000 });
    gear(g, A, { ammo: 2 });

    const response = await run("municao", g, A, { quantidade: 5 });

    assert.match(embedOf(response).title, /Munição comprada/);
    assert.match(embedOf(response).description, /\*\*5\*\* munições/);
    assert.equal(field(response, "💸 Valor pago"), formatMoney(5 * ARMORY_RULES.ammoPrice));
    assert.equal(field(response, "🎒 Munição agora"), "7");
    assert.equal(field(response, "👛 Carteira"), formatMoney(10_000 - 5 * ARMORY_RULES.ammoPrice));

    const bad = await run("municao", g, A, { quantidade: ARMORY_RULES.maxAmmoPerPurchase + 1 });

    assert.match(embedOf(bad).title, /Não foi possível comprar munição/);
    assert.match(embedOf(bad).description, /entre 1 e 100/);
});

test("/colete diz o que ele faz de verdade e cobra em reais", async () => {
    const g = guild();

    player(g, A, { money: 20_000 });

    const response = await run("colete", g);

    assert.match(embedOf(response).title, /Colete equipado/);
    assert.match(embedOf(response).description, new RegExp(`${ARMORY_RULES.vestDefense}\\*\\* pontos a menos de dano`));
    assert.equal(field(response, "💸 Valor pago"), formatMoney(ARMORY_RULES.vestPrice));
    assert.equal(field(response, "🛡️ Defesa"), `${ARMORY_RULES.vestDefense} pontos`);
    assert.equal(combat.status(g, A).vest, ARMORY_RULES.vestDefense);

    set("UPDATE players SET wallet = 10 WHERE guild_id = ?", g);

    assert.match(embedOf(await run("colete", g)).description, /Carteira insuficiente/);
});

test("/reparar devolve a durabilidade da arma, e pede uma arma equipada", async () => {
    const g = guild();

    player(g, A, { money: 20_000 });

    assert.match(embedOf(await run("reparar", g)).description, /Equipe uma arma primeiro/);

    tx(() => addItem(g, A, "machete", 1));
    equipWeapon(g, A, "machete");
    gear(g, A, { durability: 12 });

    const response = await run("reparar", g);

    assert.match(embedOf(response).title, /Arma reparada/);
    assert.match(embedOf(response).description, /Facão/);
    assert.equal(field(response, "🔧 Durabilidade"), durabilityLine(100));
    assert.equal(field(response, "💸 Valor pago"), formatMoney(ARMORY_RULES.repairPrice));
});

test("/recarregar mostra o estoque da arma de fogo, e explica quando não dá", async () => {
    const g = guild();

    player(g, A, { weapon: "pocket_knife" });

    assert.match(embedOf(await run("recarregar", g)).description, /Equipe uma arma de fogo/);

    tx(() => addItem(g, A, "revolver", 1));
    equipWeapon(g, A, "revolver");

    const empty = await run("recarregar", g);

    assert.match(embedOf(empty).description, /Revólver/);
    assert.match(field(empty, "🎒 Munição"), /0 \(compre mais com `\/municao`\)/);

    gear(g, A, { ammo: 12 });

    assert.equal(field(await run("recarregar", g), "🎒 Munição"), "12");
});

// ==========================================
// PING
// ==========================================

test("/ping responde com o tempo no ar e a contagem de comandos", async () => {
    const response = await run("ping", guild());

    assert.match(embedOf(response).title, /Pong/);
    assert.equal(embedOf(response).description, "Estou funcionando.");
    assert.match(field(response, "⏱️ No ar há"), /\d+s/);
    assert.match(field(response, "📖 Comandos"), /^\d+$/);
});

// ==========================================
// BARRA DE PROGRESSO
// ==========================================

test("a barra de progresso enche na proporção, e prende valores fora do intervalo", () => {
    assert.equal(progressBar(0, 100), "░░░░░░░░░░");
    assert.equal(progressBar(50, 100), "█████░░░░░");
    assert.equal(progressBar(100, 100), "██████████");
    assert.equal(progressBar(-5, 100), "░░░░░░░░░░");
    assert.equal(progressBar(500, 100), "██████████");
    assert.equal(progressBar(1, 0), "░░░░░░░░░░", "sem máximo não divide por zero");
    assert.equal(progressBar(3, 6, 4), "██░░", "tamanho escolhido");
});
