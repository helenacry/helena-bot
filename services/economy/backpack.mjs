import { db } from "../../database/connection.mjs";

import { ITEMS } from "../../config/items.mjs";

import { INVENTORY_CONFIG } from "../../config/inventory.mjs";

// ==========================================
// O ESPAÇO DA MOCHILA
// ==========================================

// Quanto cabe no inventário, quanto já está ocupado e quanto sobra (config/inventory.mjs). Só lê o banco, e o
// inventory.mjs usa isto (por isso não importa de volta: nada de import circular).

const BACKPACKS = Object.freeze(ITEMS.filter(item => Number.isSafeInteger(item.capacity) && item.capacity > 0));

/** Quantas unidades a pessoa tem, somando todos os itens. */
export function inventoryUsed(guildId, userId) {
    const row = db.prepare(`
        SELECT COALESCE(SUM(quantity), 0) AS used
        FROM inventory
        WHERE guild_id = ?
          AND user_id = ?
    `).get(String(guildId), String(userId));

    return row?.used ?? 0;
}

/** O espaço total: a base mais a maior mochila que a pessoa tem. { base, bonus, total, backpack } */
export function inventoryCapacity(guildId, userId) {
    const owned = db.prepare(`
        SELECT item_id
        FROM inventory
        WHERE guild_id = ?
          AND user_id = ?
          AND quantity > 0
    `).all(String(guildId), String(userId)).map(row => row.item_id);

    const best = BACKPACKS
        .filter(item => owned.includes(item.id))
        .sort((a, b) => b.capacity - a.capacity)[0] ?? null;

    const base = INVENTORY_CONFIG.baseCapacity;

    const bonus = best?.capacity ?? 0;

    return { base, bonus, total: base + bonus, backpack: best };
}

/** Quantas unidades ainda cabem (nunca negativo: quem passou do limite fica com 0). */
export function inventoryRoom(guildId, userId) {
    return Math.max(0, inventoryCapacity(guildId, userId).total - inventoryUsed(guildId, userId));
}

/** { used, total, room, backpack } numa chamada só (para as telas). */
export function inventorySpace(guildId, userId) {
    const { total, backpack } = inventoryCapacity(guildId, userId);

    const used = inventoryUsed(guildId, userId);

    return { used, total, room: Math.max(0, total - used), backpack };
}
