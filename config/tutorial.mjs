// ==========================================
// O TUTORIAL (/tutorial)
// ==========================================

// Uma lista de primeiros passos. Cada passo se confere sozinho pelo que a pessoa já fez (nada é marcado à mão), então
// quem já jogou entra com vários passos prontos. Cumpridos todos, há um prêmio de uma vez só por servidor.
//
// "check": como saber que o passo foi feito (services/progress/tutorial.mjs):
//   job           já escolheu um emprego
//   stat          o contador do jogo (services/progress/stats.mjs) passou de zero
//   transaction   há uma linha desse tipo no extrato interno (transactions)
// Uma lista em "any" vale se QUALQUER uma das condições for verdadeira (quem jogou antes de os contadores existirem
// tem o extrato).

export const TUTORIAL_STEPS = Object.freeze([
    {
        id: "job",
        emoji: "🧾",
        title: "Escolha um emprego",
        hint: "Use /trabalhar e escolha no menu",
        check: { any: [{ kind: "job" }] }
    },
    {
        id: "work",
        emoji: "💼",
        title: "Faça o primeiro expediente",
        hint: "Use /trabalhar",
        check: { any: [{ kind: "stat", key: "event_work" }, { kind: "transaction", type: "work" }] }
    },
    {
        id: "daily",
        emoji: "🎁",
        title: "Resgate o daily no site",
        hint: "O /daily leva ao painel do site",
        check: { any: [{ kind: "stat", key: "event_daily" }, { kind: "transaction", type: "daily" }] }
    },
    {
        id: "deposit",
        emoji: "🏦",
        title: "Guarde dinheiro no banco",
        hint: "Use /depositar ou o botão do /saldo",
        check: { any: [{ kind: "stat", key: "event_deposit" }, { kind: "transaction", type: "deposit" }] }
    },
    {
        id: "shop",
        emoji: "🛒",
        title: "Compre algo na loja",
        hint: "Abra a /loja",
        check: { any: [{ kind: "transaction", type: "shop_buy" }] }
    },
    {
        id: "fish",
        emoji: "🎣",
        title: "Pesque pela primeira vez",
        hint: "Compre a vara na /loja e use /pescar",
        check: { any: [{ kind: "stat", key: "event_fish" }] }
    },
    {
        id: "mission",
        emoji: "📜",
        title: "Resgate uma missão",
        hint: "Veja o /missoes",
        check: { any: [{ kind: "transaction", type: "mission" }] }
    }
]);

// O prêmio de quem completa tudo (dinheiro em centavos e XP), uma vez por servidor.
export const TUTORIAL_REWARD = Object.freeze({
    money: 50000,
    xp: 100
});

// O contador do jogo que marca que o prêmio já foi pago.
export const TUTORIAL_CLAIM_KEY = "tutorial_claimed";
