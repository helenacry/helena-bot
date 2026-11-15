import { db } from "../../database/connection.mjs";

import { getPlayer } from "../../database/economy.mjs";

import { BOXES } from "../../config/boxes.mjs";

import { tx } from "../combat/combat.mjs";

// ==========================================
// REEMBOLSO DAS CAIXAS MISTERIOSAS
// ==========================================

// Até 12/11/2026 a Caixa misteriosa era vendida na loja (10.000 centavos, R$ 100) e abria num sorteio. Pagar por
// sorteio é o que os termos do site descartam ("sem caixas de recompensa pagas"), então a caixa saiu da loja
// (config/boxes.mjs) e quem já tinha uma ficou com um item que não abre nem vende.
//
// Esta correção devolve o dinheiro, UMA vez: cada caixa que estava no inventário vira o preço antigo na carteira
// de quem a tinha (no mesmo servidor em que estava), e a caixa sai do inventário. O extrato interno (transactions)
// ganha uma linha "box_refund" por pessoa.
//
// Roda uma única vez (data_fixes). Isso importa: no dia em que a caixa voltar de graça (drops, pesca), o que for
// ganho assim NÃO pode ser "reembolsado" na subida seguinte.

export const BOX_REFUND_FIX = "mystery-box-refund";

// O que a caixa custava na loja.
export const BOX_REFUND_CENTS = BOXES.mystery_box.referenceValue;

// o teto da carteira, o mesmo da loja
const MAX_CENTS = 100_000_000_000_000;

const ITEM = "mystery_box";

/**
 * Devolve o dinheiro das caixas misteriosas que já estavam nos inventários.
 * Devolve null se a correção já rodou; senão { people, boxes, cents, kept }, onde "kept" é quantas caixas
 * ficaram por a carteira não comportar o dinheiro (só acontece no teto da carteira, e elas continuam com a pessoa).
 */
export function refundLegacyBoxes() {
    return tx(() => {
        const done = db.prepare("SELECT 1 FROM data_fixes WHERE name = ?").get(BOX_REFUND_FIX);

        if (done) {
            return null;
        }

        const holders = db.prepare(`
            SELECT guild_id, user_id, quantity
            FROM inventory
            WHERE item_id = ?
              AND quantity > 0
            ORDER BY guild_id, user_id
        `).all(ITEM);

        let people = 0;
        let boxes = 0;
        let cents = 0;
        let kept = 0;

        for (const holder of holders) {
            const player = getPlayer(holder.guild_id, holder.user_id);

            // só devolve as caixas cujo dinheiro cabe na carteira: nada se perde
            const fits = Math.floor(Math.max(0, MAX_CENTS - player.wallet) / BOX_REFUND_CENTS);
            const refunded = Math.min(holder.quantity, fits);

            kept += holder.quantity - refunded;

            if (refunded <= 0) {
                continue;
            }

            const credit = refunded * BOX_REFUND_CENTS;

            db.prepare(`
                UPDATE players
                SET wallet = wallet + ?
                WHERE guild_id = ?
                  AND user_id = ?
            `).run(credit, holder.guild_id, holder.user_id);

            if (refunded === holder.quantity) {
                db.prepare(`
                    DELETE FROM inventory
                    WHERE guild_id = ?
                      AND user_id = ?
                      AND item_id = ?
                `).run(holder.guild_id, holder.user_id, ITEM);

            } else {
                db.prepare(`
                    UPDATE inventory
                    SET quantity = quantity - ?, updated_at = unixepoch()
                    WHERE guild_id = ?
                      AND user_id = ?
                      AND item_id = ?
                `).run(refunded, holder.guild_id, holder.user_id, ITEM);
            }

            db.prepare(`
                INSERT INTO transactions (guild_id, user_id, target_id, type, amount)
                VALUES (?, ?, NULL, 'box_refund', ?)
            `).run(holder.guild_id, holder.user_id, credit);

            people += 1;
            boxes += refunded;
            cents += credit;
        }

        db.prepare("INSERT INTO data_fixes (name) VALUES (?)").run(BOX_REFUND_FIX);

        return { people, boxes, cents, kept };
    });
}
