
// ==========================================
// STATUS PÚBLICO DO DISCORD (/ping)
// ==========================================

// O Discord publica o próprio estado em https://discordstatus.com (uma página Statuspage). O /ping
// lê o resumo em JSON para dizer se a lentidão é um incidente deles. Nenhum dado de ninguém vai
// nesse pedido: é uma leitura pública, guardada por 1 minuto para não repetir a cada clique, e se
// a página não responde em 1,5 segundo o /ping segue sem ela (o Discord dá 3 s para responder).

export const STATUS_URL = "https://discordstatus.com";

const SUMMARY_URL = `${STATUS_URL}/api/v2/summary.json`;

const CACHE_MS = 60_000;
const TIMEOUT_MS = 1_500;

let cached = null;

// Texto de fora entra no chat: só letras, números e pontuação comum, e com limite.
const clean = (value, max) => String(value ?? "")
    .replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

// Resume a resposta do Statuspage: { indicator, description, incidents: [{ name, impact }] }.
export function parseStatus(body) {
    const indicator = String(body?.status?.indicator ?? "");

    if (!["none", "minor", "major", "critical"].includes(indicator)) {
        return null;
    }

    const incidents = Array.isArray(body?.incidents) ? body.incidents : [];

    return {
        indicator,
        description: clean(body?.status?.description, 80),

        incidents: incidents
            .slice(0, 3)
            .map(incident => ({
                name: clean(incident?.name, 90),
                impact: ["none", "minor", "major", "critical"].includes(incident?.impact) ? incident.impact : "minor"
            }))
            .filter(incident => incident.name)
    };
}

// HELENA_DISCORD_STATUS=off desliga a leitura (o /ping segue, sem a linha do status).
export const statusEnabled = (env = process.env) =>
    String(env.HELENA_DISCORD_STATUS ?? "").trim().toLowerCase() !== "off";

// null quando não deu para ler (sem internet, página fora do ar, resposta estranha, leitura desligada).
export async function discordStatus({
    fetchImpl = (...args) => globalThis.fetch(...args),
    now = Date.now(),
    force = false,
    env = process.env
} = {}) {
    if (!statusEnabled(env)) {
        return null;
    }

    if (!force && cached && now - cached.at < CACHE_MS) {
        return cached.value;
    }

    let value = null;

    try {
        const response = await fetchImpl(SUMMARY_URL, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });

        if (response.ok) {
            value = parseStatus(await response.json());
        }

    } catch {
        value = null;
    }

    // uma falha também fica guardada por um tempo: com a página fora do ar, ninguém quer esperar a cada clique
    cached = { at: now, value };

    return value;
}

export function resetStatusCache() {
    cached = null;
}
