
import { db } from "./connection.mjs";

// ==========================================
// COMIDA QUE VENCE
// ==========================================

// Cada compra de comida perecível vira um lote com a hora em que foi feita. O inventário
// continua guardando só a quantidade (inventory); os lotes dizem de quando é cada unidade, e
// services/economy/food.mjs mantém os dois em dia.

export function runFoodMigrations() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS food_batches (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            item_id TEXT NOT NULL,

            bought_at INTEGER NOT NULL,

            quantity INTEGER NOT NULL
                CHECK (quantity > 0)
        );

        CREATE INDEX IF NOT EXISTS idx_food_batches_owner
        ON food_batches(guild_id, user_id, item_id, bought_at);
    `);

    console.log(
        "[DATABASE] Lotes de comida verificados."
    );
}
