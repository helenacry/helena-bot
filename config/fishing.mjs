// ==========================================
// PESCA (/pescar)
// ==========================================

// Com a Vara de pesca no inventário, /pescar lança a linha: gasta energia, dá um pouco de XP e traz um item sorteado
// da tabela abaixo (ou nada). Os peixes e os lixos são itens da categoria "fish" (config/items.mjs): não se compram, e
// se vendem com /vender, pelo preço do mercado.
//
// Tudo aqui é de graça de pescar: a vara é uma ferramenta (ela só dá o direito de lançar a linha), e o que sai é
// sempre um item com preço de venda, sem caixa nem sorteio pago. O serviço fica em services/economy/fishing.mjs.

export const FISHING_CONFIG = Object.freeze({
    // O item que precisa estar no inventário.
    rod: "fishing_rod",

    // Espera entre duas pescarias, em segundos.
    cooldown: 10 * 60,

    // Energia gasta a cada lançamento (o trabalho gasta 10).
    energyCost: 5,

    // XP de cada lançamento, pegando ou não alguma coisa (o trabalho dá 25 por hora).
    xp: 3,

    maxWallet: 100_000_000_000_000
});

// Da mais comum à mais rara. "junk" é o lixo (vale quase nada).
export const FISHING_TIERS = Object.freeze({
    nothing: Object.freeze({ label: "Nada", emoji: "🌊" }),
    junk: Object.freeze({ label: "Lixo", emoji: "🗑️" }),
    common: Object.freeze({ label: "Comum", emoji: "⚪" }),
    uncommon: Object.freeze({ label: "Incomum", emoji: "🟢" }),
    rare: Object.freeze({ label: "Raro", emoji: "🔵" }),
    epic: Object.freeze({ label: "Épico", emoji: "🟣" }),
    legendary: Object.freeze({ label: "Lendário", emoji: "🟡" })
});

// A tabela de sorteio: o "weight" (peso) de cada linha dividido pela soma dos pesos é a chance. Ela soma 1000 para a
// chance ser o peso em décimos de por cento (a pirarucu: 3 em 1000 = 0,3%). Uma linha sem "item" é a linha em que a
// isca volta vazia.
//
// O valor médio de cada lançamento (contando o preço base de venda de cada item) fica perto de R$ 9. O trabalho
// mais fraco paga R$ 150 por hora, então a pesca é um complemento, não um substituto: tests/fishing.test.mjs trava
// a conta (entre R$ 7 e R$ 11), então mexer na tabela exige conferir o teste.
const line = (id, tier, weight, item = null) => Object.freeze({ id, tier, weight, item });

export const FISHING_TABLE = Object.freeze([
    line("nothing", "nothing", 125),
    line("old_boot", "junk", 40, "old_boot"),
    line("tin_can", "junk", 30, "tin_can"),
    line("lambari", "common", 290, "lambari"),
    line("tilapia", "common", 210, "tilapia"),
    line("carp", "uncommon", 130, "carp"),
    line("catfish", "uncommon", 80, "catfish"),
    line("dourado", "rare", 50, "dourado"),
    line("pintado", "rare", 30, "pintado"),
    line("tucunare", "epic", 12, "tucunare"),
    line("pirarucu", "legendary", 3, "pirarucu")
]);
