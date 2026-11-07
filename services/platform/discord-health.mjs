
import { db } from "../../database/connection.mjs";

// ==========================================
// SAÚDE DA CONEXÃO COM O DISCORD (/ping)
// ==========================================

// O /ping mede o que está do lado da Helena e o que está do lado do Discord e diz de quem é a
// lentidão. helena.mjs liga as duas pontas que só ele conhece: a latência do gateway (o tempo de
// ida e volta do último batimento) e uma chamada leve à API. Sem elas (o bot de teste, o modo
// só-site) o /ping mostra o que consegue e diz que falta a medida.

// uma medida por fragmento (a Helena usa um só até o Discord pedir mais)
const gatewayLatencies = new Map();

let apiProbe = null;

// O gateway chama isto a cada batimento respondido.
export function recordGatewayLatency(ms, shardId = 0) {
    if (Number.isFinite(ms)) {
        gatewayLatencies.set(shardId, ms);

    } else {
        gatewayLatencies.delete(shardId);
    }
}

// Quando um fragmento cai, a medida antiga dele não vale mais (sem número: esquece todas).
export function forgetGatewayLatency(shardId) {
    if (shardId === undefined) {
        gatewayLatencies.clear();

    } else {
        gatewayLatencies.delete(shardId);
    }
}

// A média das medidas conhecidas, ou null se ainda não há nenhuma.
export function gatewayLatency() {
    const known = [...gatewayLatencies.values()];

    return known.length
        ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length)
        : null;
}

// A pior medida (o fragmento mais lento): é ela que decide se a conexão está lenta.
export function slowestGatewayLatency() {
    const known = [...gatewayLatencies.values()];

    return known.length ? Math.max(...known) : null;
}

// fn: () => Promise, uma chamada barata e autenticada à API (GET /users/@me).
export function setApiProbe(fn) {
    apiProbe = typeof fn === "function" ? fn : null;
}

// ==========================================
// MEDIDAS
// ==========================================

// Mede a API uma vez a cada 10 segundos, não importa quantas pessoas apertem Atualizar.
const PROBE_CACHE_MS = 10_000;
const PROBE_TIMEOUT_MS = 2_000;

let lastProbe = null;

// ms da chamada, ou -1 se a API falhou, ou null se não há como medir.
export async function probeApi({ now = Date.now(), force = false } = {}) {
    if (!apiProbe) {
        return null;
    }

    if (!force && lastProbe && now - lastProbe.at < PROBE_CACHE_MS) {
        return lastProbe.ms;
    }

    const started = performance.now();

    let ms;

    let timer;

    try {
        // o Discord dá 3 segundos para responder ao comando: uma API que não responde em 2 s
        // conta como o tempo que esperamos (e como lenta), sem segurar o /ping
        const timeout = new Promise(done => {
            timer = setTimeout(done, PROBE_TIMEOUT_MS, "timeout");
        });

        const outcome = await Promise.race([apiProbe().then(() => "ok"), timeout]);

        ms = outcome === "ok" ? Math.round(performance.now() - started) : PROBE_TIMEOUT_MS;

    } catch {
        ms = -1;

    } finally {
        clearTimeout(timer);
    }

    lastProbe = { at: now, ms };

    return ms;
}

export function resetProbeCache() {
    lastProbe = null;
}

// Média de 5 consultas triviais ao banco, em ms (uma casa decimal).
export function databaseLatency(runs = 5) {
    const statement = db.prepare("SELECT 1");

    const started = performance.now();

    for (let i = 0; i < runs; i++) {
        statement.get();
    }

    return Math.round(((performance.now() - started) / runs) * 10) / 10;
}

// Quanto a fila de tarefas do processo demora a devolver a vez: se o processo está
// sobrecarregado (ou travado numa conta pesada), este número sobe.
export async function loopLag() {
    const started = performance.now();

    await new Promise(done => setTimeout(done, 0));

    return Math.max(0, Math.round(performance.now() - started - 1));
}

// Há quantos ms o Discord criou esta interação (ou mensagem): o ID é um snowflake, que leva a
// hora de criação nos bits mais altos. Mede a viagem do pedido até a Helena, mais a fila dela.
const DISCORD_EPOCH = 1_420_070_400_000n;

export function snowflakeAge(id, now = Date.now()) {
    try {
        const created = Number((BigInt(String(id)) >> 22n) + DISCORD_EPOCH);

        // relógio fora de hora ou ID inventado: sem medida, em vez de um número absurdo
        const age = now - created;

        return age >= 0 && age < 60_000 ? Math.round(age) : null;

    } catch {
        return null;
    }
}

// ==========================================
// DE QUEM É A LENTIDÃO
// ==========================================

// O que passa disso é lento. Os valores são de quem usa o bot: um comando que demora mais
// de um segundo para chegar já se nota no chat.
export const PING_LIMITS = Object.freeze({
    gateway: 500,
    api: 1200,
    trip: 1500,
    database: 150,
    loop: 200
});

// medidas: { gateway, api, trip, database, loop } (null = sem medida, api -1 = falhou)
// status: { indicator } do discordstatus.com, ou null se não deu para ler.
// Devolve quem está lento: "none", "helena", "discord" ou "both", e os motivos.
export function diagnose(measures, status = null) {
    const { gateway = null, api = null, trip = null, database = null, loop = null } = measures;

    const helena = [];
    const discord = [];

    if (database !== null && database > PING_LIMITS.database) {
        helena.push("banco de dados");
    }

    if (loop !== null && loop > PING_LIMITS.loop) {
        helena.push("fila de tarefas");
    }

    if (gateway !== null && gateway > PING_LIMITS.gateway) {
        discord.push("conexão");
    }

    if (api === -1) {
        discord.push("API fora do ar");

    } else if (api !== null && api > PING_LIMITS.api) {
        discord.push("API");
    }

    // a viagem do comando só acusa o Discord quando o resto da Helena está bem: com o
    // processo sobrecarregado, ela mesma atrasa o pedido
    if (trip !== null && trip > PING_LIMITS.trip && helena.length === 0) {
        discord.push("entrega dos comandos");
    }

    if (status && status.indicator && status.indicator !== "none") {
        discord.push("incidente no status");
    }

    const source = helena.length && discord.length
        ? "both"
        : helena.length
            ? "helena"
            : discord.length
                ? "discord"
                : "none";

    return { source, helena, discord };
}
