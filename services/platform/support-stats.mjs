
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

import { discordApi } from "../discord/api.mjs";

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const TOKEN = process.env.DISCORD_BOT_TOKEN;

const CONFIG = {
    guildId: process.env.HELENA_SUPPORT_GUILD_ID,

    usersChannelId:
        process.env.HELENA_USERS_CHANNEL_ID,

    clustersChannelId:
        process.env.HELENA_CLUSTERS_CHANNEL_ID,

    databasePath:
        process.env.HELENA_DATABASE_PATH,

    clusterTotal: Math.max(
        1,
        Number(process.env.HELENA_CLUSTER_TOTAL) || 1
    ),

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

let online = false;

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
        CONFIG.usersChannelId &&
        CONFIG.clustersChannelId &&
        CONFIG.databasePath
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
// FORMATAR NÚMEROS
// ==========================================

function formatNumber(value) {
    return new Intl.NumberFormat("pt-BR").format(value);
}

// ==========================================
// MONTAR NOMES DOS CANAIS
// ==========================================

function buildChannelNames() {
    const users = countUniquePlayers();

    const activeClusters = online ? 1 : 0;

    return {
        users:
            `👥 Usuários: ${formatNumber(users)}`,

        clusters:
            `🛰️ Clusters: ${activeClusters}/${CONFIG.clusterTotal}`
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
        const names = buildChannelNames();

        const results = await Promise.allSettled([
            updateChannel(
                CONFIG.usersChannelId,
                names.users,
                currentGeneration
            ),

            updateChannel(
                CONFIG.clustersChannelId,
                names.clusters,
                currentGeneration
            )
        ]);

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
            "Verifique as variáveis HELENA_SUPPORT_GUILD_ID, " +
            "HELENA_USERS_CHANNEL_ID, " +
            "HELENA_CLUSTERS_CHANNEL_ID e " +
            "HELENA_DATABASE_PATH."
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

    online = true;

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
        "[SUPPORT STATS] Contadores iniciados."
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

    online = false;

    if (timer !== null) {
        clearInterval(timer);
        timer = null;
    }

    lastNames.clear();

    console.log(
        "[SUPPORT STATS] Contadores interrompidos."
    );
}