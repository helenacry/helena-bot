import { db } from "../../database/connection.mjs";

// ==========================================
// AJUSTES DE CADA SERVIDOR
// ==========================================

// Lê e grava o que o /servidor escolhe (database/guild-settings-migrations.mjs). Servidor sem linha tem tudo
// desligado. O ID do canal vazio quer dizer "qualquer canal".

const ID = /^\d{5,25}$/;

const DEFAULTS = Object.freeze({ dropsEnabled: false, dropsChannelId: "" });

/** { guildId, dropsEnabled, dropsChannelId } (o padrão para quem nunca mexeu). */
export function getGuildSettings(guildId) {
    const row = db.prepare(`
        SELECT drops_enabled, drops_channel_id
        FROM guild_settings
        WHERE guild_id = ?
    `).get(String(guildId));

    return {
        guildId: String(guildId),
        dropsEnabled: row ? row.drops_enabled === 1 : DEFAULTS.dropsEnabled,
        dropsChannelId: row?.drops_channel_id ?? DEFAULTS.dropsChannelId
    };
}

/** Muda um ou mais ajustes ({ dropsEnabled, dropsChannelId }) e devolve os ajustes novos. */
export function updateGuildSettings(guildId, changes) {
    if (!ID.test(String(guildId))) {
        throw new Error("Servidor inválido.");
    }

    const current = getGuildSettings(guildId);

    const next = {
        dropsEnabled: changes.dropsEnabled === undefined ? current.dropsEnabled : Boolean(changes.dropsEnabled),
        dropsChannelId: changes.dropsChannelId === undefined ? current.dropsChannelId : String(changes.dropsChannelId)
    };

    if (next.dropsChannelId !== "" && !ID.test(next.dropsChannelId)) {
        throw new Error("Canal inválido.");
    }

    db.prepare(`
        INSERT INTO guild_settings (guild_id, drops_enabled, drops_channel_id, updated_at)
        VALUES (?, ?, ?, unixepoch())
        ON CONFLICT (guild_id)
        DO UPDATE SET
            drops_enabled = excluded.drops_enabled,
            drops_channel_id = excluded.drops_channel_id,
            updated_at = unixepoch()
    `).run(String(guildId), next.dropsEnabled ? 1 : 0, next.dropsChannelId);

    return { guildId: String(guildId), ...next };
}

/** Os servidores com os drops ligados (para o sorteio que roda a cada minuto). */
export function guildsWithDrops() {
    return db.prepare(`
        SELECT guild_id, drops_channel_id
        FROM guild_settings
        WHERE drops_enabled = 1
    `).all().map(row => ({ guildId: row.guild_id, channelId: row.drops_channel_id }));
}

// As permissões do Discord que deixam mexer nos ajustes: Administrador (0x8) ou Gerenciar servidor (0x20).
const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;

/** A pessoa pode mexer nos ajustes do servidor? "permissions" é o texto que o Discord manda (um número grande). */
export function canManageGuild(permissions) {
    try {
        const bits = BigInt(String(permissions ?? ""));

        return (bits & ADMINISTRATOR) !== 0n || (bits & MANAGE_GUILD) !== 0n;

    } catch {
        return false;
    }
}
