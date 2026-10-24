
// ==========================================
// EMBEDS ATUALIZADOS AO VIVO
// ==========================================

// O Discord não tem horário que se atualiza sozinho no
// cliente, então a contagem é feita editando a mensagem.
// A documentação não informa um limite para edições
// (rotas gerais: 300 por minuto por bot), por isso o
// intervalo é de vários segundos e há um teto de
// atualizações simultâneas.

// Intervalo entre edições. Pode ser ajustado com
// HELENA_LIVE_INTERVAL_MS (mínimo de 2 segundos).
const configured = Number(process.env.HELENA_LIVE_INTERVAL_MS);

export const LIVE_CONFIG = Object.freeze({
    intervalMs: Number.isFinite(configured) && configured >= 2_000
        ? configured
        : 10_000,

    // Atualizações ao vivo ao mesmo tempo no bot.
    // 30 edições a cada 10 s = 180 por minuto.
    maxActive: 30,

    // Mensagem normal do canal (prefixo h): sem limite da
    // API, mas a atualização não corre para sempre.
    channelMaxMs: 60 * 60 * 1000,

    // Resposta de slash: o token da interação vale 15
    // minutos, então para um pouco antes.
    interactionMaxMs: 14 * 60 * 1000
});
