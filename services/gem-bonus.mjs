
import { db } from "../database/connection.mjs";

import { GEM_BONUS } from "../config/gems.mjs";

// ==========================================
// BÔNUS DE GEMAS
// ==========================================

// Coleta de gemas pelo painel do site. As gemas são da conta (valem em
// todos os servidores), então a recarga também é da conta.

const nowSeconds = () => Math.floor(Date.now() / 1000);

// Sorteio inclusivo entre min e max. "random" existe para os testes.
function roll(random = Math.random) {
    const { min, max } = GEM_BONUS;

    return min + Math.floor(random() * (max - min + 1));
}

// Situação (só leitura): não cria o registro de quem nunca coletou.
//
// { gems, available, remaining }
export function getGemBonusStatus(userId, now = nowSeconds()) {
    const row = db.prepare(`
        SELECT gems, last_gem_claim
        FROM global_users
        WHERE user_id = ?
    `).get(userId);

    const remaining = Math.max(
        0,
        GEM_BONUS.cooldown - (now - (row?.last_gem_claim ?? 0))
    );

    return {
        gems: row?.gems ?? 0,
        available: remaining === 0,
        remaining
    };
}

// Resultado:
//   { status: "claimed", amount, gems, remaining }
//   { status: "cooldown", gems, remaining }
export function claimGemBonus(
    userId,
    { now = nowSeconds(), random = Math.random } = {}
) {
    db.prepare(`
        INSERT OR IGNORE INTO global_users (user_id)
        VALUES (?)
    `).run(userId);

    db.exec("BEGIN IMMEDIATE");

    try {
        const row = db.prepare(`
            SELECT gems, last_gem_claim
            FROM global_users
            WHERE user_id = ?
        `).get(userId);

        const remaining = Math.max(
            0,
            GEM_BONUS.cooldown - (now - row.last_gem_claim)
        );

        if (remaining > 0) {
            db.exec("ROLLBACK");

            return {
                status: "cooldown",
                gems: row.gems,
                remaining
            };
        }

        const amount = roll(random);

        // A condição repete a checagem da recarga: se algo mudou entre
        // a leitura e a escrita, nada é pago.
        const result = db.prepare(`
            UPDATE global_users
            SET
                gems = gems + ?,
                last_gem_claim = ?
            WHERE user_id = ?
              AND last_gem_claim <= ?
        `).run(
            amount,
            now,
            userId,
            now - GEM_BONUS.cooldown
        );

        if (result.changes !== 1) {
            throw new Error("Não foi possível coletar as gemas.");
        }

        db.exec("COMMIT");

        return {
            status: "claimed",
            amount,
            gems: row.gems + amount,
            remaining: GEM_BONUS.cooldown
        };

    } catch (error) {
        if (db.isTransaction) {
            db.exec("ROLLBACK");
        }

        throw error;
    }
}
