
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

import { discordApi } from "../discord/api.mjs";

import { guildIds } from "./guild-registry.mjs";

import { shardSummary } from "./shard-registry.mjs";

import {
    formatMoneyCompact,
    formatXP,
    getTopMoney,
    getTopXP
} from "./status-data.mjs";

// ==========================================
// CONTADORES NOS CANAIS DE VOZ
// ==========================================

// Cada contador é um canal de voz do servidor de suporte que a Helena renomeia: o nome É o número.
// Os canais são criados por você, no Discord; aqui só se diz o ID de cada um nas variáveis, e o bot
// precisa de "Ver canal" e "Gerenciar canais" neles:
//
//   HELENA_USERS_CHANNEL_ID      👥 Usuários: 1.234           quem já usou a Helena (todos os servidores)
//   HELENA_SERVERS_CHANNEL_ID    🌐 Servidores: 12            em quantos servidores ela está
//   HELENA_SHARDS_CHANNEL_ID     🛰️ Shards: 1/1              conexões com o Discord (também vale o antigo
//                                                              HELENA_CLUSTERS_CHANNEL_ID)
//   HELENA_TOPXP_CHANNEL_ID      🏆 Top XP: Nome (12,3k)      o 1º do ranking global de XP
//   HELENA_TOPCOINS_CHANNEL_ID   💰 Top Coins: Nome (R$ 1,2M) o 1º do ranking global de dinheiro
//
// Canal sem ID fica de fora; basta um para o contador ligar.

const TOKEN = process.env.DISCORD_BOT_TOKEN;

// chave do contador -> variáveis que dizem o ID do canal (a primeira que existir vale)
export const CHANNEL_VARIABLES = Object.freeze({
    users: ["HELENA_USERS_CHANNEL_ID"],
    servers: ["HELENA_SERVERS_CHANNEL_ID"],
    shards: ["HELENA_SHARDS_CHANNEL_ID", "HELENA_CLUSTERS_CHANNEL_ID"],
    topXp: ["HELENA_TOPXP_CHANNEL_ID"],
    topCoins: ["HELENA_TOPCOINS_CHANNEL_ID"]
});

// Os canais com ID: { users: "123", ... } (só os que estão nas variáveis).
export function channelsFromEnv(env = process.env) {
    const channels = {};

    for (const [key, variables] of Object.entries(CHANNEL_VARIABLES)) {
        const id = variables.map(name => String(env[name] ?? "").trim()).find(Boolean);

        if (id) {
            channels[key] = id;
        }
    }

    return channels;
}

const CONFIG = {
    guildId: process.env.HELENA_SUPPORT_GUILD_ID,

    channels: channelsFromEnv(),

    databasePath:
        process.env.HELENA_DATABASE_PATH,

    // O Discord só deixa renomear um mesmo canal 2 vezes a cada 10 minutos: por isso o
    // intervalo nunca é menor que 5 minutos (e o nome só é enviado quando muda).
    interval: Math.max(
        300_000,
        Number(process.env.HELENA_STATS_INTERVAL) || 300_000
    )
};

// ==========================================
// ESTADO
// ==========================================

let timer = null;

let running = false;

let stopped = true;

let generation = 0;

const lastNames = new Map();

// ==========================================
// VERIFICAR CONFIGURAÇÃO
// ==========================================

function configured() {
    return Boolean(
        TOKEN &&
        CONFIG.guildId &&
        CONFIG.databasePath &&
        Object.keys(CONFIG.channels).length > 0
    );
}

// ==========================================
// CONTAR JOGADORES ÚNICOS
// ==========================================

export function countUniquePlayers() {
    if (!CONFIG.databasePath) {
        throw new Error(
            "HELENA_DATABASE_PATH não configurado."
        );
    }

    const db = new DatabaseSync(
        resolve(CONFIG.databasePath),
        {
            readOnly: true,
            allowExtension: false
        }
    );

    try {
        const table = db.prepare(
            `SELECT name
             FROM sqlite_master
             WHERE type = 'table'
               AND name = 'players'`
        ).get();

        if (!table) {
            throw new Error(
                "A tabela players não existe no banco informado."
            );
        }

        const columns = db
            .prepare("PRAGMA table_info(players)")
            .all()
            .map(column => column.name);

        // Conta usuários únicos, não registros
        // separados por servidor.

        const userColumn = [
            "user_id",
            "userId",
            "player_id"
        ].find(name => columns.includes(name));

        if (!userColumn) {
            throw new Error(
                "Coluna de identificação dos jogadores não encontrada. " +
                `Colunas disponíveis: ${columns.join(", ")}`
            );
        }

        const result = db.prepare(
            `SELECT COUNT(DISTINCT "${userColumn}") AS total
             FROM players
             WHERE "${userColumn}" IS NOT NULL
               AND TRIM(CAST("${userColumn}" AS TEXT)) <> ''`
        ).get();

        return Number(result?.total ?? 0);

    } finally {
        db.close();
    }
}

// ==========================================
// MONTAR NOMES DOS CANAIS
// ==========================================

const formatNumber = value => new Intl.NumberFormat("pt-BR").format(value);

