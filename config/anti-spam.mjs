// ==========================================
// INTERVALO ENTRE COMANDOS (ANTI-SPAM)
// ==========================================

// Depois de usar um comando, a mesma pessoa espera este tempo para usar o
// próximo. Vale para os comandos de barra e para o prefixo h, em qualquer
// servidor. É só para o bot não ser sobrecarregado: nada a ver com as esperas
// do jogo (daily, trabalho, crime...), que ficam em config/cooldowns.mjs. O
// serviço fica em services/anti-spam.mjs.

export const ANTI_SPAM = Object.freeze({
    // Tempo mínimo entre dois comandos da mesma pessoa.
    commandCooldownSeconds: 3,

    // Os donos do bot (HELENA_OWNER_ID) esperam como todo mundo. Com true, eles
    // passam direto: útil para trabalhar rápido, mas quem testa o intervalo
    // sendo dono acha que ele não funciona.
    exemptOwners: false
});
