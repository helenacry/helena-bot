import { db } from "./connection.mjs";

// ==========================================
// AJUSTES DE CADA SERVIDOR
// ==========================================

// O que quem administra o servidor escolhe com o /servidor: se os drops estão ligados e em que canal. Só o ID do
// servidor e do canal (nada de pessoa), e começa tudo desligado (services/platform/guild-settings.mjs).

export function runGuildSettingsMigrations() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS guild_settings (
            guild_id TEXT PRIMARY KEY,

            drops_enabled INTEGER NOT NULL DEFAULT 0
                CHECK (drops_enabled IN (0, 1)),

            drops_channel_id TEXT NOT NULL DEFAULT '',

            updated_at INTEGER NOT NULL
                DEFAULT (unixepoch())
        );
    `);

    console.log(
        "[DATABASE] Ajustes dos servidores verificados."
    );
}
