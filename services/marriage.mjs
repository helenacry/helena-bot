
import { db } from "../database/connection.mjs";
import { getPlayer } from "../database/economy.mjs";

// Regras do casamento (a wiki lê este valor).
export const MARRIAGE_RULES = Object.freeze({
    // Quanto tempo um pedido vale, em segundos.
    requestTtl: 24 * 60 * 60
});

const REQUEST_EXPIRY = MARRIAGE_RULES.requestTtl;

function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

function transaction(callback) {
    db.exec("BEGIN IMMEDIATE");

    try {
        const result = callback();
        db.exec("COMMIT");
        return result;
    } catch (error) {
        if (db.isTransaction) {
            db.exec("ROLLBACK");
        }

        throw error;
    }
}

function validateIds(guildId, userId) {
    if (!guildId || !userId) {
        throw new Error(
            "Não foi possível identificar a conta ou servidor."
        );
    }
}

export function getMarriage(guildId, userId) {
    validateIds(guildId, userId);

    return db.prepare(`
        SELECT spouse_id, married_at
        FROM marriages
        WHERE guild_id = ?
          AND user_id = ?
    `).get(guildId, userId) ?? null;
}

export function requestMarriage(guildId, senderId, targetId) {
    validateIds(guildId, senderId);
    validateIds(guildId, targetId);

    if (senderId === targetId) {
        throw new Error(
            "Você não pode pedir a si mesmo em casamento."
        );
    }

    // Inicializa as contas antes de abrir a transação.
    getPlayer(guildId, senderId);
    getPlayer(guildId, targetId);

    return transaction(() => {
        const now = nowSeconds();

        // Remove pedidos expirados.
        db.prepare(`
            DELETE FROM marriage_requests
            WHERE guild_id = ?
              AND created_at <= ?
        `).run(guildId, now - REQUEST_EXPIRY);

        const senderMarriage = getMarriage(
            guildId,
            senderId
        );

        if (senderMarriage) {
            throw new Error(
                "Você já está casado(a)."
            );
        }

        const targetMarriage = getMarriage(
            guildId,
            targetId
        );

        if (targetMarriage) {
            throw new Error(
                "Essa pessoa já está casada."
            );
        }

        const existingRequest = db.prepare(`
            SELECT sender_id
            FROM marriage_requests
            WHERE guild_id = ?
              AND target_id = ?
        `).get(guildId, targetId);

        if (existingRequest) {
            throw new Error(
                "Essa pessoa já possui um pedido de casamento pendente."
            );
        }

        const sentRequest = db.prepare(`
            SELECT target_id
            FROM marriage_requests
            WHERE guild_id = ?
              AND sender_id = ?
        `).get(guildId, senderId);

        if (sentRequest) {
            throw new Error(
                "Você já enviou um pedido de casamento pendente."
            );
        }

        db.prepare(`
            INSERT INTO marriage_requests (
                guild_id,
                sender_id,
                target_id,
                created_at
            )
            VALUES (?, ?, ?, ?)
        `).run(
            guildId,
            senderId,
            targetId,
            now
        );

        return {
            senderId,
            targetId,
            expiresAt: now + REQUEST_EXPIRY
        };
    });
}

export function acceptMarriage(guildId, targetId) {
    validateIds(guildId, targetId);

    return transaction(() => {
        const request = db.prepare(`
            SELECT sender_id, created_at
            FROM marriage_requests
            WHERE guild_id = ?
              AND target_id = ?
        `).get(guildId, targetId);

        if (!request) {
            throw new Error(
                "Você não possui nenhum pedido de casamento pendente."
            );
        }

        const now = nowSeconds();

        if (
            now - request.created_at >= REQUEST_EXPIRY
        ) {
            db.prepare(`
                DELETE FROM marriage_requests
                WHERE guild_id = ?
                  AND target_id = ?
            `).run(guildId, targetId);

            return {
                expired: true
            };
        }

        const senderId = request.sender_id;

        if (
            getMarriage(guildId, senderId) ||
            getMarriage(guildId, targetId)
        ) {
            throw new Error(
                "O casamento não pode ser concluído porque uma das pessoas já está casada."
            );
        }

        const insert = db.prepare(`
            INSERT INTO marriages (
                guild_id,
                user_id,
                spouse_id,
                married_at
            )
            VALUES (?, ?, ?, ?)
        `);

        insert.run(
            guildId,
            senderId,
            targetId,
            now
        );

        insert.run(
            guildId,
            targetId,
            senderId,
            now
        );

        // Remove pedidos envolvendo qualquer um dos dois.
        db.prepare(`
            DELETE FROM marriage_requests
            WHERE guild_id = ?
              AND (
                  sender_id IN (?, ?)
                  OR target_id IN (?, ?)
              )
        `).run(
            guildId,
            senderId,
            targetId,
            senderId,
            targetId
        );

        return {
            expired: false,
            senderId,
            targetId,
            marriedAt: now
        };
    });
}

export function refuseMarriage(guildId, targetId) {
    validateIds(guildId, targetId);

    return transaction(() => {
        const request = db.prepare(`
            SELECT sender_id
            FROM marriage_requests
            WHERE guild_id = ?
              AND target_id = ?
        `).get(guildId, targetId);

        if (!request) {
            throw new Error(
                "Você não possui nenhum pedido de casamento pendente."
            );
        }

        db.prepare(`
            DELETE FROM marriage_requests
            WHERE guild_id = ?
              AND target_id = ?
        `).run(guildId, targetId);

        return {
            senderId: request.sender_id
        };
    });
}

export function divorce(guildId, userId) {
    validateIds(guildId, userId);

    return transaction(() => {
        const marriage = getMarriage(
            guildId,
            userId
        );

        if (!marriage) {
            throw new Error(
                "Você não está casado(a)."
            );
        }

        const spouseId = marriage.spouse_id;

        db.prepare(`
            DELETE FROM marriages
            WHERE guild_id = ?
              AND user_id IN (?, ?)
        `).run(
            guildId,
            userId,
            spouseId
        );

        return { spouseId };
    });
}