import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// O /ping: as medidas (gateway, API, chegada do comando, banco, fila de tarefas), o status público
// do Discord e o veredito de quem está lento.

const health = await import("../services/platform/discord-health.mjs");
const status = await import("../services/platform/discord-status.mjs");
const { buildPingView, handlePingClick } = await import("../services/panels/ping-panel.mjs");
const { handlePanelClick } = await import("../services/panels/panels.mjs");
const { carregarComandos } = await import("../command-registry.mjs");

const { diagnose, PING_LIMITS } = health;

const quietly = async fn => {
    const log = console.log;
    console.log = () => {};

    try { return await fn(); } finally { console.log = log; }
};

const comandos = await quietly(() => carregarComandos());

// um ID de interação "criado" há ms milissegundos
const DISCORD_EPOCH = 1_420_070_400_000n;
const snowflakeOf = (ms, now = Date.now()) => String((BigInt(now - ms) - DISCORD_EPOCH) << 22n);

const descriptionOf = view => view.embed.description ?? view.embed.data?.description ?? "";

const reset = () => {
    health.forgetGatewayLatency();
    health.setApiProbe(null);
    health.resetProbeCache();
    status.resetStatusCache();
};

// ==========================================
// O VEREDITO
// ==========================================

test("diagnose: ninguém, a Helena, o Discord ou os dois", () => {
    const fine = { gateway: 80, api: 150, trip: 200, database: 0.4, loop: 1 };

    assert.equal(diagnose(fine).source, "none");

    assert.deepEqual(diagnose({ ...fine, database: 400 }), { source: "helena", helena: ["banco de dados"], discord: [] });
    assert.deepEqual(diagnose({ ...fine, loop: 900 }).helena, ["fila de tarefas"]);

    assert.deepEqual(diagnose({ ...fine, gateway: 900 }), { source: "discord", helena: [], discord: ["conexão"] });
    assert.deepEqual(diagnose({ ...fine, api: 3000 }).discord, ["API"]);
    assert.deepEqual(diagnose({ ...fine, api: -1 }).discord, ["API fora do ar"]);

    assert.equal(diagnose({ ...fine, database: 400, gateway: 900 }).source, "both");
});

test("diagnose: o limite exato ainda é normal, e sem medida não acusa ninguém", () => {
    assert.equal(diagnose({ gateway: PING_LIMITS.gateway, api: PING_LIMITS.api, database: PING_LIMITS.database, loop: PING_LIMITS.loop }).source, "none");
    assert.equal(diagnose({ gateway: PING_LIMITS.gateway + 1 }).source, "discord");

    assert.equal(diagnose({}).source, "none");
    assert.equal(diagnose({ gateway: null, api: null, trip: null, database: null, loop: null }).source, "none");
});

test("diagnose: a chegada lenta do comando só é culpa do Discord se a Helena está bem", () => {
    assert.deepEqual(diagnose({ trip: 3000, database: 1, loop: 1 }), { source: "discord", helena: [], discord: ["entrega dos comandos"] });

    // com o processo sobrecarregado, ela mesma atrasa o pedido: a culpa é dela
    assert.deepEqual(diagnose({ trip: 3000, loop: 900 }), { source: "helena", helena: ["fila de tarefas"], discord: [] });
});

test("diagnose: um incidente no status do Discord conta, mesmo com as medidas boas", () => {
    const fine = { gateway: 80, api: 150, database: 0.4, loop: 1 };

    assert.equal(diagnose(fine, { indicator: "none" }).source, "none");
    assert.deepEqual(diagnose(fine, { indicator: "minor" }), { source: "discord", helena: [], discord: ["incidente no status"] });
    assert.equal(diagnose(fine, null).source, "none", "sem poder ler o status, vale o que foi medido");
});

// ==========================================
// MEDIDAS
// ==========================================

test("snowflakeAge: a hora de criação do ID vira há quantos ms, e ID estranho vira null", () => {
    const now = 1_800_000_000_000;

    assert.equal(snowflakeAgeOf(snowflakeOf(350, now), now), 350);

    assert.equal(health.snowflakeAge("abc"), null);
    assert.equal(health.snowflakeAge(undefined), null);
    assert.equal(health.snowflakeAge("1"), null, "uma data de 2015 não é uma interação de agora");
    assert.equal(snowflakeAgeOf(snowflakeOf(-5000, now), now), null, "do futuro: relógio fora de hora");
});

const snowflakeAgeOf = (id, now) => health.snowflakeAge(id, now);

