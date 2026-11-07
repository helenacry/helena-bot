import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// Fragmentos (shards) do gateway: a conta do servidor, as ondas de início, o número a usar, o campo
// shard do Identify e o gerente que liga as conexões (services/discord/shards.mjs).

const shards = await import("../services/discord/shards.mjs");
const { createGateway } = await import("../services/discord/gateway.mjs");
const registry = await import("../services/platform/guild-registry.mjs");
const shardRegistry = await import("../services/platform/shard-registry.mjs");
const health = await import("../services/platform/discord-health.mjs");

const { shardOfGuild, bucketOf, startupWaves, resolveShardCount, createShardManager } = shards;

const quiet = { log() {}, warn() {}, error() {} };

// ==========================================
// A CONTA DA DOCUMENTAÇÃO
// ==========================================

test("o fragmento de um servidor é (id >> 22) % total", () => {
    const guild = "1496729944804429865";

    const expected = total => Number((BigInt(guild) >> 22n) % BigInt(total));

    for (const total of [1, 2, 3, 7, 16]) {
        assert.equal(shardOfGuild(guild, total), expected(total), `total ${total}`);
    }

    assert.equal(shardOfGuild(guild, 1), 0, "com um só fragmento tudo cai no 0");

    // o ID pode vir como número ou texto
    assert.equal(shardOfGuild(BigInt(guild), 3), shardOfGuild(guild, 3));

    // exemplo da documentação: 0 << 22 e o salto de 1 << 22 passam para o fragmento seguinte
    assert.equal(shardOfGuild(String(1n << 22n), 3), 1);
    assert.equal(shardOfGuild(String(2n << 22n), 3), 2);
    assert.equal(shardOfGuild(String(3n << 22n), 3), 0);
});

test("DM e eventos sem servidor vão sempre para o fragmento 0, e um total inválido é erro", () => {
    for (const none of [undefined, null, ""]) {
        assert.equal(shardOfGuild(none, 5), 0);
    }

    for (const bad of [0, -1, 1.5, NaN, undefined]) {
        assert.throws(() => shardOfGuild("123", bad), /inteiro maior que zero/);
    }
});

test("o balde do Identify é fragmento % max_concurrency", () => {
    assert.equal(bucketOf(0, 16), 0);
    assert.equal(bucketOf(17, 16), 1);
    assert.equal(bucketOf(5, 1), 0);
    assert.equal(bucketOf(5, 0), 0, "max_concurrency inválido vira 1");
});

test("as ondas de início: até max_concurrency por vez, em ordem (32 com 16 = 0..15 e 16..31)", () => {
    const range = (from, to) => Array.from({ length: to - from + 1 }, (_unused, i) => from + i);

    assert.deepEqual(startupWaves(32, 16), [range(0, 15), range(16, 31)]);
    assert.deepEqual(startupWaves(16, 16), [range(0, 15)], "16 com 16: todos juntos");
    assert.deepEqual(startupWaves(1, 1), [[0]]);
    assert.deepEqual(startupWaves(3, 1), [[0], [1], [2]], "max_concurrency 1: um por vez");
    assert.deepEqual(startupWaves(5, 2), [[0, 1], [2, 3], [4]]);
    assert.deepEqual(startupWaves(2, 16), [[0, 1]]);
    assert.deepEqual(startupWaves(2, undefined), [[0], [1]]);
});

test("HELENA_SHARDS: vazio ou auto segue o Discord; um número força; lixo volta ao automático", () => {
    assert.deepEqual(resolveShardCount({ env: {}, recommended: 1 }), { count: 1, source: "auto", belowRecommended: false, invalid: null });
    assert.equal(resolveShardCount({ env: { HELENA_SHARDS: "auto" }, recommended: 4 }).count, 4);
    assert.equal(resolveShardCount({ env: { HELENA_SHARDS: " AUTO " }, recommended: 4 }).count, 4);

    const forced = resolveShardCount({ env: { HELENA_SHARDS: "3" }, recommended: 1 });

    assert.deepEqual(forced, { count: 3, source: "env", belowRecommended: false, invalid: null });

    const below = resolveShardCount({ env: { HELENA_SHARDS: "2" }, recommended: 4 });

    assert.equal(below.count, 2);
    assert.equal(below.belowRecommended, true, "menos que o recomendado: o bot avisa no log");

    for (const junk of ["0", "-2", "1.5", "muitos", "2000"]) {
        const result = resolveShardCount({ env: { HELENA_SHARDS: junk }, recommended: 2 });

        assert.equal(result.count, 2, junk);
        assert.equal(result.invalid, junk);
    }

    assert.equal(resolveShardCount({ env: {}, recommended: undefined }).count, 1, "sem resposta do Discord: um só");
    assert.equal(resolveShardCount({ env: {}, recommended: 0 }).count, 1);
});

