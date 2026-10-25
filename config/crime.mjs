
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
    minAmount: reais(20_000),
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
// ROUBO DE JOGADORES
// ==========================================

export const ROBBERY_CONFIG = Object.freeze({
    // Custo em energia (a energia máxima é 100).
    energyCost: 50,

    // Recarga, contada a partir de cada tentativa.
    cooldown: 60 * 60,

    // Vida mínima para tentar roubar.
    minHp: 30,

    // A carteira do alvo precisa ter MAIS que isso. Com menos, a
    // tentativa sempre falha, mas gasta energia e recarga.
    minTargetWallet: reais(100),

    // Parte da carteira do alvo levada em caso de sucesso.
    stealRate: Object.freeze({ min: 0.10, max: 0.25 }),

    // Teto do roubo: carteiras até capThreshold rendem no máximo
    // capBase; acima disso soma capExcessRate do que passa do limite,
    // sem nunca ultrapassar capMax.
    capBase: reais(4_000),
    capThreshold: reais(16_000),
    capExcessRate: 0.033,
    capMax: reais(15_000),

    // Do que foi levado, esta parte vem limpa para a carteira e o
    // resto vira dinheiro sujo (que precisa ser lavado).
    cleanShare: 0.5,

    // Revide: se a tentativa falha e o alvo está armado (e, com arma
    // de fogo, tem munição), existe esta chance de ferir o ladrão.
    retaliationChance: 0.5,
    retaliationHp: Object.freeze({ min: 30, max: 50 }),

    // Ferimento na fuga depois de um roubo bem-sucedido.
    escapeInjuryChance: 0.18,

    injuryLevels: Object.freeze([
        Object.freeze({ name: "leve", weight: 20, hp: 10 }),
        Object.freeze({ name: "moderado", weight: 60, hp: 25 }),
        Object.freeze({ name: "grave", weight: 20, hp: 45 })
    ])
});

// Chance base de sucesso (em %) conforme a arma equipada. Armas de
// fogo precisam de munição (1 por roubo bem-sucedido); armas brancas
// não. Arma desconhecida usa ROBBERY_DEFAULT_CHANCE.
export const ROBBERY_WEAPON_CHANCE = Object.freeze({
    wooden_sword: 8,
    iron_sword: 12,
    steel_sword: 18,

    pocket_knife: 10,
    combat_knife: 15,
    machete: 20,
    katana: 30,
    legendary_blade: 45,

    revolver: 25,
    pistol: 40,
    smg: 60,
    shotgun: 70,
    assault_rifle: 85,
    sniper_rifle: 30
});

export const ROBBERY_DEFAULT_CHANCE = 10;

// ==========================================
// PROCURADOS
// ==========================================

export const WANTED_PAGE_SIZE = 8;

// ==========================================
// FUGA DA PRISÃO
// ==========================================

// Minigame de 3 etapas. Em cada uma o guarda vigia (clicar = ser
// pego), às vezes finge virar as costas (clicar = ser pego) e por fim
// abre o corredor: é preciso apertar a saída certa dentre 8, a tempo.
export const ESCAPE_CONFIG = Object.freeze({
    stages: 3,
    exits: 8,

    // Intervalo mínimo entre tentativas, contado do início da anterior.
    cooldown: 10 * 60,

    // Efeito na pena (em fração da pena original): vencer corta,
    // ser pego acrescenta. O total acumulado nunca passa de maxChange
    // para nenhum dos lados.
    winCut: 0.15,
    lossAdd: 0.10,
    maxChange: 0.50,

    // Tempos de cada etapa, em milissegundos.
    watchMs: Object.freeze({ min: 2_500, max: 7_000 }),
    feintChance: 0.5,
    feintMs: 1_500,
    // Depois de um fingimento, o corredor nunca abre em menos disso.
    afterFeintMs: Object.freeze({ min: 2_000, max: 3_500 }),
    openMs: 4_000
});

// ==========================================
// PRISÃO
// ==========================================

// Comandos bloqueados enquanto o jogador cumpre pena.
// Consultas (saldo, perfil, inventário...) continuam
// liberadas. A lavagem decide sozinha o que bloquear.
export const PRISON_BLOCKED_COMMANDS = new Set([
    "crime",
    "roubar",
    "trabalhar",
    "daily",
    "comprar",
    "vender",
    "depositar",
    "sacar",
    "transferir",
    "casar",
    "aceitarcasamento",
    "gozofone",
    "atacar",
    "aceitarduelo",
    "curar",
    "descartar",
    "usaritem",
    "municao",
    "colete",
    "reparar"
]);
