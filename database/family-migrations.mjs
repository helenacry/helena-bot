
import { db } from "./connection.mjs";

// ==========================================
// MIGRAÇÃO DA FAMÍLIA
// ==========================================

// O casal é sempre guardado com os dois IDs em ordem (parent_a < parent_b), então a mesma
// dupla tem uma chave só, não importa quem ligou.
//
//   family_children  os filhos já registrados (nome e quando nasceu)
//   family_births    bebês esperando nome (expiram em poucos minutos)
//   family_calls     quando cada pessoa ligou pela última vez (a espera do Gozofone)
//
// Tudo some quando o casal se divorcia (exceto a espera, que é da pessoa).
export function runFamilyMigrations() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS family_children (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            guild_id TEXT NOT NULL,
            parent_a TEXT NOT NULL,
            parent_b TEXT NOT NULL,

            name TEXT NOT NULL,

            born_at INTEGER NOT NULL,

            CHECK (parent_a < parent_b)
        );

        CREATE INDEX IF NOT EXISTS idx_family_children_couple
            ON family_children (guild_id, parent_a, parent_b);

        CREATE TABLE IF NOT EXISTS family_births (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            guild_id TEXT NOT NULL,
            parent_a TEXT NOT NULL,
            parent_b TEXT NOT NULL,

            babies INTEGER NOT NULL
                CHECK (babies BETWEEN 1 AND 2),

            expires_at INTEGER NOT NULL,

            CHECK (parent_a < parent_b)
        );

        CREATE INDEX IF NOT EXISTS idx_family_births_couple
            ON family_births (guild_id, parent_a, parent_b);

        CREATE TABLE IF NOT EXISTS family_calls (
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,

            last_call INTEGER NOT NULL,

            PRIMARY KEY (guild_id, user_id)
        );
    `);

    console.log("[DATABASE] Família verificada.");
}
