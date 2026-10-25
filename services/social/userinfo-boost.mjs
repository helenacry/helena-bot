import { guildIds } from "../platform/guild-registry.mjs";

import { discordApi } from "../discord/api.mjs";

// ==========================================
// O IMPULSO EM TODOS OS SERVIDORES DA HELENA
// ==========================================

// O Discord só entrega o "impulsiona desde" de uma pessoa em cada servidor (premium_since do membro): o
// perfil que junta todos os servidores é fechado para bots. Então a Helena olha, na hora, o membro em cada
// servidor onde ela está e fica com o impulso mais antigo. Quem impulsiona um servidor onde a Helena não
// está só aparece depois que ela entra lá. Nada disto é guardado: some com a memória de alguns minutos.

// Por quanto tempo o resultado de uma pessoa é reutilizado (o /userinfo é consultado várias vezes seguidas).
const CACHE_MS = 5 * 60_000;

// Quantos servidores são conferidos por consulta e quantos de uma vez (a Helena em centenas de servidores
// não pode fazer centenas de chamadas a cada /userinfo).
const MAX_GUILDS = 25;
const PARALLEL = 5;

const cache = new Map();

export function clearBoostCache() {
    cache.clear();
}

// O momento (ms) em que a pessoa começou a impulsionar este servidor, ou null (não está, não impulsiona
// ou o Discord não deixou ler).
async function boostIn(guildId, userId) {
    try {
        const member = await discordApi().member(guildId, userId);

        const time = member?.premium_since ? Date.parse(member.premium_since) : NaN;

        return Number.isFinite(time) ? time : null;

    } catch {
        return null;
    }
}

/**
 * O impulso mais antigo da pessoa entre os servidores onde a Helena está: { since, checked } (since é null
 * se ela não impulsiona nenhum; checked, quantos servidores foram conferidos).
 */
export async function findBoost(userId, { guilds = [...guildIds] } = {}) {
    const key = String(userId);

    const cached = cache.get(key);

    if (cached && Date.now() - cached.at < CACHE_MS) {
        return cached.result;
    }

    const targets = guilds.slice(0, MAX_GUILDS);

    const found = [];

    for (let index = 0; index < targets.length; index += PARALLEL) {
        found.push(...await Promise.all(targets.slice(index, index + PARALLEL).map(guildId => boostIn(guildId, key))));
    }

    const times = found.filter(time => time !== null);

    const result = { since: times.length ? Math.min(...times) : null, checked: targets.length };

    cache.set(key, { at: Date.now(), result });

    // a memória não cresce sem limite: guarda só as últimas
    if (cache.size > 200) {
        cache.delete(cache.keys().next().value);
    }

    return result;
}

/**
 * O usuário com boostSince (o impulso mais antigo entre os servidores da Helena) e boostChecked (quantos
 * servidores foram conferidos). Bots não impulsionam. Nunca lança.
 */
export async function withBoost(user) {
    try {
        if (!user?.id || user.bot) {
            return user;
        }

        const { since, checked } = await findBoost(user.id);

        return { ...user, boostChecked: checked, ...(since ? { boostSince: since } : {}) };

    } catch {
        return user;
    }
}