test("probeApi: mede, guarda por 10 s, conta a falha e não segura o comando", async () => {
    reset();

    assert.equal(await health.probeApi(), null, "sem sonda ligada, sem medida");

    let calls = 0;

    health.setApiProbe(async () => { calls++; });

    const first = await health.probeApi({ now: 1_000 });

    assert.ok(first >= 0 && first < 500);
    assert.equal(calls, 1);

    assert.equal(await health.probeApi({ now: 5_000 }), first, "a medida de 4 s atrás vale");
    assert.equal(calls, 1);

    await health.probeApi({ now: 12_000 });
    assert.equal(calls, 2, "passados 10 s mede de novo");

    await health.probeApi({ now: 12_100, force: true });
    assert.equal(calls, 3, "Atualizar força uma medida nova");

    health.resetProbeCache();
    health.setApiProbe(async () => { throw new Error("fora do ar"); });

    assert.equal(await health.probeApi({ now: 50_000 }), -1, "falha da API = -1");

    health.resetProbeCache();
    health.setApiProbe(() => new Promise(() => {}));

    const started = Date.now();

    assert.equal(await health.probeApi({ now: 90_000 }), 2_000, "uma API que não responde conta o tempo de espera");
    assert.ok(Date.now() - started < 3_000, "e o /ping não espera mais que isso");

    reset();
});

test("databaseLatency e loopLag devolvem números pequenos e válidos", async () => {
    const database = health.databaseLatency();

    assert.ok(database >= 0 && database < PING_LIMITS.database, `banco ${database} ms`);
    assert.ok(Number.isInteger(await health.loopLag()));
});

// ==========================================
// STATUS DO DISCORD
// ==========================================

const summary = (indicator, incidents = []) => ({
    status: { indicator, description: indicator === "none" ? "All Systems Operational" : "Partial System Outage" },
    incidents
});

test("parseStatus: só aceita o formato conhecido e limpa o texto que vem de fora", () => {
    assert.equal(status.parseStatus(null), null);
    assert.equal(status.parseStatus({ status: { indicator: "banana" } }), null);

    const parsed = status.parseStatus(summary("minor", [
        { name: "Delays <b>in</b> messages\n‮ 🔥", impact: "major" },
        { name: "", impact: "minor" },
        { name: "Voz", impact: "inventado" }
    ]));

    assert.equal(parsed.indicator, "minor");
    assert.deepEqual(parsed.incidents, [
        { name: "Delays bin/b messages", impact: "major" },
        { name: "Voz", impact: "minor" }
    ]);

    assert.equal(status.parseStatus(summary("none")).incidents.length, 0);
});

test("discordStatus: lê, guarda por 1 minuto, força a releitura e engole a falha", async () => {
    status.resetStatusCache();

    let calls = 0;

    const ok = async () => { calls++; return { ok: true, json: async () => summary("none") }; };

    assert.equal((await status.discordStatus({ fetchImpl: ok, now: 1_000, env: {} })).indicator, "none");
    await status.discordStatus({ fetchImpl: ok, now: 30_000, env: {} });
    assert.equal(calls, 1, "30 s depois ainda vale");

    await status.discordStatus({ fetchImpl: ok, now: 70_000, env: {} });
    assert.equal(calls, 2, "passado 1 minuto lê de novo");

    await status.discordStatus({ fetchImpl: ok, now: 70_500, env: {}, force: true });
    assert.equal(calls, 3, "Atualizar força");

    status.resetStatusCache();

    const broken = async () => { throw new Error("sem internet"); };

    assert.equal(await status.discordStatus({ fetchImpl: broken, now: 1_000, env: {} }), null);

    // a falha também fica guardada, para não esperar de novo a cada clique
    assert.equal(await status.discordStatus({ fetchImpl: ok, now: 2_000, env: {} }), null);

    status.resetStatusCache();

    const notOk = async () => ({ ok: false, json: async () => ({}) });

    assert.equal(await status.discordStatus({ fetchImpl: notOk, now: 1_000, env: {} }), null);

    status.resetStatusCache();
});

test("HELENA_DISCORD_STATUS=off desliga a leitura e nunca chama a internet", async () => {
    status.resetStatusCache();

    let calls = 0;

    const spy = async () => { calls++; return { ok: true, json: async () => summary("none") }; };

    assert.equal(status.statusEnabled({}), true);
    assert.equal(status.statusEnabled({ HELENA_DISCORD_STATUS: " OFF " }), false);
    assert.equal(status.statusEnabled({ HELENA_DISCORD_STATUS: "on" }), true);

    assert.equal(await status.discordStatus({ fetchImpl: spy, env: { HELENA_DISCORD_STATUS: "off" } }), null);
    assert.equal(calls, 0);

    // os testes rodam com a leitura desligada: nenhum deles sai da máquina
    assert.equal(status.statusEnabled(), false);
});

