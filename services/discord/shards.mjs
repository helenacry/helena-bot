
import { createGateway as createRealGateway } from "./gateway.mjs";

// ==========================================
// FRAGMENTOS (SHARDS) DO GATEWAY
// ==========================================

// Cada conexão com o gateway aguenta no máximo 2500 servidores. Passou disso, o Discord exige
// fragmentos: várias conexões, cada uma com uma parte dos servidores. Aqui ficam as regras da
// documentação (https://docs.discord.com/developers/events/gateway#sharding) e o gerente que
// liga todas as conexões num processo só (o banco SQLite é um arquivo, então é um processo só).
//
//   o fragmento de um servidor      (guild_id >> 22) % total
//   eventos sem servidor (DM...)    sempre o fragmento 0
//   o campo "shard" do Identify     [id, total]
//   quantos fragmentos usar         GET /gateway/bot (campo "shards"), ou HELENA_SHARDS
//   limite de identificações        max_concurrency por 5 s; o balde de um fragmento é id % max_concurrency
//
// Com 3 servidores, o Discord recomenda 1 fragmento e tudo funciona como sempre. A conta só
// muda quando o bot cresce: nada precisa ser mexido nesse dia.

export const MAX_GUILDS_PER_SHARD = 2500;

// O Discord conta o Identify em janelas de 5 s; a folga evita cair na janela errada por um fio.
export const IDENTIFY_WINDOW_MS = 5_000;

const DISCORD_EPOCH_SHIFT = 22n;

export function shardOfGuild(guildId, total) {
    if (!Number.isInteger(total) || total < 1) {
        throw new Error("O total de fragmentos precisa ser um inteiro maior que zero.");
    }

    // DM, assinatura e o que não tem servidor: o fragmento 0
    if (guildId === undefined || guildId === null || guildId === "") {
        return 0;
    }

    return Number((BigInt(String(guildId)) >> DISCORD_EPOCH_SHIFT) % BigInt(total));
}

export const bucketOf = (shardId, maxConcurrency) => shardId % Math.max(1, maxConcurrency);

// Os fragmentos entram em ondas de até max_concurrency, por ordem de balde:
// 32 fragmentos com max_concurrency 16 = [0..15] e depois [16..31].
export function startupWaves(total, maxConcurrency = 1) {
    const size = Math.max(1, Math.floor(maxConcurrency) || 1);

    const waves = [];

    for (let first = 0; first < total; first += size) {
        waves.push(Array.from({ length: Math.min(size, total - first) }, (_unused, offset) => first + offset));
    }

    return waves;
}

// HELENA_SHARDS vazio ou "auto": o número que o Discord recomenda. Um número: força esse total
// (para testar, ou porque o Discord pediu um múltiplo). Menos que o recomendado é arriscado:
// uma conexão com mais de 2500 servidores é fechada (código 4011).
export function resolveShardCount({ env = process.env, recommended = 1 } = {}) {
    const fallback = Number.isInteger(recommended) && recommended >= 1 ? recommended : 1;

    const raw = String(env.HELENA_SHARDS ?? "").trim().toLowerCase();

    if (raw === "" || raw === "auto") {
        return { count: fallback, source: "auto", belowRecommended: false, invalid: null };
    }

    const wanted = Number(raw);

    if (!Number.isInteger(wanted) || wanted < 1 || wanted > 1024) {
        return { count: fallback, source: "auto", belowRecommended: false, invalid: raw };
    }

    return { count: wanted, source: "env", belowRecommended: wanted < fallback, invalid: null };
}

// ==========================================
// O GERENTE
// ==========================================

const sleepFor = ms => new Promise(done => setTimeout(done, ms));

