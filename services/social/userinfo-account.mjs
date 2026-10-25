import { fetchAccount } from "../platform/user-lookup.mjs";

import { normalizeUser } from "../discord/normalize.mjs";

// ==========================================
// O PERFIL COMPLETO DA CONTA
// ==========================================

// O membro que o Discord entrega junto do servidor não traz o banner, a etiqueta de servidor nem
// as flags completas. Isso só vem no perfil da conta (GET /users/:id), que a Helena busca ao montar
// o cartão e as telas de banner, insígnias e Nitro (uma chamada, guardada por um minuto).

const CDN = "https://cdn.discordapp.com";

const CACHE_MS = 60_000;

const cache = new Map();

export function clearAccountCache() {
    cache.clear();
}

// O banner é animado quando o código começa com "a_", mas o .png serve nos dois casos (o
// primeiro quadro) e abre em qualquer lugar.
export function bannerUrl(id, hash, size = 1024) {
    return hash ? `${CDN}/banners/${id}/${hash}.png?size=${size}` : null;
}

async function loadAccount(id) {
    const cached = cache.get(id);

    if (cached && Date.now() - cached.at < CACHE_MS) {
        return cached.account;
    }

    const account = await fetchAccount(id);

    cache.set(id, { at: Date.now(), account });

    // a memória não cresce sem limite: guarda só as últimas
    if (cache.size > 200) {
        cache.delete(cache.keys().next().value);
    }

    return account;
}

// As flags de duas fontes juntas (bit a bit, com BigInt: algumas passam do bit 31).
const mergeFlags = (a, b) => Number(BigInt(Math.trunc(Number(a) || 0)) | BigInt(Math.trunc(Number(b) || 0)));

/**
 * Devolve o usuário com o que só o perfil da conta traz: bannerUrl, cor de destaque, a foto (para
 * saber se é animada), as flags completas e a etiqueta de servidor. Se a busca falhar, devolve o
 * mesmo usuário (as telas dizem que não têm). Nunca lança.
 */
export async function withAccount(user) {
    if (!user?.id) {
        return user;
    }

    if (user.accountLoaded || user.bannerUrl !== undefined) {
        return user;
    }

    try {
        const account = await loadAccount(user.id);

        if (!account) {
            return { ...user, accountLoaded: true };
        }

        const full = normalizeUser(account);

        return {
            ...user,
            accountLoaded: true,
            bannerHash: account.banner ?? null,
            bannerUrl: bannerUrl(user.id, account.banner),
            accentColor: account.accent_color ?? user.accentColor ?? null,
            bannerColor: full?.bannerColor ?? null,
            nameColors: full?.nameColors ?? [],
            nameplatePalette: full?.nameplatePalette ?? null,
            avatarDecoration: full?.avatarDecoration ?? null,
            avatarHash: account.avatar ?? user.avatarHash ?? null,
            publicFlags: mergeFlags(user.publicFlags, full?.publicFlags),
            flags: mergeFlags(user.flags, full?.flags),
            primaryGuild: full?.primaryGuild ?? user.primaryGuild ?? null
        };

    } catch (error) {
        console.warn(
            "[USERINFO] Não consegui buscar o perfil da conta:",
            error.message
        );

        return user;
    }
}

// O nome antigo (só o banner), que o painel e os testes ainda usam.
export const withBanner = withAccount;
