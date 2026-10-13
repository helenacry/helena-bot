
// ==========================================
// BÔNUS DE GEMAS (COLETA NO SITE)
// ==========================================

// As gemas são da conta e valem em todos os servidores. Hoje só o
// administrador dá gemas; este bônus é a forma de ganhar pelo painel do
// site (services/gem-bonus.mjs). Ajuste os números aqui, sem mexer na lógica.

export const GEM_BONUS = Object.freeze({
    // Quantas gemas cada coleta rende (sorteio inclusivo).
    min: 1,
    max: 3,

    // Intervalo entre duas coletas, em segundos (5 horas).
    cooldown: 5 * 60 * 60
});
