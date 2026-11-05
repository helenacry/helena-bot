
import { db } from "../../database/connection.mjs";

import { ITEMS, getItem } from "../../config/items.mjs";

import { getItemQuantity, removeItem } from "./inventory.mjs";

import { tx, now as clock } from "../combat/combat.mjs";

// ==========================================
// COMIDA QUE VENCE
// ==========================================

// Itens com "shelfLife" em config/items.mjs vencem esse tempo depois da compra. O inventário só
// sabe a quantidade; esta tabela (food_batches) diz de quando é cada unidade:
//
//   - cada compra grava um lote com a hora (recordPurchase);
//   - comida que chegou por outro caminho (já estava no inventário antes desta regra, ou veio de
//     um comando de administrador) ganha o prazo COMPLETO na primeira vez que alguém olha
//     (reconcileFood);
//   - o que foi gasto, vendido ou descartado sai do lote mais antigo primeiro: comer gasta a
//     unidade que vence antes;
//   - o que passou do prazo sai do inventário, e quem olhou fica sabendo (expired).
//
// O inventário é a verdade; os lotes são o relógio. Tudo em segundos, como o resto do jogo.

export const shelfLifeOf = item => {
    const life = item?.shelfLife;

    return Number.isFinite(life) && life > 0 ? life : null;
};

export const PERISHABLE = Object.freeze(ITEMS.filter(item => shelfLifeOf(item) !== null));

const inTransaction = fn => (db.isTransaction ? fn() : tx(fn));

// "12h", "24h", "1h 30min": o prazo como aparece na loja.
export function shelfLifeText(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return [hours ? `${hours}h` : "", minutes ? `${minutes}min` : ""].filter(Boolean).join(" ") || "menos de 1 min";
}

// A linha da loja: "⏳ Vence 12h depois da compra", ou null se o item não vence.
export const shelfLifeNote = item => {
    const life = shelfLifeOf(item);

    return life === null ? null : `⏳ Vence ${shelfLifeText(life)} depois da compra`;
};

// ==========================================
// COMPRA
// ==========================================

// Na mesma transação da compra, depois de addItem.
export function recordPurchase(guildId, userId, itemId, quantity, { now = clock() } = {}) {
    if (shelfLifeOf(getItem(itemId)) === null) {
        return;
    }

    db.prepare(`
        INSERT INTO food_batches (guild_id, user_id, item_id, bought_at, quantity)
        VALUES (?, ?, ?, ?, ?)
    `).run(guildId, userId, itemId, now, quantity);
}

// ==========================================
// EM DIA COM O INVENTÁRIO
// ==========================================

const batchesOf = (guildId, userId, itemId) => db.prepare(`
    SELECT rowid AS id, bought_at, quantity
    FROM food_batches
    WHERE guild_id = ?
      AND user_id = ?
      AND item_id = ?
    ORDER BY bought_at ASC, rowid ASC
`).all(guildId, userId, itemId);

// Acerta os lotes com o inventário e tira o que venceu. Devolve { expired: [{ item, quantity }] }.
// Roda sozinha numa transação, ou dentro da que já está aberta.
export function reconcileFood(guildId, userId, { now = clock() } = {}) {
    return inTransaction(() => {
        const expired = [];

        for (const item of PERISHABLE) {
            const life = shelfLifeOf(item);

            const owned = getItemQuantity(guildId, userId, item.id);

            const batches = batchesOf(guildId, userId, item.id);

            if (owned === 0 && batches.length === 0) {
                continue;
            }

            let tracked = batches.reduce((sum, batch) => sum + batch.quantity, 0);

            // chegou comida sem lote: prazo completo a partir de agora
            if (owned > tracked) {
                const added = owned - tracked;

                const result = db.prepare(`
                    INSERT INTO food_batches (guild_id, user_id, item_id, bought_at, quantity)
                    VALUES (?, ?, ?, ?, ?)
                `).run(guildId, userId, item.id, now, added);

                batches.push({ id: Number(result.lastInsertRowid), bought_at: now, quantity: added });

                tracked = owned;
            }

            // saiu comida sem baixa nos lotes: sai a mais antiga primeiro
            let extra = tracked - owned;

            for (const batch of batches) {
                if (extra <= 0) {
                    break;
                }

                const take = Math.min(extra, batch.quantity);

                batch.quantity -= take;
                extra -= take;

                if (batch.quantity === 0) {
                    db.prepare("DELETE FROM food_batches WHERE rowid = ?").run(batch.id);

                } else {
                    db.prepare("UPDATE food_batches SET quantity = ? WHERE rowid = ?").run(batch.quantity, batch.id);
                }
            }

            // o que passou do prazo
            let lost = 0;

            for (const batch of batches) {
                if (batch.quantity > 0 && batch.bought_at + life <= now) {
                    lost += batch.quantity;

                    db.prepare("DELETE FROM food_batches WHERE rowid = ?").run(batch.id);
                }
            }

            if (lost > 0) {
                removeItem(guildId, userId, item.id, lost);

                expired.push({ item, quantity: lost });
            }
        }

        return { expired };
    });
}

// ==========================================
// PRAZOS
// ==========================================

// Depois de reconcileFood: por item perecível que a pessoa tem, quanto falta para a unidade
// MAIS ANTIGA vencer. { [itemId]: { remaining, expiresAt, units } }, "units" = quantas vencem nesse horário.
export function foodDeadlines(guildId, userId, { now = clock() } = {}) {
    const deadlines = {};

    for (const item of PERISHABLE) {
        const [oldest] = batchesOf(guildId, userId, item.id);

        if (!oldest) {
            continue;
        }

        const expiresAt = oldest.bought_at + shelfLifeOf(item);

        deadlines[item.id] = {
            expiresAt,
            remaining: Math.max(0, expiresAt - now),
            units: oldest.quantity
        };
    }

    return deadlines;
}

// Em dia + prazos, de uma vez: o que as telas do inventário e do uso chamam.
export function foodStatus(guildId, userId, { now = clock() } = {}) {
    return inTransaction(() => {
        const { expired } = reconcileFood(guildId, userId, { now });

        return { expired, deadlines: foodDeadlines(guildId, userId, { now }) };
    });
}

// "🗑️ Comida vencida: 2× 🍎 Maçã"
export function expiredNotice(expired) {
    if (!expired?.length) {
        return "";
    }

    return `🗑️ **Comida vencida** saiu da mochila: ${expired
        .map(entry => `${entry.quantity}× ${entry.item.emoji} ${entry.item.name}`)
        .join(", ")}.`;
}

// "vence em 3h 20min" (para o inventário e para o painel de uso)
export function remainingText(seconds) {
    if (seconds <= 0) {
        return "vence agora";
    }

    if (seconds < 60) {
        return "vence em menos de 1 min";
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return "vence em " + ([hours ? `${hours}h` : "", minutes ? `${minutes}min` : ""].filter(Boolean).join(" "));
}
