import { db } from "./connection.mjs";

// ==========================================
// CORREÇÕES DE DADOS FEITAS UMA VEZ
// ==========================================

// Algumas mudanças de regra pedem mexer nos dados que já existem (devolver o dinheiro de um item que saiu da loja,
// por exemplo). Cada correção tem um nome e roda uma única vez: este registro diz quais já rodaram, e uma correção
// que já rodou nunca encosta nos dados de novo, mesmo que a regra mude depois.

export function runDataFixesMigrations() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS data_fixes (
            name TEXT PRIMARY KEY,

            applied_at INTEGER NOT NULL
                DEFAULT (unixepoch())
        );
    `);

    console.log(
        "[DATABASE] Correções de dados verificadas."
    );
}
