
import WebSocket from "ws";

import {
    runMigrations
} from "./database/migrations.mjs";

import {
    runCombatMigrations
} from "./database/combat-migrations.mjs";

import {
    carregarComandos,
    registrarComandos
} from "./registrar.mjs";

import {
    startStatusRotation,
    stopStatusRotation
} from "./services/status.mjs";

import {
    getStatusMessages
} from "./services/status-data.mjs";

import {
    runStreakMigrations
} from "./database/streak-migrations.mjs";

import {
    runDeveloperMigrations
} from "./database/developer-migrations.mjs";

import {
    isOwner,
    userId,
    maintenance,
    blocked
} from "./services/developer.mjs";

import {
    processarPrefixo
} from "./services/prefix.mjs";

import {
    startSupportStats,
    stopSupportStats
} from "./services/support-stats.mjs";

import {
    runPlayerNamesMigrations,
    savePlayerName
} from "./services/player-names.mjs";

import {
    runAchievementMigrations
} from "./database/achievement-migrations.mjs";

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const API = "https://api.vsync.lat";

const GATEWAY =
    API.replace(/^http/, "ws") + "/gateway";

const TOKEN = process.env.VSYNC_BOT_TOKEN;

if (!TOKEN) {
    throw new Error(
        "VSYNC_BOT_TOKEN não configurado."
    );
}

const headers = {
    Authorization: `Bot ${TOKEN}`,
    "Content-Type": "application/json"
};

// ==========================================
// RESPONDER INTERAÇÃO SLASH
// ==========================================

async function responderInteracao(
    interaction,
    resultado
) {
    const callback = await fetch(
        `${API}/interactions/${interaction.id}/${interaction.token}/callback`,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(resultado)
        }
    );

    if (!callback.ok) {
        console.error(
            "[CALLBACK]",
            callback.status,
            await callback.text()
        );
    }

    return callback.ok;
}

function mensagemErro(
    texto = "❌ Ocorreu um erro ao executar esta ação."
) {
    return {
        type: "message",

        data: {
            body: texto,
            ephemeral: true
        }
    };
}

// ==========================================
// ENVIAR MENSAGEM NORMAL AO CANAL
// ==========================================

// Utilizado pelo /perfil e pelos comandos
// executados através do prefixo h.

async function enviarMensagemCanal(
    interaction,
    data
) {
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    if (!guildId || !channelId) {
        throw new Error(
            "Servidor ou canal não identificado."
        );
    }

    const response = await fetch(
        `${API}/guilds/${encodeURIComponent(guildId)}` +
        `/channels/${encodeURIComponent(channelId)}/messages`,
        {
            method: "POST",
            headers,
            body: JSON.stringify(data)
        }
    );

    if (!response.ok) {
        const detail = await response.text();

        throw new Error(
            `[MENSAGEM CANAL] HTTP ${response.status}: ${detail}`
        );
    }

    return response.json();
}

// ==========================================
// EXECUÇÃO ESPECIAL DO /PERFIL
// ==========================================

// Confirma a interação antes da geração
// da imagem com Sharp.
//
// Depois publica o cartão no canal.

async function executarPerfil(
    interaction,
    comando
) {
    const confirmado = await responderInteracao(
        interaction,
        {
            type: "message",

            data: {
                body:
                    "🎨 Gerando seu cartão de perfil...",

                ephemeral: true
            }
        }
    );

    if (!confirmado) {
        console.error(
            "[PERFIL] Não foi possível confirmar a interação."
        );

        return;
    }

    try {
        const resultado =
            await comando.execute(interaction);

        if (!resultado) {
            console.error(
                "[PERFIL] O comando não retornou uma resposta."
            );

            return;
        }

        if (
            resultado.type !== "message" ||
            !resultado.data
        ) {
            throw new Error(
                "Formato de resposta inválido no /perfil."
            );
        }

        const data = resultado.data;

        if (data.ephemeral) {
            console.error(
                "[PERFIL] O comando retornou um erro:",
                data.body
            );

            return;
        }

        await enviarMensagemCanal(
            interaction,
            {
                body: data.body ?? "",

                ...(data.attachments
                    ? {
                        attachments: data.attachments
                    }
                    : {}),

                ...(data.embeds
                    ? {
                        embeds: data.embeds
                    }
                    : {})
            }
        );

        console.log(
            "[PERFIL] Cartão publicado no canal."
        );

    } catch (erro) {
        console.error(
            "[PERFIL] Falha na execução ou publicação:",
            erro
        );
    }
}