// ==========================================
// O CAMPO shard DO IDENTIFY
// ==========================================

class FakeSocket {
    static OPEN = 1;
    static instances = [];

    constructor(url) {
        this.url = url;
        this.readyState = 1;
        this.sent = [];
        this.handlers = {};

        FakeSocket.instances.push(this);
    }

    on(event, handler) { this.handlers[event] = handler; }
    send(data, callback) { this.sent.push(JSON.parse(data)); callback?.(); }
    close() { this.readyState = 3; }
    terminate() { this.readyState = 3; }
    receive(message) { return this.handlers.message?.(Buffer.from(JSON.stringify(message))); }
}

async function identifyOf(options) {
    FakeSocket.instances.length = 0;

    const gateway = createGateway({ token: "t", WebSocketImpl: FakeSocket, log: quiet, ...options });

    gateway.connect();

    // o HELLO leva ao Identify; o batimento fica longe (1 h) para não atrapalhar
    await FakeSocket.instances[0].receive({ op: 10, d: { heartbeat_interval: 3_600_000 } });

    const identify = FakeSocket.instances[0].sent.find(message => message.op === 2);

    gateway.close();

    return identify.d;
}

test("o Identify leva [id, total] só quando a conexão é um fragmento", async () => {
    const sharded = await identifyOf({ shard: [1, 3] });

    assert.deepEqual(sharded.shard, [1, 3]);
    assert.equal(sharded.token, "t");

    const single = await identifyOf({});

    assert.equal("shard" in single, false, "sem fragmentos o Identify é o de sempre");
});

test("um fragmento inválido é recusado antes de conectar", () => {
    for (const shard of [[3, 3], [-1, 3], [0, 0], [0], [0, 1, 2], "0/1", [0.5, 2], [0, "2"]]) {
        assert.throws(() => createGateway({ token: "t", shard, log: quiet }), /fragmento precisa ser \[id, total\]/, JSON.stringify(shard));
    }
});

// ==========================================
// O GERENTE
// ==========================================

// Um gateway de mentira por fragmento: guarda as opções, as chamadas e dispara os eventos.
function fakeFactory() {
    const made = [];

    const create = options => {
        const fake = {
            options,
            connected: false,
            connects: 0,
            closed: false,
            presences: [],
            failPresence: false,

            connect() { fake.connects++; fake.connected = true; },
            close() { fake.closed = true; fake.connected = false; },

            async setPresence(text) {
                if (fake.failPresence) throw new Error("socket morto");

                fake.presences.push(text);
            }
        };

        made.push(fake);

        return fake;
    };

    return { made, create };
}

function manager(overrides = {}) {
    const factory = fakeFactory();

    const events = [];
    const sleeps = [];

    const result = createShardManager({
        token: "t",
        createGateway: factory.create,
        sleep: async ms => { sleeps.push(ms); },
        log: quiet,
        onShardReady: (id, data) => events.push(["ready", id, data]),
        onShardResumed: id => events.push(["resumed", id]),
        onShardClose: (id, info) => events.push(["close", id, info]),
        onShardFatal: (id, info) => events.push(["fatal", id, info]),
        onDispatch: (name, data, id) => events.push(["dispatch", name, data, id]),
        onLatency: (id, ms) => events.push(["latency", id, ms]),
        ...overrides
    });

    return { ...result, made: factory.made, events, sleeps };
}

test("um fragmento só: uma conexão sem o campo shard, igual a antes", async () => {
    const m = manager({ total: 1 });

    assert.equal(m.made.length, 1);
    assert.equal(m.made[0].options.shard, null);

    await m.start();

    assert.equal(m.made[0].connects, 1);
    assert.deepEqual(m.sleeps, [], "uma onda só: nada de espera");
});

test("vários fragmentos: cada gateway leva o seu [id, total] e o início espera entre as ondas", async () => {
    const m = manager({ total: 5, maxConcurrency: 2, waveDelayMs: 5_500 });

    assert.deepEqual(m.made.map(g => g.options.shard), [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5]]);

    await m.start();

    assert.deepEqual(m.made.map(g => g.connects), [1, 1, 1, 1, 1]);
    assert.deepEqual(m.sleeps, [5_500, 5_500], "duas esperas: três ondas ([0,1] [2,3] [4])");
});

