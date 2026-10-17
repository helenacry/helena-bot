
import { db } from "../../database/connection.mjs";

import {
    getPlayer
} from "../../database/economy.mjs";

import {
    getItem
} from "../../config/items.mjs";

import {
    addItem,
    removeItem,
    getItemQuantity
} from "./inventory.mjs";

import {
    getMarket,
    buyPriceOf,
    sellPriceOf,
    isHot
} from "./market.mjs";

const MAX_CENTS = 100_000_000_000_000;
const MAX_QUANTITY = 99;

// ==========================================
// UTILITÁRIOS
// ==========================================

function validateQuantity(value) {
    const quantity = Number(value);

    if (
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > MAX_QUANTITY
    ) {
        throw new Error(
            `Informe uma quantidade entre 1 e ${MAX_QUANTITY}.`
        );
    }

    return quantity;
}

function transaction(callback) {
    if (db.isTransaction) {
        throw new Error(
            "Já existe uma transação em andamento."
        );
    }

    db.exec("BEGIN IMMEDIATE");

    try {
        const result = callback();

        if (result instanceof Promise) {
            throw new Error(
                "A operação da loja deve ser síncrona."
            );
        }

        db.exec("COMMIT");

        return result;

    } catch (error) {
        if (db.isTransaction) {
            db.exec("ROLLBACK");
        }

        throw error;
    }
}

function record(
    guildId,
    userId,
    type,
    amount
) {
    db.prepare(`
        INSERT INTO transactions (
            guild_id,
            user_id,
            target_id,
            type,
            amount
        )
        VALUES (?, ?, NULL, ?, ?)
    `).run(
        guildId,
        userId,
        type,
        amount
    );
}

// ==========================================
// COMPRAR ITEM
// ==========================================

// O preço é o do mercado do servidor na hora de confirmar (veja
// services/economy/market.mjs), não o que estava na tela quando a compra foi aberta.
export function buyItem(
    guildId,
    userId,
    itemId,
    requestedQuantity = 1,
    { now } = {}
) {
    const quantity = validateQuantity(
        requestedQuantity
    );

    const item = getItem(itemId);

    if (!item) {
        throw new Error(
            "Este item não existe."
        );
    }

    if (
        !Number.isSafeInteger(item.buyPrice) ||
        item.buyPrice <= 0
    ) {
        throw new Error(
            "Este item não está disponível para compra."
        );
    }

    const market = getMarket(guildId, now);

    const unitPrice = buyPriceOf(item, market);

    const total = unitPrice * quantity;

    if (!Number.isSafeInteger(total)) {
        throw new Error(
            "Valor da compra inválido."
        );
    }

    return transaction(() => {
        const player = getPlayer(
            guildId,
            userId
        );

        const currentQuantity = getItemQuantity(
            guildId,
            userId,
            itemId
        );

        if (
            quantity > item.maxStack - currentQuantity
        ) {
            throw new Error(
                `Você pode armazenar no máximo ${item.maxStack} unidade(s) de ${item.name}. Atualmente possui ${currentQuantity}.`
            );
        }

        if (player.wallet < total) {
            throw new Error(
                "Você não possui dinheiro suficiente na carteira."
            );
        }

        // Desconta o dinheiro.
        const payment = db.prepare(`
            UPDATE players
            SET wallet = wallet - ?
            WHERE guild_id = ?
              AND user_id = ?
              AND wallet >= ?
        `).run(
            total,
            guildId,
            userId,
            total
        );

        if (payment.changes !== 1) {
            throw new Error(
                "Não foi possível processar o pagamento."
            );
        }

        // Adiciona os itens na mesma transação.
        const inventoryResult = addItem(
            guildId,
            userId,
            itemId,
            quantity
        );

        record(
            guildId,
            userId,
            "shop_buy",
            total
        );

        return {
            item,
            quantity,
            total,
            unitPrice,
            market,
            wallet: player.wallet - total,
            inventoryQuantity: inventoryResult.quantity
        };
    });
}

// ==========================================
// VENDER ITEM
// ==========================================

export function sellItem(
    guildId,
    userId,
    itemId,
    requestedQuantity = 1,
    { now } = {}
) {
    const quantity = validateQuantity(
        requestedQuantity
    );

    const item = getItem(itemId);

    if (!item) {
        throw new Error(
            "Este item não existe."
        );
    }

    if (
        !item.sellable ||
        !Number.isSafeInteger(item.sellPrice) ||
        item.sellPrice <= 0
    ) {
        throw new Error(
            "Este item não pode ser vendido."
        );
    }

    const market = getMarket(guildId, now);

    const unitPrice = sellPriceOf(item, market);

    const total = unitPrice * quantity;

    if (!Number.isSafeInteger(total)) {
        throw new Error(
            "Valor da venda inválido."
        );
    }

    return transaction(() => {
        const player = getPlayer(
            guildId,
            userId
        );

        const currentQuantity = getItemQuantity(
            guildId,
            userId,
            itemId
        );

        if (currentQuantity < quantity) {
            throw new Error(
                `Você possui apenas ${currentQuantity} unidade(s) de ${item.name}.`
            );
        }

        if (player.wallet > MAX_CENTS - total) {
            throw new Error(
                "Sua carteira não comporta o valor desta venda."
            );
        }

        // Remove os itens.
        const inventoryResult = removeItem(
            guildId,
            userId,
            itemId,
            quantity
        );

        // Credita o pagamento.
        const payment = db.prepare(`
            UPDATE players
            SET wallet = wallet + ?
            WHERE guild_id = ?
              AND user_id = ?
              AND wallet <= ?
        `).run(
            total,
            guildId,
            userId,
            MAX_CENTS - total
        );

        if (payment.changes !== 1) {
            throw new Error(
                "Não foi possível concluir o pagamento."
            );
        }

        record(
            guildId,
            userId,
            "shop_sell",
            total
        );

        return {
            item,
            quantity,
            total,
            unitPrice,
            hot: isHot(item, market),
            market,
            wallet: player.wallet + total,
            inventoryQuantity: inventoryResult.quantity
        };
    });
}