// ==========================================
// O PAINEL
// ==========================================

const receipt = view => Object.fromEntries(
    descriptionOf(view)
        .split("\n")
        .map(line => /^[^|]*\|\s*([^:]+):\s*\*\*(.+)\*\*$/.exec(line) ?? /^\s*([^:]+):\s*\*\*(.+)\*\*$/.exec(line))
        .filter(Boolean)
        .map(match => [match[1].trim(), match[2].trim()])
);

test("o painel com tudo normal: as cinco medidas, o status e o botão Atualizar", async () => {
    reset();

    health.recordGatewayLatency(42);
    health.setApiProbe(async () => {});

    const view = await buildPingView({ id: snowflakeOf(120) });

    assert.equal(view.verdict.source, "none");
    assert.match(descriptionOf(view), /^Está tudo normal/);

    assert.equal(view.measures.gateway, 42);
    assert.ok(view.measures.trip >= 100 && view.measures.trip < 5_000, `chegada ${view.measures.trip}`);

    const rows = receipt(view);

    assert.equal(rows["Conexão com o Discord"], "42 ms");
    assert.match(rows["API do Discord"], /^\d+ ms$/);
    assert.match(rows["Chegada do comando"], /^\d+ ms$/);
    assert.match(rows["Banco de dados"], /^[\d,]+ ms$/);
    assert.match(rows["Fila de tarefas"], /^\d+ ms$/);
    assert.equal(rows["Status do Discord"], "sem informação", "leitura desligada nos testes");
    assert.match(rows["No ar há"], /\d+s/);

    const [buttons] = view.components;

    assert.equal(buttons.components[0].customId, "ping:ref");
    assert.equal(buttons.components[0].label, "Atualizar");
    assert.equal(buttons.components[1].style, "link");
    assert.equal(buttons.components[1].url, "https://discordstatus.com");

    reset();
});

test("o painel diz que a lentidão é do Discord quando a conexão ou a API estão devagar", async () => {
    reset();

    health.recordGatewayLatency(950);
    health.setApiProbe(async () => {});

    const view = await buildPingView({ id: snowflakeOf(120) });

    assert.equal(view.verdict.source, "discord");
    assert.match(descriptionOf(view), /A lentidão vem do \*\*Discord\*\*/);
    assert.equal(receipt(view)["Conexão com o Discord"], "950 ms (lento)");

    health.recordGatewayLatency(40);
    health.setApiProbe(async () => { throw new Error("401"); });

    const down = await buildPingView({ id: snowflakeOf(120) }, { force: true });

    assert.equal(receipt(down)["API do Discord"], "falhou");
    assert.equal(down.verdict.source, "discord");

    reset();
});

test("sem gateway nem API ligados (bot de teste), o painel mostra o que mede e diz que falta o resto", async () => {
    reset();

    const view = await buildPingView({ id: "nao-e-snowflake" });

    const rows = receipt(view);

    assert.equal(rows["Conexão com o Discord"], "sem medida");
    assert.equal(rows["API do Discord"], "sem medida");
    assert.equal(rows["Chegada do comando"], "sem medida");
    assert.equal(view.verdict.source, "none");
});

test("o botão Atualizar mede de novo, para qualquer pessoa, trocando a mensagem", async () => {
    reset();

    let calls = 0;

    health.setApiProbe(async () => { calls++; });

    await buildPingView({ id: snowflakeOf(50) });
    assert.equal(calls, 1);

    const click = (userId, id = snowflakeOf(60)) => ({
        id, guildId: "g", channelId: "c", user: { id: userId, username: "x" }, data: { customId: "ping:ref" }
    });

    const refreshed = await handlePanelClick(click("111111111111111111"));

    assert.equal(refreshed.type, "update");
    assert.equal(calls, 2, "o clique ignora a medida guardada");
    assert.ok(refreshed.data.components[0].components.some(component => component.customId === "ping:ref"));

    const other = await handlePanelClick(click("222222222222222222"));

    assert.equal(other.type, "update", "o painel é de status: não tem dono");

    assert.equal(await handlePingClick({ data: { customId: "ping:outra" } }), null);

    reset();
});

test("o comando /ping devolve o painel como mensagem pública com os botões", async () => {
    reset();

    const response = await comandos.get("ping").execute({ id: snowflakeOf(80), guildId: "g", user: { id: "1" }, data: {} });

    assert.equal(response.type, "message");
    assert.notEqual(response.data.ephemeral, true, "o /ping é público, como sempre foi");
    assert.equal(response.data.embeds.length, 1);
    assert.match(response.data.embeds[0].title, /Pong/);
    assert.equal(response.data.components[0].components[0].customId, "ping:ref");
});
