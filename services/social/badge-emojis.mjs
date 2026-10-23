
import { PULSE_EMOJIS } from "./userinfo-format.mjs";

// ==========================================
// EMOJIS DAS INSÍGNIAS
// ==========================================

// O /userinfo mostra cada insígnia com o ícone oficial da VSync (https://vsync.lat/badges), que
// vira emoji de servidor. O pacote de emojis tem um PNG por insígnia, com o nome do arquivo
// (sem .png) como nome do emoji: auto_admin, auto_pulse_12, auto_stream_5khplus...
//
// A Helena não guarda o ID de nenhum: ela lê a lista de emojis do servidor e monta o texto
// <:nome:id> na hora (cache de 1 minuto). Onde ler:
//   1. HELENA_BADGE_GUILD_ID (um ou mais servidores, separados por vírgula);
//   2. HELENA_SUPPORT_GUILD_ID (o servidor de suporte);
//   3. na falta dos dois, os primeiros servidores em que a Helena está.
// A VSync só entrega a lista a quem tem MANAGE_GUILD no servidor. Se a leitura falhar, vale o
// emoji fixo do catálogo e, sem ele, o nome da insígnia. Nada disso derruba o comando.

const API = "https://api.vsync.lat";

// Só estes nomes interessam; o resto dos emojis do servidor é ignorado.
export const BADGE_EMOJI_PREFIX = "auto_";

// Quanto tempo a lista lida vale, e quanto tempo um servidor que recusou a leitura fica de fora.
const CACHE_MS = 60_000;
const DENIED_MS = 60 * 60_000;

// Sem servidor configurado, quantos servidores a Helena confere antes de desistir.
const MAX_GUILDS = 10;

// "at" é quando a lista foi lida; no começo nunca vale como recente.
let loaded = { at: -Infinity, map: {} };

// servidor -> até quando não perguntar de novo (sem permissão ou sem emojis).
const denied = new Map();

// Para a mesma falha não encher o log a cada minuto.
let lastWarning = "";

export function resetBadgeEmojis() {
    loaded = { at: -Infinity, map: {} };
    denied.clear();
    lastWarning = "";
}

// O que foi lido por último: { auto_admin: "<:auto_admin:123>", ... }.
export const badgeEmojis = () => loaded.map;

// O emoji de um nome do pacote; "fallback" quando o servidor não o tem.
export const emojiNamed = (name, fallback = "") => loaded.map[name] ?? fallback;

// O selo de Pulse de N meses: o do pacote, ou o fixo de antes.
export const pulseEmoji = months =>
    emojiNamed(`${BADGE_EMOJI_PREFIX}pulse_${months}`, PULSE_EMOJIS[months] ?? "");

// ==========================================
// API
// ==========================================

function botHeaders() {
    const token = process.env.VSYNC_BOT_TOKEN;

    if (!token) {
        throw new Error("VSYNC_BOT_TOKEN não configurado.");
    }

    return { Authorization: `Bot ${token}` };
}

// null quando a API responde 403 ou 404; erro nos demais casos.
async function apiGet(path) {
    const response = await fetch(`${API}${path}`, { headers: botHeaders() });

    if (response.status === 403 || response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} em ${path}`);
    }

    return response.json();
}

const idsOf = value => String(value ?? "").split(",").map(id => id.trim()).filter(Boolean);

// Os servidores onde procurar, e se foram escolhidos (true) ou se é uma busca às cegas (false).
async function guildsToRead() {
    const chosen = [...idsOf(process.env.HELENA_BADGE_GUILD_ID), ...idsOf(process.env.HELENA_SUPPORT_GUILD_ID)];

    if (chosen.length) {
        return { ids: [...new Set(chosen)], chosen: true };
    }

    const data = await apiGet("/bot/guilds");

    const ids = (Array.isArray(data?.guilds) ? data.guilds : [])
        .map(guild => String(guild?.id ?? ""))
        .filter(Boolean)
        .slice(0, MAX_GUILDS);

    return { ids, chosen: false };
}

// "<:nome:id>" (ou "<a:nome:id>" se animado); "" se o emoji não serve.
function emojiText(emoji) {
    const name = String(emoji?.name ?? "");
    const id = String(emoji?.id ?? "");

    if (!name.startsWith(BADGE_EMOJI_PREFIX) || !/^[\w-]+$/.test(name) || !/^[\w-]+$/.test(id)) {
        return "";
    }

    return `<${emoji.animated ? "a" : ""}:${name}:${id}>`;
}

// Lê os emojis do pacote e guarda. Nunca lança: devolve o que já tinha se algo falhar.
export async function loadBadgeEmojis({ now = Date.now() } = {}) {
    if (now - loaded.at < CACHE_MS) {
        return loaded.map;
    }

    // marca já: chamadas ao mesmo tempo esperam o minuto em vez de repetir a leitura
    loaded = { ...loaded, at: now };

    try {
        const { ids, chosen } = await guildsToRead();

        const found = {};

        for (const id of ids) {
            if ((denied.get(id) ?? 0) > now) {
                continue;
            }

            const data = await apiGet(`/guilds/${encodeURIComponent(id)}/emojis`);

            if (data === null) {
                denied.set(id, now + DENIED_MS);
                continue;
            }

            for (const emoji of Array.isArray(data.emojis) ? data.emojis : []) {
                const text = emojiText(emoji);

                if (text) {
                    found[emoji.name] ??= text;
                }
            }

            // a busca às cegas para no primeiro servidor que tem o pacote
            if (!chosen && Object.keys(found).length) {
                break;
            }
        }

        if (Object.keys(found).length) {
            loaded = { at: now, map: found };
            lastWarning = "";
        }

    } catch (error) {
        if (error.message !== lastWarning) {
            lastWarning = error.message;

            console.warn("[INSÍGNIAS] Emojis indisponíveis, uso os fixos:", error.message);
        }
    }

    return loaded.map;
}
