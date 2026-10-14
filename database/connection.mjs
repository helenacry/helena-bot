
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Caminho do banco. Cada ambiente (produção e testes)
// define o seu em HELENA_DATABASE_PATH; sem a variável,
// usa o banco padrão da produção.
export const DATABASE_PATH =
    process.env.HELENA_DATABASE_PATH || "data/helena.db";

mkdirSync(dirname(DATABASE_PATH), { recursive: true });

export const db = new DatabaseSync(DATABASE_PATH);

db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS players (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,

        wallet INTEGER NOT NULL DEFAULT 0
            CHECK(wallet >= 0),

        bank INTEGER NOT NULL DEFAULT 0
            CHECK(bank >= 0),

        dirty_money INTEGER NOT NULL DEFAULT 0
            CHECK(dirty_money >= 0),

        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,

        last_daily INTEGER NOT NULL DEFAULT 0,

        created_at INTEGER NOT NULL
            DEFAULT (unixepoch()),

        PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS global_users (
        user_id TEXT PRIMARY KEY,

        gems INTEGER NOT NULL DEFAULT 0
            CHECK(gems >= 0)
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        target_id TEXT,

        type TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK(amount > 0),

        created_at INTEGER NOT NULL
            DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS processed_interactions (
        interaction_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
            DEFAULT (unixepoch())
    );
`);

console.log("[DATABASE] Helena SQLite iniciado.");