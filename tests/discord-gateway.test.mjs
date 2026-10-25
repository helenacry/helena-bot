import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// O cliente do gateway do Discord (services/discord/gateway.mjs) contra um WebSocket de mentira:
// identificar, batimento, retomar a sessão, reconectar e parar quando o erro é de configuração.

const { createGateway, INTENTS, DEFAULT_INTENTS, FATAL_CLOSE } = await import("../services/discord/gateway.mjs");

const wait = ms => new Promise(done => setTimeout(done, ms));

const quiet = { log() {}, warn() {}, error() {} };

// A API do pacote "ws" que o gateway usa: on, send, close, terminate e readyState.
class FakeSocket {
    static OPEN = 1;
    static instances = [];

    constructor(url) {
        this.url = url;
        this.readyState = 1;
        this.sent = [];
        this.handlers = {};
        this.terminated = false;

        FakeSocket.instances.push(this);
    }

    on(event, handler) {
        this.handlers[event] = handler;
    }

    send(data, callback) {
        this.sent.push(JSON.parse(data));

        callback?.();
    }

    close(code, reason = "") {
        this.readyState = 3;

        queueMicrotask(() => this.handlers.close?.(code, Buffer.from(reason)));
    }

    terminate() {
        this.terminated = true;
        this.readyState = 3;
    }

    // o que o Discord manda
    receive(message) {
        return this.handlers.message?.(Buffer.from(JSON.stringify(message)));
    }

    hangUp(code) {
        this.readyState = 3;

        this.handlers.close?.(code, Buffer.from(""));
    }

    get ops() {
        return this.sent.map(payload => payload.op);
    }
}

function setup(overrides = {}) {
    FakeSocket.instances = [];

    const calls = { ready: [], resumed: [], dispatch: [], closed: [], fatal: [] };

    const gateway = createGateway({
        token: "segredo",
        WebSocketImpl: FakeSocket,
        url: "wss://gateway.teste",
        log: quiet,
        reconnectDelay: () => 5,
        onReady: data => calls.ready.push(data),
        onResumed: () => calls.resumed.push(true),
        onDispatch: (name, data) => calls.dispatch.push([name, data]),
        onClose: info => calls.closed.push(info.code),
        onFatal: info => calls.fatal.push(info.code),
        ...overrides
    });

    gateway.connect();

    return { gateway, calls, socket: () => FakeSocket.instances.at(-1) };
}

const hello = (socket, interval = 1000) => socket.receive({ op: 10, d: { heartbeat_interval: interval } });

const ready = (socket, extra = {}) => socket.receive({
    op: 0, t: "READY", s: 1,
    d: { session_id: "sessao-1", resume_gateway_url: "wss://retomar.teste", user: { id: "1", username: "Helena" }, guilds: [{ id: "10" }], ...extra }
});

// ==========================================
// IDENTIFICAR
// ==========================================

test("as intenções pedem servidores, mensagens e o texto das mensagens (o prefixo h)", () => {
    assert.equal(DEFAULT_INTENTS, INTENTS.GUILDS | INTENTS.GUILD_MESSAGES | INTENTS.MESSAGE_CONTENT);
    assert.equal(DEFAULT_INTENTS, 33281);
    assert.equal(INTENTS.MESSAGE_CONTENT, 32768);
});

test("sem token não conecta", () => {
    assert.throws(() => createGateway({ token: "" }), /DISCORD_BOT_TOKEN/);
});

test("conecta na v10 em JSON e, ao receber o HELLO, se identifica com o token e as intenções", async () => {
    const { socket, gateway } = setup();

    assert.equal(socket().url, "wss://gateway.teste/?v=10&encoding=json");

    await hello(socket());

    const identify = socket().sent.find(payload => payload.op === 2);

    assert.equal(identify.d.token, "segredo");
    assert.equal(identify.d.intents, DEFAULT_INTENTS);
    assert.equal(identify.d.properties.browser, "helena");

    gateway.close();
});

test("a presença inicial vai junto da identificação", async () => {
    const presence = { status: "online", activities: [{ type: 4, name: "Custom Status", state: "oi" }], since: null, afk: false };

    const { socket, gateway } = setup({ presence: () => presence });

    await hello(socket());

    assert.deepEqual(socket().sent.find(payload => payload.op === 2).d.presence, presence);

    gateway.close();
});