// Cria um gateway por fragmento e os liga em ondas. Quem usa recebe os eventos de todos com o
// número do fragmento que os trouxe:
//
//   onShardReady(id, dados)   onShardResumed(id)   onShardClose(id, { code })
//   onShardFatal(id, info)    onDispatch(nome, dados, id)   onLatency(id, ms)
export function createShardManager({
    token,
    total = 1,
    maxConcurrency = 1,
    url,
    intents,
    presence = () => null,

    createGateway = createRealGateway,
    sleep = sleepFor,
    waveDelayMs = IDENTIFY_WINDOW_MS + 500,
    log = console,

    onShardReady = () => {},
    onShardResumed = () => {},
    onShardClose = () => {},
    onShardFatal = () => {},
    onDispatch = () => {},
    onLatency = () => {}
} = {}) {
    if (!Number.isInteger(total) || total < 1) {
        throw new Error("O total de fragmentos precisa ser um inteiro maior que zero.");
    }

    // com vários fragmentos, cada linha de log diz de qual veio
    const logFor = id => total === 1
        ? log
        : {
            log: (...args) => log.log(`[FRAGMENTO ${id}/${total}]`, ...args),
            warn: (...args) => log.warn(`[FRAGMENTO ${id}/${total}]`, ...args),
            error: (...args) => log.error(`[FRAGMENTO ${id}/${total}]`, ...args)
        };

    // idle: ainda não ligou · connecting · ready · closed (caiu, vai reconectar) · fatal (erro de configuração)
    const state = Array.from({ length: total }, (_unused, id) => ({ id, status: "idle", latency: null }));

    const gateways = [];

    let closing = false;

    for (const entry of state) {
        gateways.push(createGateway({
            token,
            intents,
            presence,
            url,
            log: logFor(entry.id),
            shard: total === 1 ? null : [entry.id, total],

            onReady: data => {
                entry.status = "ready";

                return onShardReady(entry.id, data);
            },

            onResumed: () => {
                entry.status = "ready";

                return onShardResumed(entry.id);
            },

            onLatency: ms => {
                entry.latency = ms;

                onLatency(entry.id, ms);
            },

            onDispatch: (name, data) => onDispatch(name, data, entry.id),

            onClose: info => {
                entry.status = "closed";
                entry.latency = null;

                onShardClose(entry.id, info);
            },

            onFatal: info => {
                entry.status = "fatal";

                onShardFatal(entry.id, info);
            }
        }));
    }

    return {
        total,
        maxConcurrency,
        gateways,

        // Liga os fragmentos em ondas: dentro de uma onda tudo junto, entre ondas uma janela de
        // identificação inteira (o Discord recusa o Identify que passa de max_concurrency por 5 s).
        async start() {
            const waves = startupWaves(total, maxConcurrency);

            for (const [index, wave] of waves.entries()) {
                if (closing) {
                    return;
                }

                for (const id of wave) {
                    state[id].status = "connecting";

                    gateways[id].connect();
                }

                if (index < waves.length - 1) {
                    await sleep(waveDelayMs);
                }
            }
        },

        // A atividade do bot (o texto embaixo do nome) vai para todos os fragmentos conectados.
        // Devolve quantos receberam; sem nenhum conectado, é erro.
        async setPresence(text) {
            const live = gateways.filter(gateway => gateway.connected);

            if (live.length === 0) {
                throw new Error("Gateway não está conectado.");
            }

            const results = await Promise.allSettled(live.map(gateway => gateway.setPresence(text)));

            const sent = results.filter(result => result.status === "fulfilled").length;

            if (sent === 0) {
                throw results.find(result => result.status === "rejected").reason;
            }

            return sent;
        },

        shardOf: guildId => shardOfGuild(guildId, total),

        isConnected: () => gateways.some(gateway => gateway.connected),

        readyCount: () => state.filter(entry => entry.status === "ready").length,

        // [{ id, status, latency }], uma cópia: quem lê não mexe no estado daqui
        snapshot: () => state.map(entry => ({ ...entry })),

        // média das latências conhecidas, ou null se nenhum fragmento mediu ainda
        latency() {
            const known = state.map(entry => entry.latency).filter(value => value !== null);

            return known.length ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length) : null;
        },

        close() {
            closing = true;

            for (const gateway of gateways) {
                gateway.close();
            }
        }
    };
}
