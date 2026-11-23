import { db } from "./connection.mjs";

// ==========================================
// CONTADORES DO JOGO
// ==========================================

// Um contador por pessoa, servidor e nome (quantas pescarias, quantos turnos, qual peixe já pescou...). Servem às
// conquistas e ao tutorial (services/progress/stats.mjs). Só números: nada que identifique mais do que a conta.

export function runStatsMigrations() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS player_stats (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            key TEXT NOT NULL,

            value INTEGER NOT NULL DEFAULT 0
                CHECK (value >= 0),

            PRIMARY KEY (guild_id, user_id, key)
        );
    `);

    console.log(
        "[DATABASE] Contadores do jogo verificados."
    );
}