// ==========================================
// AUTENTICAÇÃO
// ==========================================

const resposta = await fetch(
    `${API}/bot/me`,
    {
        headers
    }
);

if (!resposta.ok) {
    throw new Error(
        `Erro de autenticação: ${resposta.status} - ${await resposta.text()}`
    );
}

const me = await resposta.json();

const appId = me.application.id;

// ==========================================
// MIGRAÇÕES
// ==========================================

runMigrations();
runCombatMigrations();
runDeveloperMigrations();
runStreakMigrations();
runPlayerNamesMigrations();
runAchievementMigrations();

// ==========================================
// CARREGAR E REGISTRAR COMANDOS
// ==========================================

const comandos = await carregarComandos();

await registrarComandos(
    appId,
    comandos
);

console.log(
    `[COMANDOS] ${comandos.size} comandos carregados.`
);

console.log(
    "[PREFIXO] Sistema de comandos h preparado."
);

// ==========================================
// COMPONENTES INTERATIVOS
// ==========================================

async function executarComponente(interaction) {
    const customId = String(
        interaction.data?.customId || ""
    );

    if (customId.startsWith("userinfo:")) {
        console.log(
            "[USERINFO COMPONENT]",
            {
                customId,

                userId: interaction.user?.id,

                values:
                    interaction.data?.values || []
            }
        );

        return {
            type: "message",

            data: {
                body:
                    "💜 Os menus interativos do Userinfo estão em desenvolvimento.",

                ephemeral: true
            }
        };
    }

    console.warn(
        "[COMPONENTE DESCONHECIDO]",
        customId
    );

    return mensagemErro(
        "❌ Este componente não está disponível."
    );
}

// ==========================================
// ESTADO DO GATEWAY
// ==========================================

let ws = null;

let heartbeat = null;

let reconnectTimer = null;

let reconnectAttempts = 0;

let shuttingDown = false;

// ==========================================
// ESTADO DOS SERVIDORES
// ==========================================

const guildIds = new Set();

let guildCountComplete = false;

// ==========================================
// IDENTIFICAR ID DO SERVIDOR
// ==========================================

function obterGuildId(guild) {
    if (
        typeof guild === "string" ||
        typeof guild === "number"
    ) {
        return String(guild);
    }

    if (
        guild &&
        typeof guild === "object"
    ) {
        const id =
            guild.id ??
            guild.guildId ??
            guild.guild_id;

        if (
            id !== undefined &&
            id !== null
        ) {
            return String(id);
        }
    }

    return null;
}

// ==========================================
// SNAPSHOT DE SERVIDORES
// ==========================================

function processarReadyGuilds(msg) {
    const data = msg.d ?? msg;

    const guilds =
        data.guilds ??
        msg.guilds;

    if (!Array.isArray(guilds)) {
        return;
    }

    const ids = guilds
        .map(obterGuildId)
        .filter(Boolean);

    guildIds.clear();

    for (const id of ids) {
        guildIds.add(id);
    }

    guildCountComplete =
        data.guildsComplete === true ||
        data.guilds_complete === true ||
        data.guildSnapshotComplete === true ||
        msg.guildsComplete === true;

    console.log(
        `[GUILDS] ${guildIds.size} servidores recebidos no READY.` +
        (
            guildCountComplete
                ? " Snapshot completo."
                : " Completude não confirmada."
        )
    );
}

// ==========================================
// EVENTOS DE SERVIDORES
// ==========================================

