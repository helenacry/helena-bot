
import { db } from "../database/connection.mjs";

import {
    PRISON_BLOCKED_COMMANDS
} from "../config/crime.mjs";

import {
    createEmbed,
    embedResponse,
    HELENA_COLORS
} from "../utils/embed.mjs";

import { formatDuration } from "../utils/time.mjs";

const clock = () => Math.floor(Date.now() / 1000);

// ==========================================
// CONSULTAR PRISÃO
// ==========================================

// Devolve a pena em curso ou null. Uma pena já
// cumprida é removida aqui mesmo.
export function getPrison(
    guildId,
    userId,
    now = clock()
) {
    const row = db.prepare(`
        SELECT release_at, sentence, reason
        FROM prison_players
        WHERE guild_id = ?
          AND user_id = ?
    `).get(guildId, userId);

    if (!row) {
        return null;
    }

    if (row.release_at <= now) {
        db.prepare(`
            DELETE FROM prison_players
            WHERE guild_id = ?
              AND user_id = ?
              AND release_at <= ?
        `).run(guildId, userId, now);

        return null;
    }

    return {
        releaseAt: row.release_at,
        remaining: row.release_at - now,
        sentence: row.sentence,
        reason: row.reason
    };
}

// ==========================================
// PRENDER
// ==========================================

// Uma nova pena se soma ao fim da que está em curso.
// As lavagens em andamento ficam em pausa: o término
// de cada uma é adiado pelo tempo da pena.
export function imprison(
    guildId,
    userId,
    seconds,
    reason,
    now = clock()
) {
    if (!Number.isSafeInteger(seconds) || seconds <= 0) {
        throw new Error("Duração de pena inválida.");
    }

    const current = getPrison(guildId, userId, now);

    if (current) {
        db.prepare(`
            UPDATE prison_players
            SET release_at = release_at + ?,
                sentence = sentence + ?,
                reason = ?
            WHERE guild_id = ?
              AND user_id = ?
        `).run(seconds, seconds, reason, guildId, userId);

    } else {
        db.prepare(`
            INSERT OR REPLACE INTO prison_players (
                guild_id,
                user_id,
                release_at,
                sentence,
                reason,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            guildId,
            userId,
            now + seconds,
            seconds,
            reason,
            now
        );
    }

    db.prepare(`
        UPDATE laundering_jobs
        SET finish_at = finish_at + ?
        WHERE guild_id = ?
          AND user_id = ?
          AND settled_at IS NULL
    `).run(seconds, guildId, userId);

    return getPrison(guildId, userId, now);
}

// ==========================================
// EMBEDS DO BLOQUEIO
// ==========================================

// Uma atualização ao vivo por jogador: o /prisao e o aviso
// de comando bloqueado compartilham a mesma chave, então a
// mensagem mais recente é a que fica sendo atualizada.
export const prisonLiveKey = (guildId, userId) =>
    `prison:${guildId}:${userId}`;

export function blockEmbed(prison, { stale = false } = {}) {
    return createEmbed({
        title: "⛓️ Você está preso",

        description:
            "Este comando fica bloqueado enquanto " +
            "você cumpre pena. Consultas continuam " +
            "liberadas.",

        color: HELENA_COLORS.warning,

        fields: [
            {
                name: "⏳ Tempo restante",
                value:
                    "**" +
                    formatDuration(prison.remaining) +
                    "**",
                inline: true
            },
            {
                name: "📜 Motivo",
                value: prison.reason || "Não informado",
                inline: true
            }
        ],

        footer: stale
            ? "Helena • Atualização automática encerrada. Use /prisao."
            : "Helena • Atualizado automaticamente. Use /prisao."
    });
}

export function releasedBlockEmbed() {
    return createEmbed({
        title: "🔓 Você está livre",

        description:
            "Sua pena acabou. Você já pode usar os comandos " +
            "normalmente.",

        color: HELENA_COLORS.success,

        footer: "Helena • Pena cumprida."
    });
}

// ==========================================
// BLOQUEIO DE COMANDOS
// ==========================================

// Devolve a resposta de aviso quando o jogador está
// preso e o comando é bloqueado na cadeia; senão null.
// Se a consulta falhar, o comando segue liberado.
export function prisonBlock(commandName, guildId, userId) {
    if (!PRISON_BLOCKED_COMMANDS.has(commandName)) {
        return null;
    }

    if (!guildId || !userId) {
        return null;
    }

    try {
        const prison = getPrison(guildId, userId);

        if (!prison) {
            return null;
        }

        const response = embedResponse(blockEmbed(prison));

        // O tempo restante é atualizado na própria mensagem
        // até o fim da pena (ver services/live-embed.mjs).
        response.live = {
            key: prisonLiveKey(guildId, userId),

            render: ({ stale }) => {
                const current = getPrison(guildId, userId);

                if (!current) {
                    return {
                        payload: { embeds: [releasedBlockEmbed()] },
                        done: true
                    };
                }

                return {
                    payload: {
                        embeds: [blockEmbed(current, { stale })]
                    },
                    done: false
                };
            }
        };

        return response;

    } catch (error) {
        console.error("[PRISÃO]", error);

        return null;
    }
}
