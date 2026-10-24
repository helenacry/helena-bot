
import { fetchAccount } from "../platform/user-lookup.mjs";

// ==========================================
// O PERFIL COMPLETO DA CONTA
// ==========================================

// O membro que o Discord entrega junto do servidor não traz o banner. Ele só vem no perfil da
// conta (GET /users/:id), que a Helena busca só quando a pessoa pede a tela do banner.

const CDN = "https://cdn.discordapp.com";

// O banner é animado quando o código começa com "a_", mas o .png serve nos dois casos (o
// primeiro quadro) e abre em qualquer lugar.
export function bannerUrl(id, hash, size = 1024) {
    return hash ? `${CDN}/banners/${id}/${hash}.png?size=${size}` : null;
}

// Devolve o usuário com bannerUrl (e a cor de destaque), ou o mesmo usuário se a busca falhar
// (a tela do banner então diz que não tem). Nunca lança.
export async function withBanner(user) {
    if (!user?.id) {
        return user;
    }

    if (user.bannerUrl !== undefined) {
        return user;
    }

    try {
        const account = await fetchAccount(user.id);

        return {
            ...user,
            bannerUrl: bannerUrl(user.id, account?.banner),
            accentColor: account?.accent_color ?? user.accentColor ?? null
        };

    } catch (error) {
        console.warn(
            "[USERINFO] Não consegui buscar o perfil da conta:",
            error.message
        );

        return user;
    }
}
