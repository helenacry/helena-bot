
import { db } from "./connection.mjs";

import {
    recordMissionEvent
} from "../services/economy/missions.mjs";

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const MAX_AMOUNT = 1_000_000_000_000;
const MAX_CENTS = MAX_AMOUNT * 100;

// ==========================================
// TRANSAÇÕES SQLITE
// ==========================================

function transaction(callback) {
    if (db.isTransaction) {
        throw new Error(
            "Já existe uma transação em andamento."
        );
    }

    db.exec("BEGIN IMMEDIATE");

    try {
        const result = callback();

        if (result instanceof Promise) {
            throw new Error(
                "Transações econômicas devem ser síncronas."
            );
        }

        db.exec("COMMIT");

        return result;

    } catch (error) {
        if (db.isTransaction) {
            db.exec("ROLLBACK");
        }

        throw error;
    }
}

// ==========================================
// JOGADORES
// ==========================================

export function getPlayer(guildId, userId) {
    if (!guildId || !userId) {
        throw new Error(
            "Servidor ou usuário inválido."
        );
    }

    db.prepare(`
        INSERT OR IGNORE INTO players (
            guild_id,
            user_id,
            job_id
        )
        VALUES (?, ?, '')
    `).run(
        guildId,
        userId
    );

    db.prepare(`
        INSERT OR IGNORE INTO global_users (
            user_id
        )
        VALUES (?)
    `).run(userId);

    const player = db.prepare(`
        SELECT *
        FROM players
        WHERE guild_id = ?
          AND user_id = ?
    `).get(
        guildId,
        userId
    );

    const global = db.prepare(`
        SELECT gems
        FROM global_users
        WHERE user_id = ?
    `).get(userId);

    return {
        ...player,
        gems: global.gems
    };
}

// ==========================================
// VALIDAÇÃO DE VALORES
// ==========================================

// Palavras que significam "todo o saldo disponível".
export const ALL_AMOUNT_WORDS = Object.freeze(["tudo", "all"]);

export function parseAmount(value, available) {
    if (
        !Number.isSafeInteger(available) ||
        available < 0
    ) {
        throw new Error(
            "Saldo disponível inválido."
        );
    }

    if (
        typeof value === "string" &&
        ALL_AMOUNT_WORDS.includes(value.trim().toLowerCase())
    ) {
        if (available <= 0) {
            throw new Error(
                "Você não possui saldo disponível."
            );
        }

        return available;
    }

    if (
        typeof value !== "string" &&
        typeof value !== "number"
    ) {
        throw new Error(
            "Informe uma quantia válida."
        );
    }

    if (
        typeof value === "string" &&
        !/^[0-9]+$/.test(value.trim())
    ) {
        throw new Error(
            "Informe uma quantia inteira e positiva."
        );
    }

    const amount = Number(value);

    if (
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        amount > MAX_AMOUNT
    ) {
        throw new Error(
            "Informe uma quantia válida."
        );
    }

    const cents = amount * 100;

    if (
        !Number.isSafeInteger(cents) ||
        cents > MAX_CENTS
    ) {
        throw new Error(
            "Quantia muito elevada."
        );
    }

    if (cents > available) {
        throw new Error(
            "Saldo insuficiente."
        );
    }

    return cents;
}

// ==========================================
// HISTÓRICO DE TRANSAÇÕES
// ==========================================

function record(
    guildId,
    userId,
    targetId,
    type,
    amount
) {
    db.prepare(`
        INSERT INTO transactions (
            guild_id,
            user_id,
            target_id,
            type,
            amount
        )
        VALUES (?, ?, ?, ?, ?)
    `).run(
        guildId,
        userId,
        targetId,
        type,
        amount
    );
}

// ==========================================
// DEPOSITAR
// ==========================================

