import { db, getPlayer } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// Os drops no chat (config/drops.mjs, services/economy/drops.mjs, drops-view.mjs, services/panels/drops-panel.mjs),
// os ajustes do servidor (services/platform/guild-settings.mjs) e o /servidor.

const { DROP_CONFIG, DROP_PRIZES } = await import("../config/drops.mjs");
const { FREE_SOURCES, OPENABLE_BOXES } = await import("../config/boxes.mjs");
const { getItem } = await import("../config/items.mjs");
const { createDrops, deliverDropPrize, drops, rollDropPrize, setDropSender } = await import("../services/economy/drops.mjs");
const { claimedMessage, dropMessage, expiredMessage } = await import("../services/economy/drops-view.mjs");
const { canManageGuild, getGuildSettings, guildsWithDrops, updateGuildSettings } = await import("../services/platform/guild-settings.mjs");
const { buildServer } = await import("../services/panels/server-view.mjs");
const { handlePanelClick } = await import("../services/panels/panels.mjs");
const { addItem, getItemQuantity } = await import("../services/economy/inventory.mjs");
const { inventoryRoom } = await import("../services/economy/backpack.mjs");
const { getStat } = await import("../services/progress/stats.mjs");
const { openBoxes, setBoxRandom } = await import("../services/economy/boxes.mjs");
const { layoutProblems } = await import("../utils/components-v2.mjs");
const { localizeData } = await import("../services/platform/i18n.mjs");
const { tx } = await import("../services/combat/combat.mjs");
const { carregarComandos, resolverComando } = await import("../command-registry.mjs");

const texto = value => JSON.stringify(value);

let counter = 0;

const guildId = () => `9900${String(++counter).padStart(6, "0")}`;

const USER_A = "111111111111111111";
const USER_B = "222222222222222222";
const USER_C = "333333333333333333";

const T0 = Date.UTC(2026, 10, 22, 15, 0, 0);

function account(g, user, wallet = 0) {
    getPlayer(g, user);

    db.prepare("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?").run(wallet, g, user);
}

const wallet = (g, user) => db.prepare("SELECT wallet FROM players WHERE guild_id = ? AND user_id = ?").get(g, user).wallet;

const ledger = (g, user) => db.prepare("SELECT type, amount FROM transactions WHERE guild_id = ? AND user_id = ? ORDER BY id").all(g, user).map(row => ({ ...row }));

// Um serviço de drops com o Discord de mentira e o relógio combinado.
function make({ servers = [], random = () => 0.5, config = {}, prizes = DROP_PRIZES, sendOk = true } = {}) {
    const state = { clock: T0, sent: [], edited: [], timers: [], cleared: [], servers };

    const service = createDrops({
        send: async (target, data) => {
            state.sent.push({ target, data });

            if (sendOk === "throw") throw new Error("rede");

            return sendOk ? { id: `msg${state.sent.length}` } : null;
        },
        edit: async (target, id, data) => { state.edited.push({ target, id, data }); },
        now: () => state.clock,
        random: () => random(),
        setTimer: (fn, ms) => { const timer = { fn, ms, unref() {} }; state.timers.push(timer); return timer; },
        clearTimer: timer => state.cleared.push(timer),
        config: { ...DROP_CONFIG, ...config },
        prizes,
        servers: () => state.servers,
        buildDrop: dropMessage,
        buildExpired: expiredMessage
    });

    const chat = (g, channel, people, count = DROP_CONFIG.minMessages) => {
        for (let index = 0; index < count; index += 1) {
            service.noteChat({ guildId: g, channelId: channel, userId: people[index % people.length] });
        }
    };

    return { service, state, chat };
}

// ==========================================
// A CONFIGURAÇÃO
// ==========================================

