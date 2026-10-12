
import { db } from "../database/connection.mjs";
import { getPlayer } from "../database/economy.mjs";
import { getItem } from "../config/items.mjs";
import { addItem } from "./inventory.mjs";
import { calculateLevel } from "./experience.mjs";

// ==========================================
// DESENVOLVEDORES AUTORIZADOS
// ==========================================

// IDs configurados no .env.
// Aceita um ou vários IDs separados por vírgula.

const ownerIds = new Set(
    String(process.env.HELENA_OWNER_ID ?? "")
        .split(",")
        .map(id => id.trim())
        .filter(Boolean)
);

// ==========================================
// VERIFICAÇÃO DE PERMISSÕES
// ==========================================

export function isOwner(id) {
    return ownerIds.has(
        String(id ?? "").trim()
    );
}

export function ownerConfigured() {
    return ownerIds.size > 0;
}

// ==========================================
// UTILITÁRIOS DE INTERAÇÃO
// ==========================================

export function userId(i) {
    return String(i?.user?.id ?? "");
}

export function guildId(i) {
    return String(i?.guildId ?? "");
}

export function option(i, k) {
    const o = i?.data?.options;

    if (Array.isArray(o)) {
        return o.find(x => x.name === k)?.value;
    }

    return o?.[k]?.value ?? o?.[k];
}

// ==========================================
// LOGS DOS DESENVOLVEDORES
// ==========================================

export function logDev(
    actor,
    action,
    details = ""
) {
    db.prepare(`
        INSERT INTO developer_logs (
            actor_id,
            action,
            details
        )
        VALUES (?, ?, ?)
    `).run(
        String(actor),
        action,
        String(details).slice(0, 1500)
    );
}

export function getLogs(limit = 10) {
    return db.prepare(`
        SELECT *
        FROM developer_logs
        ORDER BY id DESC
        LIMIT ?
    `).all(
        Math.min(
            20,
            Math.max(1, limit)
        )
    );
}

// ==========================================
// CONFIGURAÇÕES DE DESENVOLVEDOR
// ==========================================

export function getSetting(
    key,
    def = ""
) {
    return db.prepare(`
        SELECT value
        FROM developer_settings
        WHERE key = ?
    `).get(key)?.value ?? def;
}

export function setSetting(key, value) {
    db.prepare(`
        INSERT INTO developer_settings (
            key,
            value
        )
        VALUES (?, ?)

        ON CONFLICT(key)
        DO UPDATE SET
            value = excluded.value
    `).run(
        key,
        String(value)
    );
}

// ==========================================
// MANUTENÇÃO
// ==========================================

export function maintenance() {
    return getSetting(
        "maintenance",
        "0"
    ) === "1";
}

// ==========================================
// BLACKLIST
// ==========================================

export function blocked(id) {
    return db.prepare(`
        SELECT *
        FROM developer_blacklist
        WHERE user_id = ?
    `).get(
        String(id)
    );
}

export function setBlocked(id, reason) {
    db.prepare(`
        INSERT INTO developer_blacklist (
            user_id,
            reason
        )
        VALUES (?, ?)

        ON CONFLICT(user_id)
        DO UPDATE SET
            reason = excluded.reason,
            created_at = unixepoch()
    `).run(
        String(id),
        reason
    );
}

export function unblock(id) {
    return db.prepare(`
        DELETE FROM developer_blacklist
        WHERE user_id = ?
    `).run(
        String(id)
    ).changes > 0;
}

// ==========================================
// ESTATÍSTICAS DO BOT
// ==========================================

export function stats() {
    const count = table => {
        return db.prepare(`
            SELECT COUNT(*) AS n
            FROM ${table}
        `).get().n;
    };

    const sums = db.prepare(`
        SELECT
            COALESCE(SUM(wallet), 0) AS wallet,
            COALESCE(SUM(bank), 0) AS bank
        FROM players
    `).get();

    return {
        players: count("players"),

        users: count("global_users"),

        guilds: db.prepare(`
            SELECT COUNT(DISTINCT guild_id) AS n
            FROM players
        `).get().n,

        transactions: count("transactions"),

        ...sums
    };
}

// ==========================================
// TRANSAÇÕES SQLITE
// ==========================================