function processarEventoGuild(msg) {
    if (msg.op !== "dispatch") {
        return false;
    }

    const eventName = String(
        msg.t || ""
    ).toUpperCase();

    if (
        eventName !== "GUILD_CREATE" &&
        eventName !== "GUILD_DELETE"
    ) {
        return false;
    }

    // Diagnóstico temporário.

    console.log(
        "[DEBUG GUILD EVENT]",
        JSON.stringify(msg, null, 2)
    );

    const guildId =
        obterGuildId(msg.d) ||
        obterGuildId(msg.d?.guild);

    if (!guildId) {
        console.warn(
            `[GUILDS] ${eventName} sem ID reconhecido.`
        );

        return true;
    }

    if (eventName === "GUILD_CREATE") {
        guildIds.add(guildId);
    }

    if (eventName === "GUILD_DELETE") {
        guildIds.delete(guildId);
    }

    console.log(
        `[GUILDS] ${eventName}: ${guildIds.size} servidores conhecidos.`
    );

    return true;
}

// ==========================================
// OBTER STATUS COM DADOS REAIS
// ==========================================

function obterMensagensStatus() {
    return getStatusMessages({
        guildCount: guildIds.size,

        guildCountComplete
    });
}

// ==========================================
// LIMPEZA DOS TIMERS
// ==========================================

function limparHeartbeat() {
    if (heartbeat !== null) {
        clearInterval(heartbeat);

        heartbeat = null;
    }
}

function limparReconexao() {
    if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);

        reconnectTimer = null;
    }
}

// ==========================================
// ENVIO AO GATEWAY
// ==========================================

function enviarGateway(socket, payload) {
    return new Promise((resolve, reject) => {
        if (
            !socket ||
            socket.readyState !== WebSocket.OPEN
        ) {
            reject(
                new Error(
                    "Gateway não está conectado."
                )
            );

            return;
        }

        socket.send(
            JSON.stringify(payload),

            error => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            }
        );
    });
}

// ==========================================
// SISTEMA DE PRESENÇA — VSYNC
// ==========================================

async function atualizarPresenca(message) {
    if (
        typeof message !== "string" ||
        !message.trim() ||
        Array.from(message).length > 64
    ) {
        throw new Error(
            "A atividade precisa conter entre 1 e 64 caracteres."
        );
    }

    const socket = ws;

    if (
        !socket ||
        socket.readyState !== WebSocket.OPEN
    ) {
        throw new Error(
            "Gateway não está conectado."
        );
    }

    await enviarGateway(
        socket,
        {
            op: "update_presence",

            activity: {
                name: message
            }
        }
    );
}

// ==========================================
// RECONEXÃO AUTOMÁTICA
// ==========================================

function agendarReconexao() {
    if (
        shuttingDown ||
        reconnectTimer !== null
    ) {
        return;
    }

    const baseDelay = Math.min(
        30_000,

        1_000 * (
            2 ** Math.min(reconnectAttempts, 5)
        )
    );

    const jitterFactor =
        0.8 + Math.random() * 0.4;

    const delay = Math.min(
        30_000,

        Math.round(
            baseDelay * jitterFactor
        )
    );

    reconnectAttempts++;

    console.log(
        `[GATEWAY] Reconectando em ${(delay / 1000).toFixed(1)}s...`
    );

    reconnectTimer = setTimeout(
        () => {
            reconnectTimer = null;

            conectarGateway();
        },
        delay
    );
}

// ==========================================
// CONECTAR AO GATEWAY
// ==========================================

