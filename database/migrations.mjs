
import { db } from "./connection.mjs";

// ==========================================
// MIGRAÇÕES DO BANCO DE DADOS
// ==========================================

export function runMigrations() {
    // ======================================
    // VERIFICAR COLUNAS DOS JOGADORES
    // ======================================

    const columns = db.prepare(`
        PRAGMA table_info(players)
    `).all();

    const names = new Set(
        columns.map(column => column.name)
    );

    

    const playerColumns = db.prepare(
        "PRAGMA table_info(players)"
    ).all();

    const hasBio = playerColumns.some(
        column => column.name === "bio"
    );

    if (!hasBio) {
        db.exec(`
        ALTER TABLE players
        ADD COLUMN bio TEXT NOT NULL DEFAULT ''
    `);
    }


    // ======================================
    // MIGRAÇÕES DA TABELA PLAYERS
    // ======================================

    const migrations = [
        {
            name: "last_work",
            sql: `
                ALTER TABLE players
                ADD COLUMN last_work INTEGER NOT NULL DEFAULT 0
            `
        },
        {
            name: "job_id",
            sql: `
                ALTER TABLE players
                ADD COLUMN job_id TEXT NOT NULL DEFAULT 'entregador'
            `
        },
        {
            name: "energy",
            sql: `
                ALTER TABLE players
                ADD COLUMN energy INTEGER NOT NULL DEFAULT 100
            `
        },
        {
            name: "energy_updated_at",
            sql: `
                ALTER TABLE players
                ADD COLUMN energy_updated_at INTEGER NOT NULL DEFAULT 0
            `
        },
        {
            // a última pescaria (/pescar), como last_work é o último turno
            name: "last_fish",
            sql: `
                ALTER TABLE players
                ADD COLUMN last_fish INTEGER NOT NULL DEFAULT 0
            `
        }
    ];

    // Executa somente as migrações necessárias.
    for (const migration of migrations) {
        if (!names.has(migration.name)) {
            db.exec(migration.sql);

            console.log(
                `[MIGRATION] ${migration.name} adicionada.`
            );
        }
    }

    // ======================================
    // SISTEMA DE MISSÕES
    // ======================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS mission_progress (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            mission_id TEXT NOT NULL,
            period TEXT NOT NULL,

            progress INTEGER NOT NULL DEFAULT 0
                CHECK(progress >= 0),

            claimed INTEGER NOT NULL DEFAULT 0
                CHECK(claimed IN (0, 1)),

            PRIMARY KEY (
                guild_id,
                user_id,
                mission_id,
                period
            )
        );
    `);

    // ======================================
    // ÍNDICE PARA CONSULTAS DE MISSÕES
    // ======================================

    db.exec(`
        CREATE INDEX IF NOT EXISTS
        idx_mission_progress_user_period
        ON mission_progress (
            guild_id,
            user_id,
            period
        );
    `);


    // ======================================
    // SISTEMA DE INVENTÁRIO
    // ======================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS inventory (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            item_id TEXT NOT NULL,

            quantity INTEGER NOT NULL DEFAULT 0
                CHECK(quantity >= 0),

            created_at INTEGER NOT NULL
                DEFAULT (unixepoch()),

            updated_at INTEGER NOT NULL
                DEFAULT (unixepoch()),

            PRIMARY KEY (
                guild_id,
                user_id,
                item_id
            )
        );
    `);

    db.exec(`
        CREATE INDEX IF NOT EXISTS
        idx_inventory_player
        ON inventory (
            guild_id,
            user_id
        );
    `);


db.exec(`
    CREATE TABLE IF NOT EXISTS marriage_requests (
        guild_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (guild_id, target_id),
        CHECK (sender_id <> target_id)
    );

    CREATE INDEX IF NOT EXISTS idx_marriage_requests_sender
    ON marriage_requests (guild_id, sender_id);

    CREATE TABLE IF NOT EXISTS marriages (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        spouse_id TEXT NOT NULL,
        married_at INTEGER NOT NULL DEFAULT (unixepoch()),
        PRIMARY KEY (guild_id, user_id),
        CHECK (user_id <> spouse_id)
    );
`);


db.exec(`
    CREATE TABLE IF NOT EXISTS equipped_items (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        slot TEXT NOT NULL,
        item_id TEXT NOT NULL,
        equipped_at INTEGER NOT NULL DEFAULT (unixepoch()),

        PRIMARY KEY (guild_id, user_id)
    );
`);

    console.log(
        "[DATABASE] Sistema de inventário verificado."
    );

    console.log(
        "[DATABASE] Sistema de missões verificado."
    );

    console.log(
        "[DATABASE] Migrações verificadas."
    );

}