// ==========================================
// A MOCHILA
// ==========================================

// O inventário tem um limite TOTAL de unidades (somando todos os itens), além do limite de cada item (maxStack).
// Todo mundo começa com baseCapacity; ter uma mochila (um item com "capacity" em config/items.mjs) soma o espaço
// dela. Só vale a MAIOR mochila que a pessoa tem (as menores não somam). A conta fica em
// services/economy/backpack.mjs e quem põe item no inventário (addItem) confere o espaço.
//
// Quem já tinha mais itens do que cabe quando a regra entrou não perde nada: só não consegue pôr mais até liberar
// espaço (vendendo, descartando ou comprando uma mochila maior).

export const INVENTORY_CONFIG = Object.freeze({
    baseCapacity: 100
});
