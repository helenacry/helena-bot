
import { db } from "./connection.mjs";

// ==========================================
// MIGRAÇÃO DA BOLSA
// ==========================================

// Uma linha por servidor: o índice atual, o anterior (para a tendência), o
// item em alta e o instante do sorteio. Não guarda nada de pessoas.
export function runMarketMigrations() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS market_state (
            guild_id TEXT PRIMARY KEY,

            idx INTEGER NOT NULL
                CHECK (idx BETWEEN 0 AND 90),

            previous_idx INTEGER
                CHECK (previous_idx IS NULL OR previous_idx BETWEEN 0 AND 90),

            hot_item TEXT,

            hot_bonus INTEGER NOT NULL DEFAULT 0
                CHECK (hot_bonus >= 0),

            drawn_at INTEGER NOT NULL
        );
    `);

    console.log("[DATABASE] Bolsa verificada.");
}
