
import { getItem, getItemUse } from "../../config/items.mjs";

import { getPlayer } from "../../database/economy.mjs";

import {
    getInventory,
    getItemQuantity,
    removeItem
} from "./inventory.mjs";

import {
    equipWeapon,
    getEquippedWeapon
} from "../combat/equipment.mjs";

import { restoreEnergy } from "./energy.mjs";

import { tx, now as clock } from "../combat/combat.mjs";

import { GameBlocked } from "../../utils/game-error.mjs";

// ==========================================
// USAR ITENS
// ==========================================

// Itens que a pessoa tem e pode usar: comida e bebida (repõem
// energia) e armas ainda não equipadas (Equipar). Comida primeiro.
export function usableItems(guildId, userId) {
    const equipped = getEquippedWeapon(guildId, userId)?.id ?? null;

    const list = [];

    for (const entry of getInventory(guildId, userId)) {
        const use = getItemUse(entry.item);

        if (!use) {
            continue;
        }

        // A arma equipada já está em uso.
        if (use.kind === "equip" && entry.item.id === equipped) {
            continue;
        }

        list.push({ item: entry.item, quantity: entry.quantity, use });
    }

    return list.sort((a, b) =>
        (a.use.kind === "equip") - (b.use.kind === "equip") ||
        a.item.name.localeCompare(b.item.name, "pt-BR")
    );
}

// Usa um item. quantity: número inteiro ou "max" (até a energia
// encher). Cada unidade de comida repõe energia e gasta 1 do item;
// equipar não gasta nada.
//
// Recusas (GameBlocked): item que não existe, que não é usável, que
// a pessoa não tem, quantidade inválida e energia já cheia (nesse caso
// o item NÃO é gasto). Se a energia encher no meio, para ali e só
// gasta o que foi usado.
export function useItem(
    guildId,
    userId,
    itemId,
    quantity = 1,
    { now = clock() } = {}
) {
    const item = getItem(itemId);

    if (!item) {
        throw new GameBlocked("Item inexistente", "Esse item não existe.");
    }

    const use = getItemUse(item);

    if (!use) {
        throw new GameBlocked(
            "Item não usável",
            `${item.emoji} **${item.name}** não pode ser usado.`
        );
    }

    getPlayer(guildId, userId);

    // ==================================
    // EQUIPAR
    // ==================================

    if (use.kind === "equip") {
        if (getItemQuantity(guildId, userId, itemId) < 1) {
            throw new GameBlocked(
                "Você não tem esse item",
                `Você não possui ${item.emoji} **${item.name}**.`
            );
        }

        try {
            equipWeapon(guildId, userId, itemId);

        } catch (error) {
            throw new GameBlocked("Não foi possível equipar", error.message);
        }

        return { kind: "equip", item, verb: use.verb };
    }

    // ==================================
    // REPOR ENERGIA
    // ==================================

    return tx(() => {
        const owned = getItemQuantity(guildId, userId, itemId);

        if (owned < 1) {
            throw new GameBlocked(
                "Você não tem esse item",
                `Você não possui ${item.emoji} **${item.name}**.`
            );
        }

        const wanted = quantity === "max" ? owned : quantity;

        if (!Number.isInteger(wanted) || wanted < 1) {
            throw new GameBlocked(
                "Quantidade inválida",
                "Use um número inteiro maior que zero, ou `max`."
            );
        }

        if (wanted > owned) {
            throw new GameBlocked(
                "Quantidade inválida",
                `Você tem **${owned}** de ${item.emoji} ${item.name}.`
            );
        }

        let used = 0;
        let gained = 0;
        let wasted = 0;
        let last = null;

        for (let i = 0; i < wanted; i++) {
            const result = restoreEnergy(guildId, userId, use.energy, now);

            if (!result.success) {
                // Energia cheia: não gasta mais nada. Se foi logo na
                // primeira, a ação inteira é recusada.
                if (used === 0) {
                    throw new GameBlocked(
                        "Energia cheia",
                        `Sua energia já está cheia (${result.energy}/${result.max}). ` +
                        "O item não foi gasto."
                    );
                }

                break;
            }

            removeItem(guildId, userId, itemId, 1);

            used++;
            gained += result.gained;
            wasted += result.wasted;
            last = result;
        }

        return {
            kind: "energy",
            item,
            verb: use.verb,
            requested: wanted,
            used,
            gained,
            wasted,
            energy: last.energy,
            max: last.max,
            remaining: owned - used
        };
    });
}

// Frase curta do que aconteceu, para o painel e as respostas.
export function describeUse(result) {
    if (result.kind === "equip") {
        return `✅ Você equipou ${result.item.emoji} **${result.item.name}**.`;
    }

    return (
        `✅ **${result.item.emoji} ${result.item.name}**` +
        (result.used > 1 ? ` ×${result.used}` : "") +
        ` usado: **+${result.gained} de energia** ` +
        `(${result.energy}/${result.max}).` +
        (result.wasted > 0 ? ` ${result.wasted} se perderam.` : "") +
        (
            result.used < result.requested
                ? ` Parei em ${result.used}: a energia encheu.`
                : ""
        ) +
        ` Restam ${result.remaining}.`
    );
}