test("o que pode vir: itens que existem, dinheiro em reais inteiros, reserva para o que não couber, e a caixa tem fonte declarada", () => {
    assert.equal(DROP_PRIZES.reduce((sum, prize) => sum + prize.weight, 0), 100, "os pesos somam 100 (cada um é a chance em %)");

    assert.equal(new Set(DROP_PRIZES.map(prize => prize.id)).size, DROP_PRIZES.length);

    for (const prize of DROP_PRIZES) {
        if (prize.money) {
            const [min, max] = prize.money;

            assert.ok(min > 0 && max >= min && min % 100 === 0 && max % 100 === 0, prize.id);

        } else {
            assert.ok(getItem(prize.item), prize.item);
            assert.ok(prize.quantity >= 1 && prize.fallback > 0, prize.id);
        }
    }

    // a caixa misteriosa é rara e só vem daqui
    const box = DROP_PRIZES.find(prize => prize.item === "mystery_box");

    assert.ok(box && box.weight <= 10, "a caixa é rara");
    assert.ok(FREE_SOURCES.mystery_box.includes("chat_drop"));
    assert.ok(OPENABLE_BOXES.includes("mystery_box"));
    assert.equal(getItem("mystery_box").buyPrice, null, "nunca à venda");

    // o que vem de graça vale pouco: o prêmio médio fica bem abaixo do salário mais fraco (R$ 150)
    const average = DROP_PRIZES.reduce((sum, prize) => {
        const value = prize.money ? (prize.money[0] + prize.money[1]) / 2 : (getItem(prize.item).sellPrice || getItem(prize.item).buyPrice || prize.fallback) * prize.quantity;

        return sum + value * prize.weight / 100;
    }, 0);

    assert.ok(average < 15_000, `média de ${average / 100} reais por drop`);

    assert.ok(DROP_CONFIG.minIntervalMs >= 3_600_000 && DROP_CONFIG.dailyCap >= 1 && DROP_CONFIG.expireMs <= 120_000);
});

test("o sorteio do prêmio: cada um sai com o seu peso, e os extremos não estouram", () => {
    const counts = new Map();

    for (let index = 0; index < 1000; index += 1) {
        const prize = rollDropPrize(() => (index + 0.5) / 1000);

        counts.set(prize.id, (counts.get(prize.id) ?? 0) + 1);
    }

    for (const prize of DROP_PRIZES) {
        assert.equal(counts.get(prize.id), prize.weight * 10, prize.id);
    }

    assert.equal(rollDropPrize(() => 0).id, DROP_PRIZES[0].id);
    assert.equal(rollDropPrize(() => 1).id, DROP_PRIZES.at(-1).id);
    assert.equal(rollDropPrize(() => -1).id, DROP_PRIZES[0].id);
});

// ==========================================
// A CONVERSA E O SORTEIO
// ==========================================

test("só há conversa com mensagens suficientes de pessoas diferentes, nos últimos minutos, e vale o canal mais movimentado", () => {
    const { service, state, chat } = make();

    const g = guildId();

    chat(g, "111", [USER_A], DROP_CONFIG.minMessages + 5);

    assert.equal(service.activeChannel(g), null, "uma pessoa só falando sozinha não é conversa");

    chat(g, "111", [USER_B], 1);

    assert.equal(service.activeChannel(g), "111");

    // outro canal mais movimentado vence
    chat(g, "222", [USER_A, USER_B, USER_C], DROP_CONFIG.minMessages + 20);

    assert.equal(service.activeChannel(g), "222");
    assert.equal(service.activeChannel(g, "111"), "111", "limitado a um canal");
    assert.equal(service.activeChannel(g, "999"), null);

    // de outro servidor não conta
    assert.equal(service.activeChannel(guildId()), null);

    // passados os minutos, a conversa esfria
    state.clock += DROP_CONFIG.chatWindowMs;

    assert.equal(service.activeChannel(g), null);

    // dados faltando não quebram nem contam
    service.noteChat({ guildId: null, channelId: "1", userId: USER_A });
    service.noteChat({ guildId: g, channelId: null, userId: USER_A });
    service.noteChat({});
});

test("tick: solta um drop onde há conversa, com o botão e sem dizer o prêmio, e marca o intervalo", async () => {
    const g = guildId();

    const { service, state, chat } = make({ servers: [{ guildId: g, channelId: "" }], random: () => 0.01 });

    chat(g, "555", [USER_A, USER_B]);

    const spawned = await service.tick();

    assert.equal(spawned.length, 1);
    assert.equal(state.sent.length, 1);
    assert.deepEqual(state.sent[0].target, { guildId: g, channelId: "555" });

    const message = state.sent[0].data;

    assert.match(texto(message.embeds), /Um presente apareceu/);
    assert.equal(message.components[0].components[0].customId, `drop:pegar:${spawned[0].id}`);
    assert.doesNotMatch(texto(message), /R\$|Maçã|Pacote|Caixa/, "não conta o que tem dentro");

    // o drop some sozinho: um temporizador de 60 s
    assert.equal(state.timers.length, 1);
    assert.equal(state.timers[0].ms, DROP_CONFIG.expireMs);

    // enquanto há um drop no chat, e dentro do intervalo, não sai outro
    chat(g, "555", [USER_A, USER_B]);

    assert.deepEqual(await service.tick(), []);

    state.clock += DROP_CONFIG.minIntervalMs - 1;

    assert.deepEqual(await service.tick(), [], "ainda dentro do intervalo");
});

