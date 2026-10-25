import { db } from "./connection.mjs";

// ==========================================
// HISTÓRICO DO /USERINFO: NOMES, ÍCONES E BANNERS ANTIGOS
// ==========================================

// Só guarda o que o Discord já mostra para todo mundo (nome, @usuário e o código da foto e do banner),
// de quem usa a Helena, a partir de quando passou a usar. Veja services/social/userinfo-history.mjs.
export function runUserinfoHistoryMigrations() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS userinfo_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            user_id TEXT NOT NULL,

            -- username (o @usuário), display (o nome de exibição), avatar ou banner
            kind TEXT NOT NULL CHECK (kind IN ('username', 'display', 'avatar', 'banner')),

            -- o texto do nome ou o código (hash) da imagem, nunca a imagem
            value TEXT NOT NULL,

            seen_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_userinfo_history_user
        ON userinfo_history (user_id, kind, id);

        -- As datas que a própria pessoa informa (desde quando assina o Nitro e desde quando impulsiona
        -- servidores), porque o Discord não entrega isso a bots. Só aparecem no cartão dela, marcadas como
        -- "informado". Os "exact" dizem se a pessoa deu a hora (senão, só o dia).
        CREATE TABLE IF NOT EXISTS userinfo_declared (
            user_id TEXT PRIMARY KEY,
            nitro_since INTEGER,
            nitro_exact INTEGER NOT NULL DEFAULT 0,
            boost_since INTEGER,
            boost_exact INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
        );

        -- Quem pediu para ocultar: a Helena para de guardar e não mostra o que já tinha.
        CREATE TABLE IF NOT EXISTS userinfo_privacy (
            user_id TEXT PRIMARY KEY,
            hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
            updated_at INTEGER NOT NULL
        );
    `);

    console.log("[DATABASE] Histórico do /userinfo verificado.");
}