function conectarGateway() {
    if (shuttingDown) {
        return;
    }

    limparReconexao();
    limparHeartbeat();

    stopStatusRotation();

    // Impede que intervalos antigos continuem
    // funcionando após uma reconexão.
    stopSupportStats();

    guildIds.clear();
    guildCountComplete = false;

    console.log(
        "[GATEWAY] Iniciando conexão..."
    );

    const socket = new WebSocket(GATEWAY);

    ws = socket;

    // ======================================
    // RECEBER EVENTOS DO GATEWAY
    // ======================================

    socket.on("message", async raw => {
        if (
            shuttingDown ||
            socket !== ws
        ) {
            return;
        }

        try {
            const msg = JSON.parse(
                raw.toString()
            );

            // ==================================
            // HELLO
            // ==================================

            if (msg.op === "hello") {
                await enviarGateway(
                    socket,
                    {
                        op: "identify",
                        token: TOKEN
                    }
                );

                limparHeartbeat();

                const heartbeatMs = Number(
                    msg.heartbeatMs
                );

                if (
                    !Number.isFinite(heartbeatMs) ||
                    heartbeatMs <= 0
                ) {
                    throw new Error(
                        "Intervalo de heartbeat inválido."
                    );
                }

                heartbeat = setInterval(
                    () => {
                        if (
                            socket !== ws ||
                            socket.readyState !== WebSocket.OPEN
                        ) {
                            return;
                        }

                        void enviarGateway(
                            socket,
                            {
                                op: "ping"
                            }
                        ).catch(error => {
                            console.error(
                                "[HEARTBEAT]",
                                error
                            );
                        });

                    },
                    heartbeatMs
                );

                return;
            }

            // ==================================
            // READY
            // ==================================

            if (msg.op === "ready") {
                reconnectAttempts = 0;

                limparReconexao();

                const readyData = msg.d ?? msg;

                console.log(
                    `Online como ${
                        readyData.user?.displayName ||
                        readyData.user?.username ||
                        "Helena"
                    }`
                );

                console.log(
                    `Comandos carregados: ${comandos.size}`
                );

                processarReadyGuilds(msg);

                // Rotação de presença.
                startStatusRotation(
                    atualizarPresenca,
                    obterMensagensStatus
                );

                // Contadores do servidor de suporte.
                startSupportStats();

                console.log(
                    "[STATUS] Rotação com dados reais iniciada."
                );

                console.log(
                    "[PREFIXO] Aguardando comandos iniciados com h."
                );

                return;
            }

            // ==================================
            // EVENTOS DE SERVIDORES
            // ==================================

            if (processarEventoGuild(msg)) {
                return;
            }

            // ==================================
            // COMANDOS COM PREFIXO H
            // ==================================

            // Exemplos:
            // hajuda
            // hperfil
            // hdaily
            // hajuda economia

            if (
                msg.op === "dispatch" &&
                msg.t === "MESSAGE_CREATE" &&
                msg.d
            ) {
                try {
                    await processarPrefixo({
                        message: msg.d,

                        comandos,

                        send: enviarMensagemCanal
                    });

                } catch (erro) {
                    console.error(
                        "[ERRO PREFIXO]",
                        erro
                    );
                }

                return;
            }

            // ==================================
            // FILTRAR INTERAÇÕES SLASH
            // ==================================

            if (
                msg.op !== "dispatch" ||
                msg.t !== "INTERACTION_CREATE" ||
                !msg.d
            ) {
                return;
            }

            const interaction = msg.d;

            // ==================================
            // IDENTIFICAR USUÁRIO
            // ==================================

            const actorId = userId(interaction);

            if (interaction.user?.id) {
                savePlayerName(
                    interaction.user
                );
            }

            // ==================================
            // PROTEÇÃO DO DESENVOLVEDOR
            // ==================================

            if (
                !isOwner(actorId) &&
                (
                    maintenance() ||
                    blocked(actorId)
                )
            ) {
                const reason = maintenance()
                    ? "🛠️ Helena está em manutenção."
                    : "🚫 Seu acesso à Helena foi bloqueado.";

                await responderInteracao(
                    interaction,
                    mensagemErro(reason)
                );

                return;
            }

            // ==================================
            // LOG DA INTERAÇÃO
            // ==================================

            console.dir(
                {
                    ...interaction,
                    token: "[OCULTO]"
                },
                {
                    depth: 6,
                    colors: true
                }
            );

            // ==================================
            // COMPONENTES INTERATIVOS
            // ==================================

            if (
                interaction.type === "component"
            ) {
                let resultado;

                try {
                    resultado =
                        await executarComponente(
                            interaction
                        );

                } catch (erro) {
                    console.error(
                        "[ERRO COMPONENTE]",
                        erro
                    );

                    resultado = mensagemErro(
                        "❌ Não foi possível processar esta interação."
                    );
                }

                await responderInteracao(
                    interaction,
                    resultado
                );

                return;
            }

            // ==================================
            // FILTRAR COMANDOS
            // ==================================

            if (
                interaction.type !== "command"
            ) {
                return;
            }

            // ==================================
            // LOCALIZAR COMANDO
            // ==================================

            const commandName =
                interaction.data?.name;

            const comando =
                comandos.get(commandName);

            if (!comando) {
                console.warn(
                    `Comando desconhecido: ${commandName}`
                );

                await responderInteracao(
                    interaction,

                    mensagemErro(
                        "❌ Este comando não está disponível."
                    )
                );

                return;
            }

            // ==================================
            // TRATAMENTO ESPECIAL DO /PERFIL
            // ==================================

            if (commandName === "perfil") {
                await executarPerfil(
                    interaction,
                    comando
                );

                return;
            }

            // ==================================
            // EXECUTAR DEMAIS COMANDOS
            // ==================================

            let resultado;

            try {
                resultado =
                    await comando.execute(
                        interaction
                    );

            } catch (erro) {
                console.error(
                    `Erro no comando /${comando.name}:`,
                    erro
                );

                resultado = {
                    type: "message",

                    data: {
                        body:
                            "❌ Ocorreu um erro ao executar o comando."
                    }
                };
            }

            // ==================================
            // VALIDAR RESPOSTA
            // ==================================

            if (!resultado) {
                console.error(
                    `[COMANDO SEM RESPOSTA] /${comando.name}`
                );

                resultado = mensagemErro(
                    "❌ O comando não retornou uma resposta válida."
                );
            }

            // ==================================
            // RESPONDER À INTERAÇÃO
            // ==================================

            console.dir(
                {
                    comando: comando.name,
                    resposta: resultado
                },
                {
                    depth: 6,
                    colors: true
                }
            );

            await responderInteracao(
                interaction,
                resultado
            );

        } catch (erro) {
            console.error(
                "[ERRO NO GATEWAY]",
                erro
            );
        }
    });

    // ======================================
    // DESCONEXÃO
    // ======================================

    socket.on(
        "close",
        (code, reason) => {
            if (socket !== ws) {
                return;
            }

            limparHeartbeat();

            stopStatusRotation();

            // Interrompe os contadores enquanto
            // o Gateway estiver desconectado.
            stopSupportStats();

            ws = null;

            guildIds.clear();
            guildCountComplete = false;

            console.warn(
                "[GATEWAY] Desconectado.",
                {
                    code,

                    reason:
                        reason.toString() ||
                        "Sem motivo informado"
                }
            );

            if (!shuttingDown) {
                agendarReconexao();
            }
        }
    );

    // ======================================
    // ERROS DO WEBSOCKET
    // ======================================

    socket.on("error", error => {
        console.error(
            "[WEBSOCKET]",
            error
        );
    });
}

// ==========================================
// ENCERRAMENTO CONTROLADO
// ==========================================

function encerrar(signal) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    console.log(
        `[SISTEMA] Recebido ${signal}. Encerrando Helena...`
    );

    limparHeartbeat();
    limparReconexao();

    stopStatusRotation();

    // Finaliza os contadores de suporte.
    stopSupportStats();

    const socket = ws;

    ws = null;

    if (socket) {
        try {
            socket.terminate();

        } catch (erro) {
            console.error(
                "[GATEWAY] Erro ao encerrar conexão:",
                erro
            );
        }
    }

    process.exitCode = 0;
}

process.once(
    "SIGINT",
    () => encerrar("SIGINT")
);

process.once(
    "SIGTERM",
    () => encerrar("SIGTERM")
);

// ==========================================
// INICIAR HELENA
// ==========================================

conectarGateway();