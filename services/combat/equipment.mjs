
import { db } from "../../database/connection.mjs";

import {
    getItem
} from "../../config/items.mjs";

import {
    getItemQuantity
} from "../economy/inventory.mjs";

export function getEquippedWeapon(guildId, userId) {
    if (!guildId || !userId) {
        throw new Error("Jogador inválido.");
    }

    const row = db.prepare(`
        SELECT item_id
        FROM equipped_items
        WHERE guild_id = ?
          AND user_id = ?
          AND slot = 'weapon'
    `).get(guildId, userId);

    if (!row) {
        return null;
    }

    const item = getItem(row.item_id);

    if (
        !item ||
        item.category !== "weapon" ||
        getItemQuantity(guildId, userId, row.item_id) < 1
    ) {
        return null;
    }

    return item;
}

export function equipWeapon(guildId, userId, itemId) {
    if (!guildId || !userId) {
        throw new Error("Jogador inválido.");
    }

    if (typeof itemId !== "string" || !itemId.trim()) {
        throw new Error("Informe uma arma válida.");
    }

    const item = getItem(itemId.trim());

    if (!item) {
        throw new Error("Essa arma não existe.");
    }

    if (item.category !== "weapon") {
        throw new Error(
            "Esse item não é uma arma e não pode ser equipado neste espaço."
        );
    }

    db.exec("BEGIN IMMEDIATE");

    try {
        const quantity = getItemQuantity(
            guildId,
            userId,
            item.id
        );

        if (quantity < 1) {
            throw new Error(
                "Você não possui essa arma no inventário."
            );
        }

        const current = getEquippedWeapon(
            guildId,
            userId
        );

        if (current?.id === item.id) {
            throw new Error(
                "Essa arma já está equipada."
            );
        }

        db.prepare(`
            INSERT INTO equipped_items (
                guild_id,
                user_id,
                slot,
                item_id
            )
            VALUES (?, ?, 'weapon', ?)

            ON CONFLICT (guild_id, user_id)
            DO UPDATE SET
                slot = excluded.slot,
                item_id = excluded.item_id,
                equipped_at = unixepoch()
        `).run(guildId, userId, item.id);

        db.exec("COMMIT");

        return item;

    } catch (error) {
        if (db.isTransaction) {
            db.exec("ROLLBACK");
        }

        throw error;
    }
}

export function unequipWeapon(guildId, userId) {
    if (!guildId || !userId) {
        throw new Error("Jogador inválido.");
    }

    db.exec("BEGIN IMMEDIATE");

    try {
        const current = getEquippedWeapon(
            guildId,
            userId
        );

        const result = db.prepare(`
            DELETE FROM equipped_items
            WHERE guild_id = ?
              AND user_id = ?
              AND slot = 'weapon'
        `).run(guildId, userId);

        if (result.changes !== 1) {
            throw new Error(
                "Você não possui nenhuma arma equipada."
            );
        }

        db.exec("COMMIT");

        return current;

    } catch (error) {
        if (db.isTransaction) {
            db.exec("ROLLBACK");
        }

        throw error;
    }
}