test("READY chama onReady com os dados; os outros eventos chegam em onDispatch", async () => {
    const { socket, calls, gateway } = setup();

    await hello(socket());
    await ready(socket());

    assert.equal(calls.ready.length, 1);
    assert.equal(calls.ready[0].user.username, "Helena");
    assert.deepEqual(calls.ready[0].guilds, [{ id: "10" }]);

    await socket().receive({ op: 0, t: "MESSAGE_CREATE", s: 2, d: { id: "9", content: "hdaily" } });
    await socket().receive({ op: 0, t: "GUILD_CREATE", s: 3, d: { id: "11" } });

    assert.deepEqual(calls.dispatch.map(([name]) => name), ["MESSAGE_CREATE", "GUILD_CREATE"]);
    assert.equal(calls.dispatch[0][1].content, "hdaily");

    gateway.close();
});

test("um erro no tratador de um evento não derruba a conexão", async () => {
    const errors = [];

    const { socket, gateway } = setup({
        onDispatch: () => { throw new Error("falhou"); },
        log: { ...quiet, error: (...args) => errors.push(args) }
    });

    await hello(socket());
    await socket().receive({ op: 0, t: "MESSAGE_CREATE", s: 2, d: {} });

    assert.equal(errors.length, 1);
    assert.equal(socket().readyState, 1, "continua conectado");

    gateway.close();
});

// ==========================================
// BATIMENTO
// ==========================================

test("batimento: manda o último número de sequência e confere a resposta", async () => {
    const random = Math.random;

    Math.random = () => 0;

    try {
        const { socket, gateway } = setup();

        await hello(socket(), 15);
        await socket().receive({ op: 0, t: "MESSAGE_CREATE", s: 7, d: {} });

        await wait(8);

        const beat = socket().sent.filter(payload => payload.op === 1).at(-1);

        assert.equal(beat.d, 7, "o batimento carrega a sequência");

        await socket().receive({ op: 11 });

        // espera o próximo batimento (sem prazo fixo, para não depender da velocidade da máquina)
        for (let i = 0; i < 40 && socket().sent.filter(payload => payload.op === 1).length < 2; i++) {
            await wait(10);
        }

        assert.ok(socket().sent.filter(payload => payload.op === 1).length >= 2, "continua batendo depois da resposta");
        assert.equal(socket().readyState, 1);

        gateway.close();

    } finally {
        Math.random = random;
    }
});

test("batimento sem resposta: fecha a conexão para reconectar (a conexão morreu sem avisar)", async () => {
    const random = Math.random;

    Math.random = () => 0;

    try {
        const { socket, gateway } = setup();

        await hello(socket(), 10);

        // não responde ao primeiro batimento: espera a conexão nova (sem prazo fixo)
        for (let i = 0; i < 100 && FakeSocket.instances.length < 2; i++) {
            await wait(10);
        }

        assert.ok(FakeSocket.instances.length >= 2, "abriu uma conexão nova");

        gateway.close();

    } finally {
        Math.random = random;
    }
});

test("se o Discord pede um batimento agora, ele responde na hora", async () => {
    const { socket, gateway } = setup();

    await hello(socket());
    await socket().receive({ op: 0, t: "X", s: 4, d: {} });
    await socket().receive({ op: 1 });

    assert.deepEqual(socket().sent.filter(payload => payload.op === 1).at(-1), { op: 1, d: 4 });

    gateway.close();
});

// ==========================================
// RETOMAR E RECONECTAR
// ==========================================

test("a conexão cai: reconecta no endereço de retomada e manda RESUME com a sessão e a sequência", async () => {
    const { socket, calls, gateway } = setup();

    await hello(socket());
    await ready(socket());
    await socket().receive({ op: 0, t: "MESSAGE_CREATE", s: 5, d: {} });

    const first = socket();

    first.hangUp(1006);

    assert.deepEqual(calls.closed, [1006]);

    await wait(20);

    const second = socket();

    assert.notEqual(second, first);
    assert.equal(second.url, "wss://retomar.teste/?v=10&encoding=json");

    await hello(second);

    const resume = second.sent.find(payload => payload.op === 6);

    assert.deepEqual(resume.d, { token: "segredo", session_id: "sessao-1", seq: 5 });
    assert.equal(second.sent.some(payload => payload.op === 2), false, "não se identifica de novo");

    gateway.close();
});

