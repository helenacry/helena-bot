// ==========================================
// DROPS NO CHAT
// ==========================================

// Quando um servidor liga os drops (/servidor), a Helena às vezes solta um presente no chat: a primeira pessoa que
// aperta o botão leva. Tudo é de GRAÇA e não se compra: é aqui que a Caixa misteriosa (sorteio) tem uma fonte de
// graça, a condição de config/boxes.mjs para ela poder ser aberta com /abrir. Nada é cobrado de ninguém.
//
// Os drops só aparecem onde há conversa (várias mensagens de pelo menos duas pessoas nos últimos minutos), no máximo
// um por servidor a cada 2 horas, e cada pessoa leva no máximo 5 por dia em cada servidor. A lógica está em
// services/economy/drops.mjs.

export const DROP_CONFIG = Object.freeze({
    // O sorteio roda a cada minuto; este é o intervalo, em milissegundos.
    tickMs: 60_000,

    // Entre dois drops do mesmo servidor, no mínimo.
    minIntervalMs: 2 * 60 * 60 * 1000,

    // Quanto tempo o drop fica no chat antes de sumir.
    expireMs: 60_000,

    // Quantos drops uma pessoa leva por dia (UTC) em cada servidor.
    dailyCap: 5,

    // A conversa que conta: as mensagens dos últimos minutos, de pelo menos duas pessoas.
    chatWindowMs: 10 * 60 * 1000,
    minMessages: 8,
    minPeople: 2,

    // A chance de soltar um drop em cada rodada em que o servidor está elegível.
    chancePerTick: 0.15
});

// O que pode vir no drop. "weight" é o peso do sorteio. Dinheiro em centavos (min e max múltiplos de 100), item com
// quantidade. Se o item não couber na mochila, a pessoa leva "fallback" centavos no lugar.
//
// A Caixa misteriosa é rara (5%) e é o único jeito de ganhá-la.
export const DROP_PRIZES = Object.freeze([
    Object.freeze({ id: "money", weight: 50, money: Object.freeze([3000, 12000]) }),
    Object.freeze({ id: "apples", weight: 14, item: "apple", quantity: 3, fallback: 900 }),
    Object.freeze({ id: "coffees", weight: 12, item: "coffee", quantity: 2, fallback: 1400 }),
    Object.freeze({ id: "energy", weight: 8, item: "energy_drink", quantity: 1, fallback: 1500 }),
    Object.freeze({ id: "pack", weight: 11, item: "supply_pack", quantity: 1, fallback: 3400 }),
    Object.freeze({ id: "box", weight: 5, item: "mystery_box", quantity: 1, fallback: 5000 })
]);