test("tick: respeita o servidor desligado, a falta de conversa, o canal escolhido e a chance", async () => {
    const g = guildId();

    // servidor sem drops ligados: a lista vem vazia
    const off = make({ servers: [], random: () => 0 });

    off.chat(g, "1", [USER_A, USER_B]);

    assert.deepEqual(await off.service.tick(), []);

    // sem conversa
    const quiet = make({ servers: [{ guildId: g, channelId: "" }], random: () => 0 });

    assert.deepEqual(await quiet.service.tick(), []);

    // o canal escolhido: a conversa em outro canal não conta
    const picked = make({ servers: [{ guildId: g, channelId: "777" }], random: () => 0 });

    picked.chat(g, "888", [USER_A, USER_B], 30);

    assert.deepEqual(await picked.service.tick(), []);

    picked.chat(g, "777", [USER_A, USER_B]);

    assert.equal((await picked.service.tick()).length, 1);

    // a chance: 0,15 por rodada
    const lucky = make({ servers: [{ guildId: g, channelId: "" }], random: () => DROP_CONFIG.chancePerTick });

    lucky.chat(g, "1", [USER_A, USER_B]);

    assert.deepEqual(await lucky.service.tick(), [], "o sorteio caiu fora da chance");
});

test("se o envio ao Discord falha, nenhum drop fica no chat e a próxima tentativa espera um pouco", async () => {
    const g = guildId();

    for (const sendOk of [false, "throw"]) {
        const { service, state, chat } = make({ servers: [{ guildId: g, channelId: "" }], random: () => 0, sendOk });

        chat(g, "1", [USER_A, USER_B]);

        assert.deepEqual(await service.tick(), []);
        assert.equal(service.live().length, 0);
        assert.equal(state.timers.length, 0);

        // não insiste no minuto seguinte
        state.clock += 60_000;

        assert.deepEqual(await service.tick(), []);
        assert.equal(state.sent.length, 1, String(sendOk));
    }
});

// ==========================================
// PEGAR O PRESENTE
// ==========================================

// Solta um drop de um prêmio combinado e devolve o serviço e o drop.
async function dropWith(prizeId, options = {}) {
    const g = guildId();

    const prize = DROP_PRIZES.find(entry => entry.id === prizeId);

    const ctx = make({ prizes: [prize], random: () => 0, ...options });

    const drop = await ctx.service.spawn({ guildId: g, channelId: "10" });

    return { ...ctx, g, drop };
}

test("o primeiro clique leva o prêmio, anota no extrato e nos contadores, e o drop sai do chat", async () => {
    const { service, state, g, drop } = await dropWith("money");

    account(g, USER_A, 1000);

    const result = service.claim({ id: drop.id, guildId: g, userId: USER_A });

    assert.equal(result.status, "ok");
    assert.equal(result.delivery.kind, "money");
    assert.equal(result.delivery.money, 3000, "random 0 cai no mínimo");

    assert.equal(wallet(g, USER_A), 1000 + 3000);
    assert.deepEqual(ledger(g, USER_A), [{ type: "drop", amount: 3000 }]);

    assert.equal(getStat(g, USER_A, "drops_claimed"), 1);
    assert.equal(getStat(g, USER_A, "drop_day:2026-11-22"), 1);

    assert.equal(service.live().length, 0);
    assert.equal(state.cleared.length, 1, "o temporizador foi cancelado");
});

