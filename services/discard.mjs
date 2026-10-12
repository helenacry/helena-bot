
import { getInventory, removeItem, getItemQuantity } from "./inventory.mjs";

import { getEquippedWeapon } from "./equipment.mjs";

import { tx } from "./combat.mjs";

import { safeText } from "./user-lookup.mjs";

import {
    findByText,
    parseQuantity,
    resolveQuantity
} from "./panel-kit.mjs";

// ==========================================
// DESCARTAR ITENS
// ==========================================

// Descartar destrói o item, sem reembolso e sem desfazer. O fluxo
// tem duas etapas: escolher o item e a quantidade (prepareDiscard)
// e confirmar (discardItem).

// Resolve o que a pessoa digitou (item por nome ou ID, quantidade
// como número, "metade" ou "tudo") entre os itens que ela TEM.
// Devolve { ok: true, item, quantity, owned, equipped } ou
// { ok: false, title, message }.
export function prepareDiscard(guildId, userId, itemText, quantityText) {
    const text = String(itemText ?? "").trim();

    if (!text) {
        return {
            ok: false,
            title: "Faltou o item",
            message: "Diga o nome ou o ID do item que quer descartar."
        };
    }

    const inventory = getInventory(guildId, userId)
        .filter(entry => entry.item);

    const matches = findByText(
        inventory,
        text,
        entry => [entry.item.id, entry.item.name]
    );

    if (matches.length === 0) {
        return {
            ok: false,
            title: "Item não encontrado",
            message:
                "Você não tem nenhum item chamado **" +
                safeText(text) +
                "**. Use `/inventario` para ver o que tem."
        };
    }

    if (matches.length > 1) {
        return {
            ok: false,
            title: "Mais de um item encontrado",
            message:
                "Vários itens seus combinam com isso:\n\n" +
                matches.slice(0, 5)
                    .map(entry => `• ${entry.item.name} ×${entry.quantity}`)
                    .join("\n") +
                "\n\nSeja mais específico."
        };
    }

    const entry = matches[0];

    const quantity = resolveQuantity(
        parseQuantity(quantityText),
        entry.quantity
    );

    if (
        quantity === null ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > entry.quantity
    ) {
        return {
            ok: false,
            title: "Quantidade inválida",
            message:
                "Você tem **" + entry.quantity + "** de " +
                entry.item.name + ". Use um número de 1 a " +
                entry.quantity + ", `metade` ou `tudo`."
        };
    }

    const weapon = getEquippedWeapon(guildId, userId);

    return {
        ok: true,
        item: entry.item,
        quantity,
        owned: entry.quantity,

        // Descartar todas as unidades da arma equipada a desarma.
        equipped: weapon?.id === entry.item.id,
        disarms: weapon?.id === entry.item.id && quantity >= entry.quantity
    };
}

// Descarta de verdade. Roda numa transação e recusa se a pessoa não
// tiver mais a quantidade (por exemplo, vendeu depois de abrir a tela).
export function discardItem(guildId, userId, itemId, quantity) {
    return tx(() => {
        const result = removeItem(guildId, userId, itemId, quantity);

        return {
            item: result.item,
            removed: result.removed,
            remaining: getItemQuantity(guildId, userId, itemId)
        };
    });
}
