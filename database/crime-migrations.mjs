
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

    // Colunas acrescentadas depois da primeira versão. Bancos já
    // existentes ganham as colunas sem perder dados.

    // Ficha criminal: cada crime, roubo e lavagem iniciada soma 1.
    // Quem tem pelo menos 1 aparece em /procurados.
    addColumn("crime_players", "criminal_record", "INTEGER NOT NULL DEFAULT 0");

    // Última tentativa de roubo (recarga própria).
    addColumn("crime_players", "last_rob", "INTEGER NOT NULL DEFAULT 0");

    // Fuga da prisão: quanto a pena já foi cortada (negativo) ou
    // aumentada (positivo) por fugas, em segundos, e quando a última
    // tentativa começou.
    addColumn("prison_players", "escape_delta", "INTEGER NOT NULL DEFAULT 0");
    addColumn("prison_players", "last_escape_at", "INTEGER NOT NULL DEFAULT 0");

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_crime_record
        ON crime_players(guild_id, criminal_record);
    `);

    console.log(
        "[DATABASE] Sistema de crime verificado."
    );
}

function addColumn(table, column, definition) {
    const exists = db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .some(info => info.name === column);

    if (!exists) {
        db.exec(
            `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
        );
    }
}
