// ==========================================
// CAIXAS E PACOTES (/abrir)
// ==========================================

// Dois tipos, e a diferença é a regra que protege a Helena da lei (ECA Digital, art. 20: caixas de recompensa
// em jogo de acesso provável por adolescentes) e do que os termos do site prometem ("sem caixas de recompensa
// pagas"):
//
//   fixed    PACOTE: o conteúdo é sempre o mesmo e aparece antes da compra. Pode ser vendido na loja.
//   random   CAIXA: um prêmio sorteado numa tabela. NUNCA pode ser comprado, com dinheiro, gemas ou o que for:
//            só se ganha de graça (os drops do chat, a pesca, missões). tests/site.test.mjs trava isso.
//
// O serviço fica em services/economy/boxes.mjs e a tela em services/economy/boxes-view.mjs.

// ----- pacote (fixed) -----
//   { kind: "fixed", contents: [{ item, quantity }] }

// ----- caixa (random) -----
// O sorteio escolhe um prêmio com a chance "weight" (peso) dividida pela soma dos pesos da tabela. Dinheiro é em
// centavos, sempre em reais inteiros (min e max são múltiplos de 100).
//
//   { id, tier, weight, money: [min, max] }       dinheiro, um valor sorteado entre min e max
//   { id, tier, weight, item, quantity, fallback } itens; se não couberem na mochila (maxStack do item), o
//                                                 prêmio vira "fallback" centavos em dinheiro
//
// A caixa não tem preço (não se compra). O "valor de referência" é o que ela custava quando era vendida
// (10.000): a tabela devolve em média uns 3/4 dele, contando os itens pelo que valem na venda.
// tests/boxes.test.mjs trava essa conta (entre 70% e 90%), então mexer na tabela exige conferir o teste.

// Da mais comum à mais rara (a ordem também é a da exibição, da rara para a comum).
export const BOX_TIERS = Object.freeze({
    common: Object.freeze({ label: "Comum", emoji: "⚪" }),
    uncommon: Object.freeze({ label: "Incomum", emoji: "🟢" }),
    rare: Object.freeze({ label: "Rara", emoji: "🔵" }),
    epic: Object.freeze({ label: "Épica", emoji: "🟣" }),
    legendary: Object.freeze({ label: "Lendária", emoji: "🟡" })
});

export const BOX_TIER_ORDER = Object.freeze(Object.keys(BOX_TIERS));

const money = (id, tier, weight, minReais, maxReais) => Object.freeze({
    id,
    tier,
    weight,
    money: Object.freeze([minReais * 100, maxReais * 100])
});

const items = (id, tier, weight, item, quantity, fallbackReais) => Object.freeze({
    id,
    tier,
    weight,
    item,
    quantity,
    fallback: fallbackReais * 100
});

const pack = (...contents) => Object.freeze(contents.map(([item, quantity]) => Object.freeze({ item, quantity })));

export const BOXES = Object.freeze({
    // Pacote de suprimentos: 3 maçãs, 2 cafés e 1 energético (o que cada um custa na loja, 10% mais barato).
    supply_pack: Object.freeze({
        kind: "fixed",
        contents: pack(["apple", 3], ["coffee", 2], ["energy_drink", 1])
    }),

    // Caixa misteriosa: só de graça. Ainda não abre pelo /abrir (veja OPENABLE_BOXES).
    mystery_box: Object.freeze({
        kind: "random",

        // o que a caixa custava na loja (centavos), só para conferir a conta da tabela
        referenceValue: 10_000,

        prizes: Object.freeze([
            // comum: 60% das caixas
            money("cash_small", "common", 200, 50, 80),
            items("apples", "common", 150, "apple", 3, 4),
            items("coffees", "common", 150, "coffee", 2, 7),
            items("energy_one", "common", 100, "energy_drink", 1, 7),

            // incomum: 27%
            money("cash_medium", "uncommon", 170, 80, 120),
            items("energy_three", "uncommon", 100, "energy_drink", 3, 22),

            // rara: 10%
            money("cash_large", "rare", 70, 200, 300),
            items("energy_five", "rare", 30, "energy_drink", 5, 37),

            // épica: 2,5%
            money("cash_huge", "epic", 25, 400, 600),

            // lendária: 0,5% (o troféu não se vende; se já tiver o máximo, vira dinheiro)
            money("cash_jackpot", "legendary", 4, 2500, 2500),
            items("worker_medal", "legendary", 1, "worker_medal", 1, 50)
        ])
    })
});

// O que o /abrir abre hoje. A caixa misteriosa (sorteio) entra aqui quando existir de graça: o primeiro lugar
// será o drop do chat. Enquanto isso, quem já tem uma fica com ela guardada (não abre, não se vende).
export const OPENABLE_BOXES = Object.freeze(["supply_pack"]);

export function getBox(itemId) {
    return BOXES[itemId] ?? null;
}

// Quantas dá para abrir de uma vez.
export const MAX_OPEN_AT_ONCE = 25;
