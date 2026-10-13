
// ==========================================
// API DO SITE (PAINEL DO JOGADOR)
// ==========================================

// Limites e prazos da API que o site usa (services/web-api.mjs). O que
// muda de ambiente para ambiente (porta, origens, chaves) vem de variáveis
// de ambiente; veja o README.

export const WEB_CONFIG = Object.freeze({
    // Endereço da API da VSync (troca do código, identidade e servidores).
    vsyncApi: "https://api.vsync.lat",

    // Verificação anti-robô da Cloudflare (Turnstile).
    turnstileVerifyUrl: "https://challenges.cloudflare.com/turnstile/v0/siteverify",

    // Quanto dura um login no site, em segundos (6 horas).
    sessionTtl: 6 * 60 * 60,

    // Quantas sessões uma mesma pessoa mantém ao mesmo tempo (navegador,
    // celular...). Ao entrar de novo além disso, as mais antigas saem.
    maxSessionsPerUser: 5,

    // Corpo máximo aceito em uma requisição.
    maxBodyBytes: 8 * 1024,

    // Tempo máximo esperando a VSync ou a Cloudflare, em milissegundos.
    upstreamTimeoutMs: 10_000,

    // Quantos servidores aparecem no painel.
    maxGuilds: 100,

    // De quanto em quanto tempo as sessões vencidas são apagadas.
    cleanupSeconds: 10 * 60,

    // Pedidos permitidos por janela, por IP e por pessoa.
    limits: Object.freeze({
        login: Object.freeze({ max: 10, windowSeconds: 10 * 60 }),
        claim: Object.freeze({ max: 20, windowSeconds: 10 * 60 }),
        read: Object.freeze({ max: 120, windowSeconds: 60 })
    })
});