test("quem chega depois leva um aviso: o drop já é de outra pessoa, ou já sumiu, ou é de outro servidor", async () => {
    const { service, g, drop } = await dropWith("pack");

    account(g, USER_A);
    account(g, USER_B);

    // outro servidor não pega o drop deste
    assert.deepEqual(service.claim({ id: drop.id, guildId: guildId(), userId: USER_A }), { status: "gone" });
    assert.deepEqual(service.claim({ id: "naoexiste", guildId: g, userId: USER_A }), { status: "gone" });

    assert.equal(service.claim({ id: drop.id, guildId: g, userId: USER_A }).status, "ok");

    // depois de levado, ele sai da lista: a segunda pessoa vê "sumiu"
    assert.deepEqual(service.claim({ id: drop.id, guildId: g, userId: USER_B }), { status: "gone" });

    assert.equal(getItemQuantity(g, USER_B, "supply_pack"), 0, "só uma pessoa leva");
    assert.equal(getItemQuantity(g, USER_A, "supply_pack"), 1);
});

test("dois cliques ao mesmo tempo: a marca vem antes de entregar, então só um leva (late para o outro)", async () => {
    const { service, g, drop } = await dropWith("pack");

    account(g, USER_A);
    account(g, USER_B);

    // o drop ainda está marcado quando o segundo chega (a entrega do primeiro ainda não terminou)
    const live = service.live()[0];

    live.claimedBy = USER_A;

    assert.deepEqual(service.claim({ id: drop.id, guildId: g, userId: USER_B }), { status: "late", by: USER_A });
    assert.equal(getItemQuantity(g, USER_B, "supply_pack"), 0);
});

test("o drop expira em 60 segundos: a mensagem vira 'sumiu' e o clique atrasado só avisa", async () => {
    const { service, state, g, drop } = await dropWith("money");

    account(g, USER_A);

    // o temporizador dispara
    state.timers[0].fn();

    await new Promise(resolve => setImmediate(resolve));

    assert.equal(state.edited.length, 1);
    assert.equal(state.edited[0].id, drop.messageId);
    assert.deepEqual(state.edited[0].target, { guildId: g, channelId: "10" });
    assert.match(texto(state.edited[0].data.embeds), /O presente sumiu/);
    assert.deepEqual(state.edited[0].data.components, [], "o botão some");

    assert.deepEqual(service.claim({ id: drop.id, guildId: g, userId: USER_A }), { status: "gone" });

    assert.equal(await service.expire(drop.id), false, "expirar de novo não edita outra vez");
    assert.equal(state.edited.length, 1);
});

test("se o relógio passou do prazo antes do temporizador, o clique também vê 'sumiu'", async () => {
    const { service, state, g, drop } = await dropWith("money");

    account(g, USER_A);

    state.clock += DROP_CONFIG.expireMs;

    assert.deepEqual(service.claim({ id: drop.id, guildId: g, userId: USER_A }), { status: "gone" });
    assert.equal(wallet(g, USER_A), 0);
});

test("drop levado não é editado ao expirar (a mensagem já mostra quem levou)", async () => {
    const { service, state, g, drop } = await dropWith("money");

    account(g, USER_A);

    service.claim({ id: drop.id, guildId: g, userId: USER_A });

    state.timers[0].fn();

    await new Promise(resolve => setImmediate(resolve));

    assert.equal(state.edited.length, 0);
});

test("só leva quem já tem conta no servidor e não está bloqueado, e só até o limite por dia", async () => {
    // sem conta: nada é criado nem entregue
    const first = await dropWith("money");

    assert.deepEqual(first.service.claim({ id: first.drop.id, guildId: first.g, userId: USER_C }), { status: "no_account" });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM players WHERE guild_id = ? AND user_id = ?").get(first.g, USER_C).n, 0, "clicar não cria conta");
    assert.equal(first.service.live().length, 1, "o drop continua valendo para quem tem conta");

    // bloqueada pelo dono
    db.prepare("INSERT OR REPLACE INTO developer_blacklist (user_id, reason) VALUES (?, ?)").run(USER_C, "teste");

    account(first.g, USER_C);

    assert.deepEqual(first.service.claim({ id: first.drop.id, guildId: first.g, userId: USER_C }), { status: "blocked" });

    db.prepare("DELETE FROM developer_blacklist WHERE user_id = ?").run(USER_C);

    // o limite por dia (UTC)
    const g = guildId();

    const ctx = make({ prizes: [DROP_PRIZES[0]], random: () => 0 });

    account(g, USER_A);

    for (let index = 0; index < DROP_CONFIG.dailyCap; index += 1) {
        const drop = await ctx.service.spawn({ guildId: g, channelId: "10" });

        assert.equal(ctx.service.claim({ id: drop.id, guildId: g, userId: USER_A }).status, "ok", `drop ${index + 1}`);
    }

    const over = await ctx.service.spawn({ guildId: g, channelId: "10" });

    assert.deepEqual(ctx.service.claim({ id: over.id, guildId: g, userId: USER_A }), { status: "cap", cap: DROP_CONFIG.dailyCap });
    assert.equal(ctx.service.live().length, 1, "o drop continua para os outros");

    // no dia seguinte, volta
    ctx.state.clock += 86_400_000;

    const next = await ctx.service.spawn({ guildId: g, channelId: "10" });

    assert.equal(ctx.service.claim({ id: next.id, guildId: g, userId: USER_A }).status, "ok");
});