// O nome de uma pessoa entra no nome de um canal: tira o que não é texto (controle, direção do
// texto, invisíveis), junta os espaços e corta em 40 letras.
export function channelSafeName(name) {
    const cleaned = String(name ?? "")
        .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, "")
        .replace(/\s+/g, " ")
        .trim();

    const letters = Array.from(cleaned);

    return (letters.length > 40 ? letters.slice(0, 39).join("") + "…" : cleaned) || "?";
}

// Os nomes de cada contador, prontos para o Discord (até 100 caracteres).
//   users, servers   números
//   shards           { ready, total }
//   topXp            { name, xp } ou null
//   topMoney         { name, money } (centavos) ou null
export function buildChannelNames({ users = 0, servers = 0, shards = { ready: 0, total: 1 }, topXp = null, topMoney = null } = {}) {
    return {
        users: `👥 Usuários: ${formatNumber(users)}`,

        servers: `🌐 Servidores: ${formatNumber(servers)}`,

        shards: `🛰️ Shards: ${shards.ready}/${shards.total}`,

        topXp: topXp
            ? `🏆 Top XP: ${channelSafeName(topXp.name)} (${formatXP(topXp.xp)})`
            : "🏆 Top XP: sem dados",

        topCoins: topMoney
            ? `💰 Top Coins: ${channelSafeName(topMoney.name)} (${formatMoneyCompact(topMoney.money)})`
            : "💰 Top Coins: sem dados"
    };
}

// Lê o que cada contador mostra (só o que algum canal usa, para não consultar à toa).
function collectData(channels) {
    return {
        users: channels.users ? countUniquePlayers() : 0,
        servers: guildIds.size,
        shards: shardSummary(),
        topXp: channels.topXp ? getTopXP() : null,
        topMoney: channels.topCoins ? getTopMoney() : null
    };
}

// ==========================================
// EDITAR CANAL PELA API DO DISCORD
// ==========================================

// PATCH /channels/:c  { "name": "Novo nome" }
//
// Permissão necessária: Gerenciar canais (MANAGE_CHANNELS) no servidor de suporte.

async function updateChannel(
    channelId,
    name,
    currentGeneration
) {
    // Não envia atualizações de uma execução antiga.
    if (
        stopped ||
        currentGeneration !== generation
    ) {
        return;
    }

    // Evita requisições repetidas.
    if (lastNames.get(channelId) === name) {
        return;
    }

    await discordApi().renameChannel(channelId, name);

    // Uma resposta antiga não deve atualizar o cache
    // de uma nova sessão do Gateway.

    if (
        stopped ||
        currentGeneration !== generation
    ) {
        return;
    }

    lastNames.set(channelId, name);

    console.log(
        `[SUPPORT STATS] ${name}`
    );
}

// ==========================================
// ATUALIZAR CONTADORES
// ==========================================

export async function updateSupportStats() {
    if (
        !configured() ||
        stopped ||
        running
    ) {
        return;
    }

    running = true;

    const currentGeneration = generation;

    try {
        const names = buildChannelNames(collectData(CONFIG.channels));

        const results = await Promise.allSettled(
            Object.entries(CONFIG.channels).map(([key, channelId]) =>
                updateChannel(channelId, names[key], currentGeneration)
            )
        );

        for (const result of results) {
            if (result.status === "rejected") {
                console.error(
                    "[SUPPORT STATS]",
                    result.reason
                );
            }
        }

    } catch (error) {
        console.error(
            "[SUPPORT STATS] Falha na atualização:",
            error
        );

    } finally {
        running = false;
    }
}

// ==========================================
// INICIAR CONTADORES
// ==========================================

export function startSupportStats() {
    if (!configured()) {
        console.warn(
            "[SUPPORT STATS] Configuração incompleta. " +
            "Verifique HELENA_SUPPORT_GUILD_ID, HELENA_DATABASE_PATH e ao menos um canal: " +
            Object.values(CHANNEL_VARIABLES).map(variables => variables[0]).join(", ") +
            "."
        );

        return;
    }

    // Impede intervalos duplicados.
    if (timer !== null) {
        clearInterval(timer);
        timer = null;
    }

    generation++;

    stopped = false;

    // Limpa o cache após reconexão para
    // sincronizar novamente os nomes reais.
    lastNames.clear();

    // Atualização imediata.
    void updateSupportStats();

    // Atualização periódica.
    timer = setInterval(
        () => {
            void updateSupportStats();
        },
        CONFIG.interval
    );

    console.log(
        "[SUPPORT STATS] Contadores iniciados " +
        `(${Object.keys(CONFIG.channels).length} canal(is)).`
    );

    console.log(
        `[SUPPORT STATS] Intervalo: ${CONFIG.interval / 1000}s.`
    );
}

// ==========================================
// PARAR CONTADORES
// ==========================================

export function stopSupportStats() {
    generation++;

    stopped = true;

    if (timer !== null) {
        clearInterval(timer);
        timer = null;
    }

    lastNames.clear();

    console.log(
        "[SUPPORT STATS] Contadores interrompidos."
    );
}
