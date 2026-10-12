
// ==========================================
// CONFIGURAÇÃO DO SISTEMA DE CRIME
// ==========================================

// Todos os valores em reais são convertidos para
// centavos pela função reais(), como no resto da
// Helena. Ajuste os números aqui para equilibrar
// a economia, sem mexer na lógica dos serviços.

const reais = value => value * 100;

// ==========================================
// CRIME
// ==========================================

export const CRIME_CONFIG = Object.freeze({
    // Custo em energia (a energia máxima é 100).
    energyCost: 30,

    // Recarga contada a partir da tentativa,
    // com sucesso ou falha.
    cooldown: 60 * 60,

    // Vida mínima para cometer um crime.
    minHp: 30,

    // Chance fixa de sucesso. O nível não altera a
    // chance, só o valor do prêmio e da multa.
    successChance: 0.5,

    // Chance de um sucesso virar a história rara.
    jackpotChance: 1 / 16,

    // XP ganho em caso de sucesso.
    xp: Object.freeze({ min: 30, max: 80 }),

    // Falha: tempo de prisão e perda de vida.
    jailSeconds: 30 * 60,
    injuryHp: Object.freeze({ min: 15, max: 35 }),

    // Limite do saldo de dinheiro sujo.
    maxDirtyMoney: 100_000_000_000_000
});

// Multiplicador de prêmio e multa: 1,0 no nível 1,
// chegando a cerca de 12,9 no nível 100.
export function rewardScale(level) {
    const safe = Math.min(
        100,
        Math.max(1, Number(level) || 1)
    );

    return 1 + (safe - 1) * 0.12;
}

// Histórias de sucesso: [texto, mínimo, máximo] em reais.
export const CRIME_SUCCESS_STORIES = Object.freeze([
    ["Você aplicou o golpe do falso sorteio num grupo de mensagens.", 400, 900],
    ["Você revendeu ingressos falsificados na porta de um show.", 500, 1100],
    ["Você sumiu com a gorjeta de um caixa distraído.", 300, 700],
    ["Você clonou um cartão de fidelidade e vendeu os pontos.", 550, 1200],
    ["Você montou uma rifa fantasma no bairro.", 450, 1000],
    ["Você levou a bolsa esquecida numa mesa de café.", 350, 800],
    ["Você vendeu um \"celular importado\" que era um tijolo embrulhado.", 650, 1400],
    ["Você fraudou o troco numa lanchonete lotada.", 300, 750],
    ["Você abriu uma conta de fachada em nome de um laranja.", 800, 1700],
    ["Você revendeu cupons de desconto roubados.", 450, 1050],
    ["Você cobrou uma \"taxa de urgência\" por um contrato que nunca existiu.", 700, 1500],
    ["Você interceptou uma entrega e revendeu a mercadoria.", 900, 1800]
].map(([text, min, max]) => ({
    text,
    min: reais(min),
    max: reais(max)
})));

// História rara de sucesso.
export const CRIME_JACKPOT_STORY = Object.freeze({
    text: "Você achou um cofre aberto num escritório vazio. O melhor dia da sua carreira.",
    min: reais(4000),
    max: reais(8000)
});

// Histórias de falha. "injury" indica se a história
// termina com você ferido (perda de vida).
export const CRIME_FAILURE_STORIES = Object.freeze([
    { text: "Uma câmera de segurança filmou tudo.", injury: false },
    { text: "Um vizinho curioso chamou a viatura.", injury: false },
    { text: "Você tropeçou na fuga e caiu nos braços da polícia.", injury: true },
    { text: "Seu comparsa entregou você para aliviar a própria pena.", injury: false },
    { text: "A vítima era policial à paisana e reagiu.", injury: true },
    { text: "O alarme disparou na hora errada e você foi cercado.", injury: true },
    { text: "O golpe foi descoberto e a vítima chamou a patrulha.", injury: false },
    { text: "Você pulou um muro, mas a queda foi pior que a fuga.", injury: true }
]);

// Multa em caso de falha, em reais (antes do multiplicador).
// Sai da carteira e nunca passa do que você tem nela.
export const CRIME_FINE = Object.freeze({
    min: reais(80),
    max: reais(600)
});

// ==========================================
// LAVAGEM DE DINHEIRO
// ==========================================

export const LAUNDERING_CONFIG = Object.freeze({
    energyCost: 40,

    // Valor por operação (dinheiro sujo).
    minAmount: reais(1_000),
    maxAmount: reais(30_000),

    // Gemas para liberar a lavanderia privada (uma
    // única vez por servidor, por jogador).
    privateUnlockGems: 10,

    // Cada lote de 1 minuto sorteia a própria taxa
    // dentro da faixa, então o retorno tende à média.
    batchSeconds: 60,

    kinds: Object.freeze({
        public: Object.freeze({
            name: "Pública",
            perMinute: reais(750),
            rate: Object.freeze({ min: 0.35, max: 0.55 }),
            cooldown: 24 * 60 * 60,
            // Só uma lavagem pública por vez no servidor.
            exclusive: true
        }),

        private: Object.freeze({
            name: "Privada",
            perMinute: reais(1_200),
            rate: Object.freeze({ min: 0.75, max: 0.85 }),
            cooldown: 5 * 60 * 60,
            exclusive: false
        })
    })
});

// ==========================================
// PRISÃO
// ==========================================

// Comandos bloqueados enquanto o jogador cumpre pena.
// Consultas (saldo, perfil, inventário...) continuam
// liberadas. A lavagem decide sozinha o que bloquear.
export const PRISON_BLOCKED_COMMANDS = new Set([
    "crime",
    "trabalhar",
    "daily",
    "comprar",
    "vender",
    "depositar",
    "sacar",
    "transferir",
    "casar",
    "aceitarcasamento",
    "atacar",
    "aceitarduelo",
    "curar",
    "municao",
    "colete",
    "reparar"
]);
