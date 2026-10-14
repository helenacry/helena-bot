
// ==========================================
// BÔNUS DE GEMAS (COMANDO E SITE)
// ==========================================

// As gemas são da conta e valem em todos os servidores. Fora a administração,
// este bônus é a forma de ganhar: pelo comando /coletargemas ou pelo painel do
// site. Os dois usam o mesmo serviço (services/gem-bonus.mjs) e a mesma recarga,
// então coletar em um já vale no outro. Ajuste os números aqui, sem mexer na lógica.

export const GEM_BONUS = Object.freeze({
    // Quantas gemas cada coleta rende (sorteio inclusivo).
    min: 1,
    max: 3,

    // Intervalo entre duas coletas, em segundos (5 horas).
    cooldown: 5 * 60 * 60
});