test("RESUMED zera as tentativas e não chama onReady de novo", async () => {
    const { socket, calls, gateway } = setup();

    await hello(socket());
    await ready(socket());

    socket().hangUp(1006);

    await wait(20);
    await hello(socket());
    await socket().receive({ op: 0, t: "RESUMED", s: 6, d: {} });

    assert.equal(calls.ready.length, 1);
    assert.equal(calls.dispatch.length, 0, "RESUMED não é um evento do jogo");

    // quem usa o gateway fica sabendo: depois de uma queda (onClose) e sem READY novo, é o único aviso
    // para religar o que o onClose desligou (a rotação de status e os contadores)
    assert.equal(calls.resumed.length, 1);
    assert.deepEqual(calls.closed, [1006]);

    gateway.close();
});

test("o Discord manda reconectar (op 7): fecha e retoma", async () => {
    const { socket, gateway } = setup();

    await hello(socket());
    await ready(socket());

    const first = socket();

    await first.receive({ op: 7 });
    await wait(25);

    assert.notEqual(socket(), first);

    await hello(socket());

    assert.ok(socket().sent.some(payload => payload.op === 6), "retoma");

    gateway.close();
});

test("sessão inválida: com d=true retoma; com d=false esquece a sessão e se identifica de novo", async () => {
    const resumable = setup();

    await hello(resumable.socket());
    await ready(resumable.socket());
    await resumable.socket().receive({ op: 9, d: true });
    await wait(25);
    await hello(resumable.socket());

    assert.ok(resumable.socket().sent.some(payload => payload.op === 6));

    resumable.gateway.close();

    const lost = setup();

    await hello(lost.socket());
    await ready(lost.socket());
    await lost.socket().receive({ op: 9, d: false });
    await wait(25);

    assert.equal(lost.socket().url, "wss://gateway.teste/?v=10&encoding=json", "volta ao endereço normal");

    await hello(lost.socket());

    assert.ok(lost.socket().sent.some(payload => payload.op === 2), "identifica");
    assert.equal(lost.socket().sent.some(payload => payload.op === 6), false);

    lost.gateway.close();
});

test("fechamento 4009 (sessão expirou) começa uma sessão nova", async () => {
    const { socket, gateway } = setup();

    await hello(socket());
    await ready(socket());

    socket().hangUp(4009);

    await wait(20);
    await hello(socket());

    assert.ok(socket().sent.some(payload => payload.op === 2));
    assert.equal(socket().sent.some(payload => payload.op === 6), false);

    gateway.close();
});

test("erro de configuração (4004 token, 4014 intenção) não reconecta: avisa o motivo", async () => {
    for (const code of [4004, 4014]) {
        const { socket, calls } = setup();

        const before = FakeSocket.instances.length;

        socket().hangUp(code);

        await wait(30);

        assert.deepEqual(calls.fatal, [code]);
        assert.equal(FakeSocket.instances.length, before, `${code} não pode reconectar`);
    }

    assert.match(FATAL_CLOSE[4014], /Message Content Intent/);
    assert.match(FATAL_CLOSE[4004], /DISCORD_BOT_TOKEN/);
});

test("close() fecha de vez: sem reconexão depois", async () => {
    const { socket, gateway, calls } = setup();

    await hello(socket());
    await ready(socket());

    const current = socket();

    gateway.close();

    assert.equal(current.terminated, true);

    await wait(30);

    assert.equal(FakeSocket.instances.length, 1);
    assert.deepEqual(calls.fatal, []);
});

// ==========================================
// PRESENÇA
// ==========================================

test("presença: status personalizado de até 128 caracteres", async () => {
    const { socket, gateway } = setup();

    await hello(socket());
    await gateway.setPresence("x".repeat(200));

    const payload = socket().sent.filter(item => item.op === 3).at(-1);

    assert.equal(payload.d.status, "online");
    assert.equal(payload.d.activities[0].type, 4);
    assert.equal(payload.d.activities[0].state.length, 128);
    assert.equal(payload.d.since, null);

    gateway.close();
});

test("enviar sem conexão avisa com erro claro", async () => {
    const { socket, gateway } = setup();

    socket().readyState = 3;

    await assert.rejects(() => gateway.send({ op: 1 }), /não está conectado/);

    gateway.close();
});