test("as ondas ligam na ordem: a segunda só começa depois da espera da primeira", async () => {
    const order = [];

    const m = manager({
        total: 4,
        maxConcurrency: 2,
        sleep: async () => { order.push(m.made.map(g => g.connects).join("")); }
    });

    await m.start();

    assert.deepEqual(order, ["1100"], "na espera só a primeira onda estava ligada");
    assert.deepEqual(m.made.map(g => g.connects), [1, 1, 1, 1]);
});

test("close() no meio do início para de ligar as ondas seguintes", async () => {
    const m = manager({
        total: 4,
        maxConcurrency: 1,
        sleep: async () => { m.close(); }
    });

    await m.start();

    assert.deepEqual(m.made.map(g => g.connects), [1, 0, 0, 0], "só a primeira onda ligou");
    assert.ok(m.made.every(g => g.closed), "e todos foram fechados");
});

test("os eventos chegam com o número do fragmento e o estado acompanha", () => {
    const m = manager({ total: 3 });

    const [a, b, c] = m.made;

    assert.deepEqual(m.snapshot().map(s => s.status), ["idle", "idle", "idle"]);

    a.options.onReady({ session_id: "x" });
    c.options.onReady({ session_id: "y" });

    assert.equal(m.readyCount(), 2);
    assert.deepEqual(m.snapshot().map(s => s.status), ["ready", "idle", "ready"]);

    b.options.onDispatch("GUILD_CREATE", { id: "1" });

    assert.deepEqual(m.events.filter(e => e[0] === "dispatch"), [["dispatch", "GUILD_CREATE", { id: "1" }, 1]]);
    assert.deepEqual(m.events.filter(e => e[0] === "ready").map(e => e[1]), [0, 2]);

    a.options.onClose({ code: 1006 });

    assert.equal(m.readyCount(), 1);
    assert.equal(m.snapshot()[0].status, "closed");
    assert.deepEqual(m.events.at(-1), ["close", 0, { code: 1006 }]);

    a.options.onResumed();

    assert.equal(m.snapshot()[0].status, "ready", "sessão retomada: volta a conectado");

    b.options.onFatal({ code: 4010, message: "Fragmento inválido" });

    assert.equal(m.snapshot()[1].status, "fatal");
    assert.deepEqual(m.events.at(-1), ["fatal", 1, { code: 4010, message: "Fragmento inválido" }]);
});

test("a latência: a média dos fragmentos que mediram, e a queda esquece a do fragmento", () => {
    const m = manager({ total: 3 });

    assert.equal(m.latency(), null, "ninguém mediu ainda");

    m.made[0].options.onLatency(40);
    m.made[1].options.onLatency(100);

    assert.equal(m.latency(), 70);
    assert.deepEqual(m.events.filter(e => e[0] === "latency"), [["latency", 0, 40], ["latency", 1, 100]]);

    m.made[1].options.onClose({ code: 1006 });

    assert.equal(m.latency(), 40);
});

test("a atividade vai para todos os fragmentos conectados e conta quantos receberam", async () => {
    const m = manager({ total: 3 });

    await m.start();

    m.made[1].connected = false;

    assert.equal(await m.setPresence("Online | hajuda"), 2);
    assert.deepEqual(m.made.map(g => g.presences), [["Online | hajuda"], [], ["Online | hajuda"]]);
});

test("a atividade com um fragmento que falha ainda vale para os outros; todos falhando é erro", async () => {
    const m = manager({ total: 2 });

    await m.start();

    m.made[0].failPresence = true;

    assert.equal(await m.setPresence("oi"), 1);

    m.made[1].failPresence = true;

    await assert.rejects(m.setPresence("oi"), /socket morto/);
});

test("a atividade sem nenhum fragmento conectado é erro claro", async () => {
    const m = manager({ total: 2 });

    assert.equal(m.isConnected(), false);

    await assert.rejects(m.setPresence("oi"), /Gateway não está conectado/);

    await m.start();

    assert.equal(m.isConnected(), true);
});

test("o log de cada fragmento diz de qual veio (e com um só, nada muda)", () => {
    const lines = [];

    const log = { log: (...a) => lines.push(["log", ...a]), warn: (...a) => lines.push(["warn", ...a]), error: (...a) => lines.push(["error", ...a]) };

    const many = manager({ total: 3, log });

    many.made[2].options.log.warn("caiu");

    assert.deepEqual(lines, [["warn", "[FRAGMENTO 2/3]", "caiu"]]);

    lines.length = 0;

    const one = manager({ total: 1, log });

    one.made[0].options.log.warn("caiu");

    assert.deepEqual(lines, [["warn", "caiu"]]);
});

