
import { DISCORD_API, toMultipart } from "./format.mjs";

// ==========================================
// CLIENTE DA API REST DO DISCORD
// ==========================================

// Todo pedido ao Discord passa por aqui: cabeçalhos, JSON ou multipart, espera quando o
// Discord pede calma (429) e erros com o motivo na mensagem. O fetch vem de fora para os testes.

export class DiscordApiError extends Error {
    constructor(message, { status, body, retryAfterMs = 0, route = "" } = {}) {
        super(message);

        this.name = "DiscordApiError";
        this.status = status;
        this.body = body;
        this.retryAfterMs = retryAfterMs;
        this.route = route;
    }
}

// O Discord pede um User-Agent no formato "DiscordBot (url, versão)".
const USER_AGENT = "DiscordBot (https://github.com/helenacry/helena-bot, 1.0)";

// Quanto o bot aceita esperar por um 429 antes de desistir e devolver o erro.
const MAX_WAIT_MS = 15_000;

const sleepFor = ms => new Promise(done => setTimeout(done, ms));

export function createDiscordApi({
    token = process.env.DISCORD_BOT_TOKEN,
    fetchImpl = (...args) => globalThis.fetch(...args),
    base = DISCORD_API,
    sleep = sleepFor
} = {}) {
    // auth: false nas rotas de interação, que usam o token da própria interação.
    async function request(method, path, { json, files = [], query, auth = true, retry = true } = {}) {
        if (auth && !token) {
            throw new Error("DISCORD_BOT_TOKEN não configurado.");
        }

        const url = base + path + (query ? "?" + new URLSearchParams(query) : "");

        const headers = {
            "User-Agent": USER_AGENT,
            ...(auth ? { Authorization: `Bot ${token}` } : {})
        };

        let body;

        if (files.length) {
            body = toMultipart(json ?? {}, files);

        } else if (json !== undefined) {
            body = JSON.stringify(json);
            headers["Content-Type"] = "application/json";
        }

        const response = await fetchImpl(url, { method, headers, body });

        if (response.status === 204) {
            return null;
        }

        const raw = await response.text();

        let data;

        try {
            data = raw ? JSON.parse(raw) : null;

        } catch {
            data = { raw };
        }

        if (response.ok) {
            return data;
        }

        const route = `${method} ${path}`;

        if (response.status === 429) {
            const seconds = Number(data?.retry_after ?? response.headers?.get?.("retry-after") ?? 1);
            const waitMs = Math.max(0, Math.ceil(seconds * 1000));

            if (retry && waitMs <= MAX_WAIT_MS) {
                await sleep(waitMs);

                return request(method, path, { json, files, query, auth, retry: false });
            }

            throw new DiscordApiError(`[DISCORD] Limite de pedidos em ${route}: espere ${waitMs} ms.`, {
                status: 429, body: data, retryAfterMs: waitMs, route
            });
        }

        // o Discord explica o motivo em "message" (e "errors" nos campos)
        const detail = data?.message ?? data?.raw ?? "";

        throw new DiscordApiError(`[DISCORD] HTTP ${response.status} em ${route}: ${String(detail).slice(0, 300)}`, {
            status: response.status, body: data, route
        });
    }

    const id = value => encodeURIComponent(String(value));

    return {
        request,

        // ---- o próprio bot ----

        application: () => request("GET", "/applications/@me"),
        me: () => request("GET", "/users/@me"),
        gateway: () => request("GET", "/gateway/bot"),

        // ---- comandos de barra ----

        // Substitui a lista inteira de comandos globais.
        registerCommands: (appId, commands) => request("PUT", `/applications/${id(appId)}/commands`, { json: commands }),

        // ---- interações ----

        respond: (interactionId, interactionToken, { json, files }) =>
            request("POST", `/interactions/${id(interactionId)}/${id(interactionToken)}/callback`, { json, files, auth: false, retry: false }),

        editOriginal: (appId, interactionToken, { json, files }) =>
            request("PATCH", `/webhooks/${id(appId)}/${id(interactionToken)}/messages/@original`, { json, files, auth: false }),

        // ---- mensagens do canal ----

        send: (channelId, { json, files }) => request("POST", `/channels/${id(channelId)}/messages`, { json, files }),

        edit: (channelId, messageId, { json, files }) =>
            request("PATCH", `/channels/${id(channelId)}/messages/${id(messageId)}`, { json, files }),

        // ---- pessoas e servidores ----

        member: (guildId, userId) => request("GET", `/guilds/${id(guildId)}/members/${id(userId)}`),

        searchMembers: (guildId, query, limit = 10) =>
            request("GET", `/guilds/${id(guildId)}/members/search`, { query: { query, limit: String(limit) } }),

        user: userId => request("GET", `/users/${id(userId)}`),

        guild: guildId => request("GET", `/guilds/${id(guildId)}`, { query: { with_counts: "true" } }),

        guilds: () => request("GET", "/users/@me/guilds", { query: { limit: "200" } }),

        renameChannel: (channelId, name) => request("PATCH", `/channels/${id(channelId)}`, { json: { name } }),

        // ---- emojis do aplicativo (valem em qualquer servidor onde o bot está) ----

        appEmojis: appId => request("GET", `/applications/${id(appId)}/emojis`),

        createAppEmoji: (appId, name, bytes, contentType = "image/png") =>
            request("POST", `/applications/${id(appId)}/emojis`, {
                json: { name, image: `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}` }
            })
    };
}

// O cliente padrão do bot, criado na primeira vez que alguém o pede (depois de o .env ser lido).
let shared = null;

export function discordApi() {
    shared ??= createDiscordApi();

    return shared;
}

// Para os testes e para quem troca o token.
export function resetDiscordApi() {
    shared = null;
}