// ==========================================
// O QUE ENTRA NA CONTA
// ==========================================

test("item que cabe vai para o inventário; sem espaço (limite do item ou mochila cheia) vira o dinheiro de reserva", () => {
    const g = guildId();

    account(g, USER_A);

    const apples = DROP_PRIZES.find(prize => prize.id === "apples");

    const ok = deliverDropPrize(g, USER_A, apples);

    assert.equal(ok.kind, "item");
    assert.equal(ok.quantity, 3);
    assert.equal(getItemQuantity(g, USER_A, "apple"), 3);
    assert.deepEqual(ledger(g, USER_A), [], "item não mexe no extrato");

    // no limite do item
    tx(() => addItem(g, USER_A, "apple", 96));

    const full = deliverDropPrize(g, USER_A, apples);

    assert.equal(full.kind, "converted");
    assert.equal(full.money, apples.fallback);
    assert.equal(getItemQuantity(g, USER_A, "apple"), 99);
    assert.equal(wallet(g, USER_A), apples.fallback);

    // mochila cheia
    const h = guildId();

    account(h, USER_A);

    tx(() => addItem(h, USER_A, "apple", 99));
    tx(() => addItem(h, USER_A, "coffee", inventoryRoom(h, USER_A)));

    assert.equal(inventoryRoom(h, USER_A), 0);

    const coffees = DROP_PRIZES.find(prize => prize.id === "coffees");

    assert.equal(deliverDropPrize(h, USER_A, coffees).kind, "converted");
});

test("a carteira no teto: leva só o que cabe, sem estourar", () => {
    const g = guildId();

    const MAX = 100_000_000_000_000;

    account(g, USER_A, MAX - 1000);

    const money = DROP_PRIZES.find(prize => prize.id === "money");

    const result = deliverDropPrize(g, USER_A, money, () => 0);

    assert.equal(result.money, 1000);
    assert.equal(result.lost, 3000 - 1000);
    assert.equal(wallet(g, USER_A), MAX);
});

test("a caixa misteriosa que vem do drop é de graça, entra no inventário e abre pelo /abrir", async () => {
    const { service, g, drop } = await dropWith("box");

    account(g, USER_A);

    const result = service.claim({ id: drop.id, guildId: g, userId: USER_A });

    assert.equal(result.delivery.kind, "item");
    assert.equal(getItemQuantity(g, USER_A, "mystery_box"), 1);
    assert.equal(wallet(g, USER_A), 0, "nada foi cobrado de ninguém");

    // abre: o sorteio da caixa já é testado em tests/boxes.test.mjs; aqui basta a caixa abrir de verdade
    setBoxRandom(() => 0);

    try {
        const opened = openBoxes(g, USER_A, "mystery_box", 1);

        assert.equal(opened.kind, "random");
        assert.equal(opened.opened, 1);
        assert.equal(getItemQuantity(g, USER_A, "mystery_box"), 0);

    } finally {
        setBoxRandom();
    }

    const log = console.log;

    console.log = () => {};

    const comandos = await carregarComandos();

    console.log = log;

    const command = resolverComando(comandos, "abrir");

    tx(() => addItem(g, USER_A, "mystery_box", 1));

    const response = await command.execute({ id: "a", guildId: g, channelId: "c", user: { id: USER_A }, data: { options: { caixa: "mystery_box" } } });

    assert.match(texto(response.data), /Caixa aberta/);

    // e o que não é abrível é recusado
    const refused = await command.execute({ id: "b", guildId: g, channelId: "c", user: { id: USER_A }, data: { options: { caixa: "apple" } } });

    assert.match(texto(refused.data), /Isso não abre/);
});

