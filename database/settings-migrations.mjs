
import { db } from "./connection.mjs";

// ==========================================
// AJUSTES DE CADA PESSOA
// ==========================================

// O que cada pessoa escolheu em /config. Vale para a conta (todos os servidores), não por servidor.
// Hoje só o idioma; a tabela fica pronta para outros ajustes.

export function runSettingsMigrations() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id TEXT PRIMARY KEY,

            lang TEXT NOT NULL DEFAULT 'pt-BR'
                CHECK (lang IN ('pt-BR', 'en-US')),

            updated_at INTEGER NOT NULL
                DEFAULT (unixepoch())
        );
    `);

    console.log(
        "[DATABASE] Ajustes de cada pessoa verificados."
    );
}
