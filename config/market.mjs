
// ==========================================
// BOLSA (MERCADO DO SERVIDOR)
// ==========================================

// Cada servidor tem um índice de mercado que muda de tempos em tempos e mexe
// nos preços da loja, e um item "em alta" que paga mais na venda. Os valores
// abaixo são os de tabela de config/items.mjs vezes o índice. O serviço fica
// em services/market.mjs.

export const MARKET_CONFIG = Object.freeze({
    // De quanto em quanto tempo o mercado sorteia um novo índice (30 minutos).
    intervalSeconds: 30 * 60,

    // O índice vai de 0 a 90, sorteado com a mesma chance para cada número,
    // sem olhar o índice anterior. O 45 é o preço de tabela.
    indexMax: 90,

    // Preço em pontos-base (10000 = preço de tabela): 90% no índice 0 e
    // 110% no índice 90, em linha reta. Cada 9 pontos de índice mexem 2%.
    minPriceBp: 9_000,
    maxPriceBp: 11_000,

    // Faixas do índice, só para o texto (cada uma sai em 1 de cada 3 sorteios).
    bands: Object.freeze([
        Object.freeze({ id: "low", label: "Baixo", emoji: "📉", max: 29 }),
        Object.freeze({ id: "medium", label: "Médio", emoji: "➖", max: 60 }),
        Object.freeze({ id: "high", label: "Alto", emoji: "📈", max: 90 })
    ]),

    // Item em alta: a cada sorteio, um item vendável paga mais, de 5,5% a
    // 24,5%, por cima do preço já ajustado pelo índice. Vale só para a venda.
    hotBonusMinBp: 550,
    hotBonusMaxBp: 2_450
});