// ==========================================
// AS TELAS E O CLIQUE
// ==========================================

test("as telas: o drop (com o botão), o sumiço e o resultado de quem levou, com o que veio", () => {
    const drop = dropMessage({ id: "abc123" });

    assert.match(texto(drop.embeds), /Seja a primeira pessoa/);
    assert.match(texto(drop.embeds), /60 segundos/);
    assert.equal(drop.components[0].components[0].customId, "drop:pegar:abc123");

    assert.deepEqual(expiredMessage().components, []);

    const money = claimedMessage({ userId: USER_A, delivery: { kind: "money", money: 5000 } });

    assert.match(texto(money.embeds), new RegExp(`<@${USER_A}> levou:\\\\n`));
    assert.match(texto(money.embeds), /R\$.50,00/);
    assert.deepEqual(money.components, []);

    const item = claimedMessage({ userId: USER_A, delivery: { kind: "item", item: getItem("apple"), quantity: 3 } });

    assert.match(texto(item.embeds), /Maçã\*\* ×3/);

    const box = claimedMessage({ userId: USER_A, delivery: { kind: "item", item: getItem("mystery_box"), quantity: 1 } });

    assert.match(texto(box.embeds), /Abra a caixa com \/abrir/);

    const converted = claimedMessage({ userId: USER_A, delivery: { kind: "converted", money: 900, item: getItem("apple") } });

    assert.match(texto(converted.embeds), /não coube na mochila e virou dinheiro/);
});

test("o clique de verdade: o primeiro leva e a mensagem vira o resultado; os outros recebem um aviso só deles", async () => {
    const g = guildId();

    const sent = [];

    setDropSender({ send: async (target, data) => { sent.push({ target, data }); return { id: "m1" }; }, edit: async () => null });

    const before = process.env.NODE_ENV;

    try {
        account(g, USER_A);
        account(g, USER_B);

        const drop = await drops.spawn({ guildId: g, channelId: "10" });

        assert.ok(drop, "soltou");

        const customId = sent[0].data.components[0].components[0].customId;

        const click = (user, guild = g) => handlePanelClick({ guildId: guild, user: { id: user }, data: { customId } });

        // sem conta: aviso privado, e o drop continua
        const stranger = click(USER_C);

        assert.equal(stranger.data.ephemeral, true);
        assert.match(texto(stranger), /Use a Helena primeiro/);

        const won = click(USER_A);

        assert.equal(won.type, "update");
        assert.match(texto(won.data.embeds), /O presente foi pego/);
        assert.match(texto(won.data.embeds), new RegExp(`<@${USER_A}>`));
        assert.deepEqual(won.data.components, []);

        const late = click(USER_B);

        assert.equal(late.data.ephemeral, true);
        assert.match(texto(late), /já sumiu/);

        // botão desconhecido
        assert.match(texto(handlePanelClick({ guildId: g, user: { id: USER_A }, data: { customId: "drop:xyz:1" } })), /Botão desconhecido/);

    } finally {
        setDropSender(null);

        process.env.NODE_ENV = before;
    }
});

// ==========================================
// OS AJUSTES DO SERVIDOR
// ==========================================

test("ajustes: tudo desligado por padrão, grava e lê, só aceita IDs, e lista os servidores com drops", () => {
    const g = guildId();

    assert.deepEqual(getGuildSettings(g), { guildId: g, dropsEnabled: false, dropsChannelId: "" });

    assert.deepEqual(updateGuildSettings(g, { dropsEnabled: true }), { guildId: g, dropsEnabled: true, dropsChannelId: "" });
    assert.deepEqual(updateGuildSettings(g, { dropsChannelId: "123456789012345678" }), { guildId: g, dropsEnabled: true, dropsChannelId: "123456789012345678" }, "mexer num ajuste não desfaz o outro");
    assert.deepEqual(getGuildSettings(g), { guildId: g, dropsEnabled: true, dropsChannelId: "123456789012345678" });

    assert.ok(guildsWithDrops().some(entry => entry.guildId === g && entry.channelId === "123456789012345678"));

    updateGuildSettings(g, { dropsEnabled: false, dropsChannelId: "" });

    assert.equal(guildsWithDrops().some(entry => entry.guildId === g), false);

    assert.throws(() => updateGuildSettings("x", { dropsEnabled: true }), /Servidor inválido/);
    assert.throws(() => updateGuildSettings(g, { dropsChannelId: "canal" }), /Canal inválido/);

    // não dá para pôr lixo na tabela
    assert.throws(() => db.prepare("INSERT INTO guild_settings (guild_id, drops_enabled) VALUES ('1', 2)").run());
});

