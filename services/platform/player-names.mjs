
import { db } from "../../database/connection.mjs";

// ==========================================
// CACHE DE NOMES DOS JOGADORES
// ==========================================

export function runPlayerNamesMigrations() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS player_names (
            user_id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            updated_at INTEGER NOT NULL
                DEFAULT (unixepoch())
        );
    `);
}

// ==========================================
// SALVAR NOME
// ==========================================

export function savePlayerName(user) {
    if (!user?.id) {
        return;
    }

    const userId = String(user.id);

    const displayName = String(
        user.displayName ||
        user.username ||
        ""
    ).trim();

    if (!displayName) {
        return;
    }

    db.prepare(`
        INSERT INTO player_names (
            user_id,
            display_name,
            updated_at
        )
        VALUES (?, ?, unixepoch())

        ON CONFLICT(user_id)
        DO UPDATE SET
            display_name = excluded.display_name,
            updated_at = unixepoch()
    `).run(
        userId,
        displayName.slice(0, 80)
    );
}

// ==========================================
// OBTER NOME
// ==========================================

export function getPlayerName(userId) {
    const row = db.prepare(`
        SELECT display_name
        FROM player_names
        WHERE user_id = ?
    `).get(String(userId));

    return row?.display_name || null;
}