
import WebSocket from "ws";

// ==========================================
// CLIENTE DO GATEWAY DO DISCORD (v10)
// ==========================================

// A conexão que traz os eventos em tempo real: identifica o bot, mantém o batimento, retoma a
// sessão quando cai (sem perder eventos) e reconecta sozinha. Quem usa recebe só quatro coisas:
// onReady (sessão nova), onResumed (sessão retomada: o Discord não manda o READY de novo, então
// nada do que o READY montou pode ter sido desmontado no onClose), onDispatch(nome, dados) e onClose.

export const GATEWAY_URL = "wss://gateway.discord.gg";

// As intenções são o que o bot pede para receber. Message Content é "privilegiada": precisa
// estar ligada no Portal do Desenvolvedor (aba Bot); sem ela o Discord fecha a conexão (4014).
export const INTENTS = Object.freeze({
    GUILDS: 1 << 0,
    GUILD_MESSAGES: 1 << 9,
    MESSAGE_CONTENT: 1 << 15
});

export const DEFAULT_INTENTS = INTENTS.GUILDS | INTENTS.GUILD_MESSAGES | INTENTS.MESSAGE_CONTENT;

const OP = Object.freeze({
    DISPATCH: 0,
    HEARTBEAT: 1,
    IDENTIFY: 2,
    PRESENCE: 3,
    RESUME: 6,
    RECONNECT: 7,
    INVALID_SESSION: 9,
    HELLO: 10,
    HEARTBEAT_ACK: 11
});

// Códigos de fechamento em que reconectar não adianta: o erro é da configuração.
export const FATAL_CLOSE = Object.freeze({
    4004: "O Discord recusou o token (DISCORD_BOT_TOKEN está errado ou foi redefinido).",
    4010: "Fragmento (shard) inválido.",
    4011: "O bot precisa de fragmentos (shards): passou do limite de servidores de uma conexão.",
    4012: "Versão do gateway inválida.",
    4013: "Intenções inválidas.",
    4014: "Intenção privilegiada não liberada: ligue a Message Content Intent no Portal do Desenvolvedor do Discord (aplicativo, aba Bot)."
});

// Nestes a sessão acabou: precisa identificar de novo, não dá para retomar.
const NEW_SESSION_CLOSE = new Set([4007, 4009]);

const backoff = attempts => {
    const base = Math.min(30_000, 1_000 * 2 ** Math.min(attempts, 5));

    return Math.min(30_000, Math.round(base * (0.8 + Math.random() * 0.4)));
};