test("quem pode mexer: Administrador ou Gerenciar servidor, e mais ninguém (as permissões chegam como texto)", () => {
    assert.equal(canManageGuild("8"), true, "Administrador");
    assert.equal(canManageGuild("32"), true, "Gerenciar servidor");
    assert.equal(canManageGuild(String(0x8 | 0x400)), true);
    assert.equal(canManageGuild("2251799813685247"), true, "todas as permissões");
    assert.equal(canManageGuild("1024"), false, "só ver canais");
    assert.equal(canManageGuild("0"), false);
    assert.equal(canManageGuild(""), false);
    assert.equal(canManageGuild(null), false);
    assert.equal(canManageGuild(undefined), false);
    assert.equal(canManageGuild("abc"), false);
    assert.equal(canManageGuild("-1"), false === (BigInt("-1") & 0x8n) !== 0n ? true : canManageGuild("-1"));
});

// ==========================================
// O /SERVIDOR
// ==========================================

const member = permissions => ({ permissions });

const click = (g, customId, permissions, channelId = "555") => handlePanelClick({ guildId: g, channelId, member: member(permissions), user: { id: USER_A }, data: { customId } });

test("o painel: mostra o estado, o que a Helena conta (e que não guarda texto) e o botão certo para cada estado; o V2 cumpre as regras", () => {
    const g = guildId();

    const off = buildServer({ guildId: g });

    assert.match(texto(off.embed), /desligados/);
    assert.match(texto(off.embed), /qualquer canal com conversa/);
    assert.match(texto(off.embed), /não guarda o texto de nada/);
    assert.deepEqual(layoutProblems(off.layout), []);

    const buttons = view => view.components.flatMap(line => line.components);

    assert.deepEqual(buttons(off).map(button => button.label), ["Ligar drops", "Usar este canal", "Qualquer canal"]);
    assert.equal(buttons(off)[2].disabled, true, "já está em qualquer canal");

    updateGuildSettings(g, { dropsEnabled: true, dropsChannelId: "123456789012345678" });

    const on = buildServer({ guildId: g });

    assert.match(texto(on.embed), /ligados/);
    assert.match(texto(on.embed), /<#123456789012345678>/);
    assert.deepEqual(buttons(on).map(button => button.label), ["Desligar drops", "Usar este canal", "Qualquer canal"]);
    assert.equal(buttons(on)[2].disabled, false);
    assert.deepEqual(layoutProblems(on.layout), []);
});

test("os botões do /servidor: só quem gerencia o servidor, e cada um grava o que diz", () => {
    const g = guildId();

    // sem permissão: nada muda
    assert.match(texto(click(g, "srv:drops:on", "1024")), /Sem permissão/);
    assert.match(texto(click(g, "srv:drops:on", null)), /Sem permissão/);
    assert.equal(getGuildSettings(g).dropsEnabled, false);

    const on = click(g, "srv:drops:on", "32");

    assert.equal(on.type, "update");
    assert.match(texto(on.data.embeds), /Drops ligados/);
    assert.equal(getGuildSettings(g).dropsEnabled, true);

    const here = click(g, "srv:canal:aqui", "8", "123456789012345678");

    assert.match(texto(here.data.embeds), /<#123456789012345678>/);
    assert.equal(getGuildSettings(g).dropsChannelId, "123456789012345678");

    const anywhere = click(g, "srv:canal:todos", "8");

    assert.match(texto(anywhere.data.embeds), /qualquer canal com conversa/);
    assert.equal(getGuildSettings(g).dropsChannelId, "");

    const off = click(g, "srv:drops:off", "8");

    assert.match(texto(off.data.embeds), /Drops desligados/);
    assert.equal(getGuildSettings(g).dropsEnabled, false);

    assert.match(texto(click(g, "srv:xyz:1", "8")), /Botão desconhecido/);

    // fora de um servidor não faz nada
    assert.equal(handlePanelClick({ member: member("8"), user: { id: USER_A }, data: { customId: "srv:drops:on" } }), null);
});

test("o comando /servidor: só para admins, pede o comando de barra pelo prefixo, abre o painel com botões e V2", async () => {
    const log = console.log;

    console.log = () => {};

    const comandos = await carregarComandos();

    console.log = log;

    const command = resolverComando(comandos, "servidor");

    assert.ok(command);
    assert.equal(command.aliases, undefined, "alias gasta vaga de comando de barra");
    assert.ok(command.description.length <= 70);

    const g = guildId();

    const run = member => command.execute({ id: "s", guildId: g, channelId: "c", user: { id: USER_A }, member, data: { options: {} } });

    assert.match(texto((await run(member("1024"))).data), /Sem permissão/);
    assert.match(texto((await run(null)).data), /Use o comando de barra/);
    assert.match(texto((await run(member(null))).data), /Use o comando de barra/);
    assert.match(texto(await command.execute({ id: "x", user: { id: USER_A }, data: { options: {} } })), /servidor/);

    const admin = await run(member("8"));

    assert.match(texto(admin.data.embeds), /Ajustes do servidor/);
    assert.equal(admin.data.components[0].components.length, 3);
    assert.deepEqual(layoutProblems(admin.data.layout), []);
});

// ==========================================
// INGLÊS
// ==========================================

test("em inglês: o drop, o resultado, o aviso de quem chega tarde e o painel do /servidor saem traduzidos", () => {
    const g = guildId();

    updateGuildSettings(g, { dropsEnabled: true, dropsChannelId: "123456789012345678" });

    const view = buildServer({ guildId: g, notice: "🔔 Drops ligados. A Helena solta presentes quando a conversa esquentar." });

    const server = texto(localizeData({ body: "", embeds: [view.embed], components: view.components, layout: view.layout }, "en-US"));

    assert.match(server, /Server settings/);
    assert.match(server, /Drops channel/);
    assert.match(server, /With drops on, Helena sometimes drops a gift/);
    assert.match(server, /Turn drops off/);
    assert.match(server, /Use this channel/);
    assert.match(server, /Only people who manage the server can change this/);
    assert.match(server, /doesn't keep the text of anything|doesn't keep the text/);

    assert.doesNotMatch(server, /Ajustes do servidor|Desligar drops|Usar este canal|solta um presente/);

    const messages = [
        dropMessage({ id: "abc" }),
        expiredMessage(),
        claimedMessage({ userId: USER_A, delivery: { kind: "item", item: getItem("apple"), quantity: 3 } }),
        claimedMessage({ userId: USER_A, delivery: { kind: "money", money: 5000 } })
    ];

    const english = messages.map(message => texto(localizeData({ body: "", embeds: message.embeds, components: message.components }, "en-US"))).join("\n");

    assert.match(english, /A gift appeared/);
    assert.match(english, /Be the first person to press the button/);
    assert.match(english, /The gift disappears in \*\*60 seconds\*\*/);
    assert.match(english, /Grab it!/);
    assert.match(english, /The gift vanished/);
    assert.match(english, /The gift was grabbed/);
    assert.match(english, /got:/);

    assert.doesNotMatch(english, /Um presente|Seja a primeira|Pegar!|O presente|levou/);
});

test("em inglês: os avisos de quem aperta o botão do drop", () => {
    const warnings = [
        "Foi por pouco", "Outra pessoa pegou o presente primeiro.", "O presente já sumiu",
        "Use a Helena primeiro", "Limite de hoje", "Você já pegou 5 presentes hoje neste servidor. Volte amanhã.",
        "Não foi possível pegar", "Tente no próximo presente."
    ];

    const english = texto(localizeData({ body: "", embeds: [{ title: warnings[0], description: warnings.slice(1).join("\n") }] }, "en-US"));

    assert.match(english, /So close/);
    assert.match(english, /Someone else grabbed the gift first/);
    assert.match(english, /The gift is gone/);
    assert.match(english, /Use Helena first/);
    assert.match(english, /You already grabbed 5 gifts today/);
    assert.match(english, /Couldn't grab it/);

    assert.doesNotMatch(english, /Foi por pouco|Volte amanhã|Tente no próximo/);
});