function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");

    try {
        const value = fn();

        db.exec("COMMIT");

        return value;

    } catch (error) {
        if (db.isTransaction) {
            db.exec("ROLLBACK");
        }

        throw error;
    }
}

// ==========================================
// VALIDAÇÃO DE QUANTIDADES
// ==========================================

function integer(
    x,
    min = 0,
    max = 100000000000000
) {
    const n = Number(x);

    if (
        !Number.isSafeInteger(n) ||
        n < min ||
        n > max
    ) {
        throw new Error(
            "Quantidade inválida."
        );
    }

    return n;
}

// ==========================================
// CONCEDER RECURSOS
// ==========================================

export function grant({
    guild,
    target,
    type,
    amount,
    itemId,
    actor
}) {
    if (!guild || !target) {
        throw new Error(
            "Servidor e usuário são obrigatórios."
        );
    }

    if (
        ![
            "wallet",
            "bank",
            "gems",
            "xp",
            "item"
        ].includes(type)
    ) {
        throw new Error(
            "Tipo inválido."
        );
    }

    const n = integer(
        amount,
        1,
        type === "item"
            ? 99
            : 1000000000
    );

    const item = type === "item"
        ? getItem(itemId)
        : null;

    if (type === "item" && !item) {
        throw new Error(
            "Item inexistente."
        );
    }

    getPlayer(guild, target);

    return transaction(() => {
        if (type === "item") {
            addItem(
                guild,
                target,
                itemId,
                n
            );

        } else if (type === "gems") {
            db.prepare(`
                UPDATE global_users
                SET gems = gems + ?
                WHERE user_id = ?
            `).run(
                n,
                target
            );

        } else if (type === "xp") {
            const row = db.prepare(`
                SELECT xp
                FROM players
                WHERE guild_id = ?
                  AND user_id = ?
            `).get(
                guild,
                target
            );

            const xp = row.xp + n;

            db.prepare(`
                UPDATE players
                SET
                    xp = ?,
                    level = ?
                WHERE guild_id = ?
                  AND user_id = ?
            `).run(
                xp,
                calculateLevel(xp),
                guild,
                target
            );

        } else {
            db.prepare(`
                UPDATE players
                SET ${type} = ${type} + ?
                WHERE guild_id = ?
                  AND user_id = ?
            `).run(
                n,
                guild,
                target
            );
        }

        logDev(
            actor,
            "give",
            `${type} ${n} ${itemId ?? ""} -> ${target} @ ${guild}`
        );

        return n;
    });
}

// ==========================================
// RESETAR JOGADOR
// ==========================================

export function resetPlayer(
    guild,
    target,
    actor
) {
    if (!guild || !target) {
        throw new Error(
            "Servidor e usuário obrigatórios."
        );
    }

    return transaction(() => {
        const row = db.prepare(`
            SELECT user_id
            FROM players
            WHERE guild_id = ?
              AND user_id = ?
        `).get(
            guild,
            target
        );

        if (!row) {
            throw new Error(
                "Jogador não encontrado neste servidor."
            );
        }

        db.prepare(`
            UPDATE players
            SET
                wallet = 0,
                bank = 0,
                dirty_money = 0,
                xp = 0,
                level = 1,
                last_daily = 0,
                last_work = 0,
                energy = 100,
                energy_updated_at = 0
            WHERE guild_id = ?
              AND user_id = ?
        `).run(
            guild,
            target
        );

        db.prepare(`
            DELETE FROM inventory
            WHERE guild_id = ?
              AND user_id = ?
        `).run(
            guild,
            target
        );

        db.prepare(`
            DELETE FROM equipped_items
            WHERE guild_id = ?
              AND user_id = ?
        `).run(
            guild,
            target
        );

        // Sistema de crime: prisão, ficha criminal e lavagens.
        for (const table of [
            "prison_players",
            "crime_players",
            "laundering_jobs"
        ]) {
            db.prepare(`
                DELETE FROM ${table}
                WHERE guild_id = ?
                  AND user_id = ?
            `).run(
                guild,
                target
            );
        }

        logDev(
            actor,
            "reset",
            `${target} @ ${guild}`
        );

        return true;
    });
}