export function deposit(guildId, userId, value) {
    return transaction(() => {
        const player = getPlayer(
            guildId,
            userId
        );

        const amount = parseAmount(
            value,
            player.wallet
        );

        const result = db.prepare(`
            UPDATE players
            SET
                wallet = wallet - ?,
                bank = bank + ?
            WHERE guild_id = ?
              AND user_id = ?
              AND wallet >= ?
              AND bank <= ?
        `).run(
            amount,
            amount,
            guildId,
            userId,
            amount,
            MAX_CENTS - amount
        );

        if (result.changes !== 1) {
            throw new Error(
                "Não foi possível realizar o depósito."
            );
        }

        // ==============================
        // REGISTRAR HISTÓRICO
        // ==============================

        record(
            guildId,
            userId,
            null,
            "deposit",
            amount
        );

        // ==============================
        // ATUALIZAR MISSÃO DE DEPÓSITO
        // ==============================

        recordMissionEvent(
            guildId,
            userId,
            "deposit"
        );

        return amount;
    });
}

// ==========================================
// SACAR
// ==========================================

export function withdraw(guildId, userId, value) {
    return transaction(() => {
        const player = getPlayer(
            guildId,
            userId
        );

        const amount = parseAmount(
            value,
            player.bank
        );

        const result = db.prepare(`
            UPDATE players
            SET
                bank = bank - ?,
                wallet = wallet + ?
            WHERE guild_id = ?
              AND user_id = ?
              AND bank >= ?
              AND wallet <= ?
        `).run(
            amount,
            amount,
            guildId,
            userId,
            amount,
            MAX_CENTS - amount
        );

        if (result.changes !== 1) {
            throw new Error(
                "Não foi possível realizar o saque."
            );
        }

        record(
            guildId,
            userId,
            null,
            "withdraw",
            amount
        );

        return amount;
    });
}

// ==========================================
// TRANSFERIR
// ==========================================

export function transfer(
    guildId,
    senderId,
    targetId,
    value
) {
    if (!guildId || !senderId || !targetId) {
        throw new Error(
            "Dados da transferência inválidos."
        );
    }

    if (senderId === targetId) {
        throw new Error(
            "Você não pode transferir dinheiro para si mesmo."
        );
    }

    return transaction(() => {
        const sender = getPlayer(
            guildId,
            senderId
        );

        const target = getPlayer(
            guildId,
            targetId
        );

        const amount = parseAmount(
            value,
            sender.wallet
        );

        if (target.wallet > MAX_CENTS - amount) {
            throw new Error(
                "O destinatário atingiu o limite da carteira."
            );
        }

        // ==============================
        // DEBITAR REMETENTE
        // ==============================

        const debit = db.prepare(`
            UPDATE players
            SET wallet = wallet - ?
            WHERE guild_id = ?
              AND user_id = ?
              AND wallet >= ?
        `).run(
            amount,
            guildId,
            senderId,
            amount
        );

        if (debit.changes !== 1) {
            throw new Error(
                "Saldo insuficiente."
            );
        }

        // ==============================
        // CREDITAR DESTINATÁRIO
        // ==============================

        const credit = db.prepare(`
            UPDATE players
            SET wallet = wallet + ?
            WHERE guild_id = ?
              AND user_id = ?
              AND wallet <= ?
        `).run(
            amount,
            guildId,
            targetId,
            MAX_CENTS - amount
        );

        if (credit.changes !== 1) {
            throw new Error(
                "Não foi possível creditar o destinatário."
            );
        }

        // ==============================
        // REGISTRAR HISTÓRICO
        // ==============================

        record(
            guildId,
            senderId,
            targetId,
            "transfer",
            amount
        );

        return amount;
    });
}

// ==========================================
// FORMATAÇÃO
// ==========================================

export function formatMoney(cents) {
    if (
        typeof cents !== "number" ||
        !Number.isSafeInteger(cents)
    ) {
        throw new Error(
            "Valor monetário inválido."
        );
    }

    return (cents / 100).toLocaleString(
        "pt-BR",
        {
            style: "currency",
            currency: "BRL"
        }
    );
}