export function createGateway({
    token,
    intents = DEFAULT_INTENTS,
    presence = () => null,
    onReady = () => {},
    onResumed = () => {},
    onDispatch = () => {},
    onClose = () => {},
    onFatal = () => {},
    log = console,
    WebSocketImpl = WebSocket,
    url = GATEWAY_URL,
    reconnectDelay = backoff
} = {}) {
    if (!token) {
        throw new Error("DISCORD_BOT_TOKEN não configurado.");
    }

    let socket = null;
    let heartbeatTimer = null;
    let firstBeatTimer = null;
    let reconnectTimer = null;
    let attempts = 0;
    let closing = false;

    // o que permite retomar a sessão
    let sessionId = null;
    let resumeUrl = null;
    let sequence = null;

    // true entre o envio de um batimento e a resposta dele
    let ackPending = false;

    const open = () => socket !== null && socket.readyState === WebSocketImpl.OPEN;

    function send(payload) {
        return new Promise((resolve, reject) => {
            if (!open()) {
                reject(new Error("Gateway não está conectado."));

                return;
            }

            socket.send(JSON.stringify(payload), error => (error ? reject(error) : resolve()));
        });
    }

    function stopTimers() {
        clearInterval(heartbeatTimer);
        clearTimeout(firstBeatTimer);

        heartbeatTimer = null;
        firstBeatTimer = null;
    }

    function heartbeat() {
        // o batimento anterior não foi respondido: a conexão morreu sem avisar
        if (ackPending) {
            log.warn("[GATEWAY] Sem resposta ao batimento: reconectando.");

            socket?.close(4000, "sem resposta ao batimento");

            return;
        }

        ackPending = true;

        send({ op: OP.HEARTBEAT, d: sequence }).catch(error => log.error("[HEARTBEAT]", error));
    }

    function startHeartbeat(intervalMs) {
        stopTimers();

        if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
            throw new Error("Intervalo de batimento inválido.");
        }

        ackPending = false;

        // o primeiro batimento sai depois de um tempo aleatório, como o Discord pede
        firstBeatTimer = setTimeout(() => {
            heartbeat();

            heartbeatTimer = setInterval(heartbeat, intervalMs);
        }, Math.floor(intervalMs * Math.random()));
    }

    function identify() {
        return send({
            op: OP.IDENTIFY,
            d: {
                token,
                intents,
                properties: { os: process.platform, browser: "helena", device: "helena" },
                ...(presence() ? { presence: presence() } : {})
            }
        });
    }

    function resume() {
        return send({ op: OP.RESUME, d: { token, session_id: sessionId, seq: sequence } });
    }

    function scheduleReconnect(delayMs) {
        if (closing || reconnectTimer !== null) {
            return;
        }

        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;

            connect();
        }, delayMs);
    }

    async function handle(message) {
        if (message.s !== undefined && message.s !== null) {
            sequence = message.s;
        }

        switch (message.op) {
            case OP.HELLO:
                startHeartbeat(Number(message.d?.heartbeat_interval));

                await (sessionId && sequence !== null ? resume() : identify());

                return;

            case OP.HEARTBEAT:
                // o Discord pediu um batimento agora
                await send({ op: OP.HEARTBEAT, d: sequence });

                return;

            case OP.HEARTBEAT_ACK:
                ackPending = false;

                return;

            case OP.RECONNECT:
                // pedido do Discord: sai e retoma de onde parou
                socket?.close(4000, "o Discord pediu para reconectar");

                return;

            case OP.INVALID_SESSION:
                // d = true: ainda dá para retomar; false: começa uma sessão nova
                if (message.d !== true) {
                    sessionId = null;
                    sequence = null;
                    resumeUrl = null;
                }

                socket?.close(4000, "sessão inválida");

                return;

            case OP.DISPATCH:
                break;

            default:
                return;
        }

        if (message.t === "READY") {
            sessionId = message.d.session_id;
            resumeUrl = message.d.resume_gateway_url ?? null;
            attempts = 0;

            await onReady(message.d);

            return;
        }

        if (message.t === "RESUMED") {
            attempts = 0;

            log.log("[GATEWAY] Sessão retomada.");

            await onResumed();

            return;
        }

        await onDispatch(message.t, message.d);
    }

    function connect() {
        if (closing) {
            return;
        }

        clearTimeout(reconnectTimer);
        reconnectTimer = null;
        stopTimers();

        const base = (sessionId && resumeUrl) ? resumeUrl : url;

        log.log("[GATEWAY] Iniciando conexão...");

        const current = new WebSocketImpl(`${base}/?v=10&encoding=json`);

        socket = current;

        current.on("message", async raw => {
            if (current !== socket) {
                return;
            }

            try {
                await handle(JSON.parse(raw.toString()));

            } catch (error) {
                log.error("[ERRO NO GATEWAY]", error);
            }
        });

        current.on("close", (code, reason) => {
            if (current !== socket) {
                return;
            }

            stopTimers();

            socket = null;

            if (NEW_SESSION_CLOSE.has(code)) {
                sessionId = null;
                sequence = null;
                resumeUrl = null;
            }

            log.warn("[GATEWAY] Desconectado.", { code, reason: reason?.toString() || "Sem motivo informado" });

            onClose({ code });

            if (closing) {
                return;
            }

            if (FATAL_CLOSE[code]) {
                log.error(`[GATEWAY] ${FATAL_CLOSE[code]}`);

                onFatal({ code, message: FATAL_CLOSE[code] });

                return;
            }

            const delay = reconnectDelay(attempts++);

            log.log(`[GATEWAY] Reconectando em ${(delay / 1000).toFixed(1)}s...`);

            scheduleReconnect(delay);
        });

        current.on("error", error => log.error("[WEBSOCKET]", error));
    }

    return {
        connect,

        send,

        // O que a pessoa vê embaixo do nome do bot (até 128 caracteres).
        setPresence: text => send({
            op: OP.PRESENCE,
            d: {
                since: null,
                activities: [{ type: 4, name: "Custom Status", state: String(text).slice(0, 128) }],
                status: "online",
                afk: false
            }
        }),

        get connected() {
            return open();
        },

        // Fecha de vez, sem reconectar.
        close() {
            closing = true;

            clearTimeout(reconnectTimer);
            reconnectTimer = null;
            stopTimers();

            const current = socket;

            socket = null;

            try {
                current?.terminate?.();

            } catch (error) {
                log.error("[GATEWAY] Erro ao encerrar conexão:", error);
            }
        }
    };
}