test("o gerente repassa o token, as intenções, a URL e a presença a todos", () => {
    const presence = () => ({ status: "online" });

    const m = manager({ total: 2, intents: 513, url: "wss://exemplo.test", presence });

    for (const gateway of m.made) {
        assert.equal(gateway.options.token, "t");
        assert.equal(gateway.options.intents, 513);
        assert.equal(gateway.options.url, "wss://exemplo.test");
        assert.equal(gateway.options.presence, presence);
    }

    assert.throws(() => createShardManager({ token: "t", total: 0, log: quiet }), /inteiro maior que zero/);
});

test("shardOf do gerente usa o total dele", () => {
    const m = manager({ total: 4 });

    assert.equal(m.shardOf(String(5n << 22n)), 1);
    assert.equal(m.shardOf(undefined), 0);
});

// ==========================================
// SERVIDORES POR FRAGMENTO
// ==========================================

test("o READY de um fragmento refaz só os servidores dele", () => {
    registry.resetGuildRegistry();

    assert.equal(registry.replaceShardGuilds(0, ["10", "11"]), 2);
    assert.equal(registry.replaceShardGuilds(1, [20, 21, 22]), 3, "IDs como número também valem");

    assert.deepEqual([...registry.guildIds].sort(), ["10", "11", "20", "21", "22"]);

    // o fragmento 0 reconecta com uma sessão nova: perdeu o 11 e ganhou o 12
    registry.replaceShardGuilds(0, ["10", "12"]);

    assert.deepEqual([...registry.guildIds].sort(), ["10", "12", "20", "21", "22"], "os do fragmento 1 ficaram intactos");
    assert.deepEqual(registry.guildsByShard(), [[0, 2], [1, 3]]);
    assert.equal(registry.knowsGuild(20), true);
    assert.equal(registry.knowsGuild("11"), false);
});

test("GUILD_CREATE e GUILD_DELETE mexem no fragmento que trouxe o evento", () => {
    registry.resetGuildRegistry();

    registry.replaceShardGuilds(0, ["1"]);
    registry.addShardGuild(1, "2");
    registry.addShardGuild(1, 3);

    assert.deepEqual(registry.guildsByShard(), [[0, 1], [1, 2]]);
    assert.equal(registry.guildIds.size, 3);

    registry.removeShardGuild(1, "2");

    assert.deepEqual(registry.guildsByShard(), [[0, 1], [1, 1]]);
    assert.equal(registry.guildIds.has("2"), false);

    registry.removeShardGuild(1, "999");

    assert.equal(registry.guildIds.size, 2, "remover quem não existe não muda nada");

    registry.resetGuildRegistry();

    assert.equal(registry.guildIds.size, 0);
});

// ==========================================
// O RESUMO E A LATÊNCIA DO /ping
// ==========================================

test("o resumo dos fragmentos: total e conectados, sem passar do total", () => {
    shardRegistry.setShardSummary({ total: 1, ready: 0 });

    assert.deepEqual(shardRegistry.shardSummary(), { total: 1, ready: 0 });

    shardRegistry.setShardSummary({ total: 4, ready: 3 });

    assert.deepEqual(shardRegistry.shardSummary(), { total: 4, ready: 3 });

    shardRegistry.setShardSummary({ ready: 9 });

    assert.deepEqual(shardRegistry.shardSummary(), { total: 4, ready: 4 }, "não conecta mais fragmentos do que existem");

    shardRegistry.setShardSummary({ total: "x", ready: -1 });

    assert.deepEqual(shardRegistry.shardSummary(), { total: 1, ready: 0 });
});

test("a latência do /ping: a média e a pior, um fragmento por vez, e a queda esquece só a dele", () => {
    health.forgetGatewayLatency();

    assert.equal(health.gatewayLatency(), null);
    assert.equal(health.slowestGatewayLatency(), null);

    health.recordGatewayLatency(40, 0);
    health.recordGatewayLatency(120, 1);
    health.recordGatewayLatency(80, 2);

    assert.equal(health.gatewayLatency(), 80);
    assert.equal(health.slowestGatewayLatency(), 120, "o mais lento decide se a conexão está lenta");

    health.forgetGatewayLatency(1);

    assert.equal(health.slowestGatewayLatency(), 80);

    // sem número de fragmento vale o 0, como antes dos fragmentos
    health.forgetGatewayLatency();
    health.recordGatewayLatency(55);

    assert.equal(health.gatewayLatency(), 55);

    health.recordGatewayLatency(NaN);

    assert.equal(health.gatewayLatency(), null, "uma medida inválida apaga a do fragmento");

    health.forgetGatewayLatency();
});
