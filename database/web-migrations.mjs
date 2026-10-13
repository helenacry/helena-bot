import { db } from "./connection.mjs";

// ==========================================
// PAINEL DO SITE: SESSÕES E COLETAS
// ==========================================

// Só ganha vida quando a API do site está ligada (services/web-api.mjs),
// mas as tabelas existem sempre, como as dos outros sistemas.
export function runWebMigrations() {
    // A recarga do bônus de gemas é global (da conta, não do servidor).
    addColumn(
        "global_users",
        "last_gem_claim",
        "INTEGER NOT NULL DEFAULT 0"
    );

    db.exec(`
        -- Uma sessão por login no site. Guardamos só o hash do token:
        -- quem lê o banco não consegue usar a sessão de ninguém.
        CREATE TABLE IF NOT EXISTS web_sessions (
            token_hash TEXT PRIMARY KEY,

            user_id TEXT NOT NULL,
            username TEXT NOT NULL DEFAULT '',
            display_name TEXT NOT NULL DEFAULT '',
            avatar_url TEXT,

            -- Servidores da pessoa que a Helena também conhece, vistos
            -- no login (JSON: [{ id, name, icon }]).
            guilds_json TEXT NOT NULL DEFAULT '[]',

            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,

            ip TEXT NOT NULL DEFAULT '',
            user_agent TEXT NOT NULL DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_web_sessions_expires
        ON web_sessions (expires_at);

        CREATE INDEX IF NOT EXISTS idx_web_sessions_user
        ON web_sessions (user_id);

        -- Entradas, coletas e recusas, com IP e navegador, para segurança
        -- e para resolver reclamações.
        CREATE TABLE IF NOT EXISTS web_claim_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            guild_id TEXT,

            ok INTEGER NOT NULL CHECK (ok IN (0, 1)),
            detail TEXT NOT NULL DEFAULT '',

            ip TEXT NOT NULL DEFAULT '',
            user_agent TEXT NOT NULL DEFAULT '',

            created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_web_claim_log_user
        ON web_claim_log (user_id, created_at);
    `);

    console.log("[DATABASE] Painel do site verificado.");
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
