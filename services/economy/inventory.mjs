
import { db } from "../../database/connection.mjs";

import {
    ITEMS,
    getItem
} from "../../config/items.mjs";

// ==========================================
// UTILITÁRIOS
// ==========================================

function validatePlayer(guildId, userId) {
    if (
        typeof guildId !== "string" ||
        typeof userId !== "string" ||
        !guildId ||
        !userId
    ) {
        throw new Error("Jogador inválido.");
    }
}

function validateQuantity(quantity) {
    if (
        !Number.isSafeInteger(quantity) ||
        quantity <= 0
    ) {
        throw new Error(
            "A quantidade deve ser um inteiro positivo."
        );
    }
}

function requireTransaction() {
    if (!db.isTransaction) {
        throw new Error(
            "Esta operação exige uma transação SQLite."
        );
    }
}

// ==========================================
// CONSULTAR INVENTÁRIO
// ==========================================

export function getInventory(guildId, userId) {
    validatePlayer(guildId, userId);

    const rows = db.prepare(`
        SELECT
            item_id,
            quantity,
            created_at,
            updated_at
        FROM inventory
        WHERE guild_id = ?
          AND user_id = ?
          AND quantity > 0
        ORDER BY item_id ASC
    `).all(guildId, userId);

    return rows.map(row => {
        const item = getItem(row.item_id);

        return {
            ...row,
            item,
            name: item?.name ?? "Item desconhecido",
            emoji: item?.emoji ?? "📦",
            category: item?.category ?? "unknown"
        };
    });
}

// ==========================================
// CONSULTAR QUANTIDADE
// ==========================================

export function getItemQuantity(
    guildId,
    userId,
    itemId
) {
    validatePlayer(guildId, userId);

    const row = db.prepare(`
        SELECT quantity
        FROM inventory
        WHERE guild_id = ?
          AND user_id = ?
          AND item_id = ?
    `).get(
        guildId,
        userId,
        itemId
    );

    return row?.quantity ?? 0;
}

// ==========================================
// ADICIONAR ITEM
// ==========================================

// Deve ser executada dentro da mesma transação
// que concede o item ou desconta seu preço.

export function addItem(
    guildId,
    userId,
    itemId,
    quantity = 1
) {
    requireTransaction();
    validatePlayer(guildId, userId);
    validateQuantity(quantity);

    const item = getItem(itemId);

    if (!item) {
        throw new Error(
            "Este item não existe no catálogo."
        );
    }

    const current = getItemQuantity(
        guildId,
        userId,
        itemId
    );

    if (quantity > item.maxStack - current) {
        throw new Error(
            `Você pode armazenar no máximo ${item.maxStack} unidade(s) de ${item.name}.`
        );
    }

    const result = db.prepare(`
        INSERT INTO inventory (
            guild_id,
            user_id,
            item_id,
            quantity
        )
        VALUES (?, ?, ?, ?)

        ON CONFLICT (
            guild_id,
            user_id,
            item_id
        )
        DO UPDATE SET
            quantity = inventory.quantity + excluded.quantity,
            updated_at = unixepoch()
    `).run(
        guildId,
        userId,
        itemId,
        quantity
    );

    if (result.changes !== 1) {
        throw new Error(
            "Não foi possível adicionar o item."
        );
    }

    return {
        item,
        added: quantity,
        quantity: current + quantity
    };
}

// ==========================================
// REMOVER ITEM
// ==========================================

// Também exige uma transação ativa.

export function removeItem(
    guildId,
    userId,
    itemId,
    quantity = 1
) {
    requireTransaction();
    validatePlayer(guildId, userId);
    validateQuantity(quantity);

    const item = getItem(itemId);

    if (!item) {
        throw new Error(
            "Este item não existe no catálogo."
        );
    }

    const result = db.prepare(`
        UPDATE inventory
        SET
            quantity = quantity - ?,
            updated_at = unixepoch()
        WHERE guild_id = ?
          AND user_id = ?
          AND item_id = ?
          AND quantity >= ?
    `).run(
        quantity,
        guildId,
        userId,
        itemId,
        quantity
    );

    if (result.changes !== 1) {
        throw new Error(
            `Você não possui ${quantity} unidade(s) de ${item.name}.`
        );
    }

    db.prepare(`
        DELETE FROM inventory
        WHERE guild_id = ?
          AND user_id = ?
          AND item_id = ?
          AND quantity = 0
    `).run(
        guildId,
        userId,
        itemId
    );

    return {
        item,
        removed: quantity,
        quantity: getItemQuantity(
            guildId,
            userId,
            itemId
        )
    };
}

// ==========================================
// ESTATÍSTICAS
// ==========================================

export function getInventoryStats(guildId, userId) {
    const inventory = getInventory(
        guildId,
        userId
    );

    const totalQuantity = inventory.reduce(
        (total, entry) => total + entry.quantity,
        0
    );

    return {
        uniqueItems: inventory.length,
        totalQuantity,
        catalogSize: ITEMS.length
    };
}