
import { db } from "./connection.mjs";

// ==========================================
// MIGRAÇÃO DO SISTEMA DE CRIME
// ==========================================

export function runCrimeMigrations() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS crime_players (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,

            last_crime INTEGER NOT NULL DEFAULT 0,

            crimes INTEGER NOT NULL DEFAULT 0
                CHECK (crimes >= 0),

            successes INTEGER NOT NULL DEFAULT 0
                CHECK (successes >= 0),

            failures INTEGER NOT NULL DEFAULT 0
                CHECK (failures >= 0),

            dirty_earned INTEGER NOT NULL DEFAULT 0
                CHECK (dirty_earned >= 0),

            private_unlocked INTEGER NOT NULL DEFAULT 0
                CHECK (private_unlocked IN (0, 1)),

            launder_ready_at INTEGER NOT NULL DEFAULT 0,

            PRIMARY KEY (guild_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS prison_players (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,

            release_at INTEGER NOT NULL,

            -- Duração total da estadia atual.
            sentence INTEGER NOT NULL
                CHECK (sentence > 0),

            reason TEXT NOT NULL DEFAULT '',

            created_at INTEGER NOT NULL
                DEFAULT (unixepoch()),

            PRIMARY KEY (guild_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS laundering_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            channel_id TEXT,

            kind TEXT NOT NULL
                CHECK (kind IN ('public', 'private')),

            -- Dinheiro sujo consumido e valor limpo que
            -- será creditado ao final.
            amount INTEGER NOT NULL
                CHECK (amount > 0),

            payout INTEGER NOT NULL
                CHECK (payout >= 0),

            started_at INTEGER NOT NULL,
            finish_at INTEGER NOT NULL,
            settled_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_laundering_pending
        ON laundering_jobs(settled_at, finish_at);

        -- Uma lavagem ativa por jogador.
        CREATE UNIQUE INDEX IF NOT EXISTS idx_laundering_one_active
        ON laundering_jobs(guild_id, user_id)
        WHERE settled_at IS NULL;

        -- Uma lavagem pública ativa por servidor.
        CREATE UNIQUE INDEX IF NOT EXISTS idx_laundering_public_active
        ON laundering_jobs(guild_id)
        WHERE settled_at IS NULL AND kind = 'public';
    `);

    console.log(
        "[DATABASE] Sistema de crime verificado."
    );
}
