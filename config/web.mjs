
// ==========================================
// API DO SITE (PAINEL DO JOGADOR)
// ==========================================

// Limites e prazos da API que o site usa (services/web/web-api.mjs). O que
// muda de ambiente para ambiente (porta, origens, chaves) vem de variáveis
// de ambiente; veja o README.

export const WEB_CONFIG = Object.freeze({
    // Endereço da API do Discord (troca do código, identidade e servidores).
    discordApi: "https://discord.com/api/v10",

    // Verificação anti-robô da Cloudflare (Turnstile).
    turnstileVerifyUrl: "https://challenges.cloudflare.com/turnstile/v0/siteverify",

    // Quanto dura um login no site, em segundos (6 horas).
    sessionTtl: 6 * 60 * 60,

    // Quantas sessões uma mesma pessoa mantém ao mesmo tempo (navegador,
    // celular...). Ao entrar de novo além disso, as mais antigas saem.
    maxSessionsPerUser: 5,

    // Corpo máximo aceito em uma requisição.
    maxBodyBytes: 8 * 1024,

    // Tempo máximo esperando o Discord ou a Cloudflare, em milissegundos.
    upstreamTimeoutMs: 10_000,

    // Se o Discord responder 401 ao ler a conta logo depois de emitir o acesso, a
    // API espera estes tempos (ms) e tenta de novo antes de desistir do login.
    userinfoRetryMs: Object.freeze([800, 2500]),

    // Quantos dias o registro de entradas e coletas (web_claim_log, com IP e
    // navegador) fica guardado. A política de privacidade do site cita este
    // prazo: se mudar aqui, mude lá (site/privacy/index.html).
    claimLogDays: 90,

    // Quantos servidores aparecem no painel.
    maxGuilds: 100,

    // De quanto em quanto tempo as sessões vencidas são apagadas.
    cleanupSeconds: 10 * 60,

    // Pedidos permitidos por janela, por IP e por pessoa.
    limits: Object.freeze({
        // Qualquer chamada que pede sessão (/api/me, coletas, sair), por IP e ANTES de
        // consultar o banco: segura quem inunda a API com token falso.
        auth: Object.freeze({ max: 240, windowSeconds: 60 }),
        login: Object.freeze({ max: 10, windowSeconds: 10 * 60 }),
        claim: Object.freeze({ max: 20, windowSeconds: 10 * 60 }),
        read: Object.freeze({ max: 120, windowSeconds: 60 })
    })
});
