
import { db } from "../database/connection.mjs";

import {
    getPlayer
} from "../database/economy.mjs";

import {
    getEquippedWeapon
} from "./equipment.mjs";

import {
    calculateLevel
} from "./experience.mjs";

import {
    checkAchievements
} from "./achievements.mjs";

// ==========================================
// CONFIGURAÇÕES
// ==========================================

// Regras do duelo. A wiki (site/wiki-values.mjs) lê estes valores, então
// o texto dela acompanha o que o bot faz de verdade.
export const DUEL_RULES = Object.freeze({
    // Espera entre dois duelos, em segundos.
    cooldown: 300,

    // Quanto tempo um desafio vale, em segundos.
    requestTtl: 600,

    // Vida mínima dos dois lados.
    minHp: 20,

    // XP de quem vence.
    winXp: 30,

    // Dano sem arma, e de arma que não define o próprio dano.
    unarmedDamage: 5,
    defaultWeaponDamage: 10,

    // Quanto do colete entra na conta (limite de pontos).
    vestCap: 15
});

const DUEL_COOLDOWN = DUEL_RULES.cooldown;
const CHALLENGE_EXPIRATION = DUEL_RULES.requestTtl;
const MINIMUM_HP = DUEL_RULES.minHp;
const WINNER_XP = DUEL_RULES.winXp;

export const now = () =>
    Math.floor(Date.now() / 1000);

// ==========================================
// TRANSAÇÕES
// ==========================================

export function tx(fn) {
    db.exec("BEGIN IMMEDIATE");

    try {
        const result = fn();

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
// INICIALIZAR JOGADOR NO COMBATE
// ==========================================

export function ensure(guildId, userId) {
    db.prepare(`
        INSERT OR IGNORE INTO combat_players (
            guild_id,
            user_id
        )
        VALUES (?, ?)
    `).run(guildId, userId);

    db.prepare(`
        INSERT OR IGNORE INTO combat_gear (
            guild_id,
            user_id
        )
        VALUES (?, ?)
    `).run(guildId, userId);
}

// ==========================================
// CONSULTAR STATUS
// ==========================================

export function status(guildId, userId) {
    ensure(guildId, userId);

    const player = db.prepare(`
        SELECT *
        FROM combat_players
        WHERE guild_id = ?
          AND user_id = ?
    `).get(guildId, userId);

    const gear = db.prepare(`
        SELECT ammo, vest, durability
        FROM combat_gear
        WHERE guild_id = ?
          AND user_id = ?
    `).get(guildId, userId);

    return {
        ...player,
        ...gear
    };
}

// ==========================================
// CRIAR DESAFIO
// ==========================================

export function challenge(guildId, senderId, targetId) {
    if (
        !guildId ||
        !senderId ||
        !targetId ||
        senderId === targetId
    ) {
        throw new Error(
            "Escolha outro jogador deste servidor."
        );
    }

    return tx(() => {
        const sender = status(guildId, senderId);
        const target = status(guildId, targetId);

        const timestamp = now();

        if (
            sender.hp < MINIMUM_HP ||
            target.hp < MINIMUM_HP
        ) {
            throw new Error(
                "Os dois jogadores precisam ter pelo menos 20 HP."
            );
        }

        if (
            sender.protected_until > timestamp ||
            target.protected_until > timestamp
        ) {
            throw new Error(
                "Um dos jogadores está protegido pelo hospital."
            );
        }

        if (
            sender.last_duel + DUEL_COOLDOWN >
            timestamp
        ) {
            throw new Error(
                "Aguarde o cooldown de 5 minutos."
            );
        }

        // Remover desafios expirados.
        db.prepare(`
            DELETE FROM combat_challenges
            WHERE guild_id = ?
              AND created_at < ?
        `).run(
            guildId,
            timestamp - CHALLENGE_EXPIRATION
        );

        const pending = db.prepare(`
            SELECT 1
            FROM combat_challenges
            WHERE guild_id = ?
              AND (
                  sender_id IN (?, ?)
                  OR target_id IN (?, ?)
              )
        `).get(
            guildId,
            senderId,
            targetId,
            senderId,
            targetId
        );

        if (pending) {
            throw new Error(
                "Um dos jogadores já possui desafio pendente."
            );
        }

        db.prepare(`
            INSERT INTO combat_challenges (
                guild_id,
                target_id,
                sender_id,
                created_at
            )
            VALUES (?, ?, ?, ?)
        `).run(
            guildId,
            targetId,
            senderId,
            timestamp
        );

        return true;
    });
}

// ==========================================
// RECUSAR DESAFIO
// ==========================================

export function refuse(guildId, targetId) {
    return tx(() => {
        const result = db.prepare(`
            DELETE FROM combat_challenges
            WHERE guild_id = ?
              AND target_id = ?
        `).run(
            guildId,
            targetId
        );

        return result.changes > 0;
    });
}

// ==========================================
// ACEITAR DESAFIO E RESOLVER DUELO
// ==========================================

export function accept(guildId, targetId) {
    return tx(() => {
        // ==============================
        // CONSULTAR DESAFIO
        // ==============================

        const challengeData = db.prepare(`
            SELECT *
            FROM combat_challenges
            WHERE guild_id = ?
              AND target_id = ?
        `).get(
            guildId,
            targetId
        );

        if (!challengeData) {
            throw new Error(
                "Você não tem desafio pendente."
            );
        }

        db.prepare(`
            DELETE FROM combat_challenges
            WHERE guild_id = ?
              AND target_id = ?
        `).run(
            guildId,
            targetId
        );

        const timestamp = now();

        if (
            challengeData.created_at <
            timestamp - CHALLENGE_EXPIRATION
        ) {
            throw new Error(
                "O desafio expirou."
            );
        }

        // ==============================
        // JOGADORES
        // ==============================

        const senderId = challengeData.sender_id;

        const sender = status(
            guildId,
            senderId
        );

        const target = status(
            guildId,
            targetId
        );

        if (
            sender.hp < MINIMUM_HP ||
            target.hp < MINIMUM_HP
        ) {
            throw new Error(
                "Os dois jogadores precisam ter pelo menos 20 HP."
            );
        }

        if (
            sender.protected_until > timestamp ||
            target.protected_until > timestamp
        ) {
            throw new Error(
                "Um jogador está protegido."
            );
        }

        if (
            sender.last_duel + DUEL_COOLDOWN >
                timestamp ||
            target.last_duel + DUEL_COOLDOWN >
                timestamp
        ) {
            throw new Error(
                "Um jogador está em cooldown."
            );
        }

        // ==============================
        // ARMAS EQUIPADAS
        // ==============================

        const senderWeapon = getEquippedWeapon(
            guildId,
            senderId
        );

        const targetWeapon = getEquippedWeapon(
            guildId,
            targetId
        );

        // ==============================
        // CALCULAR ATAQUE
        // ==============================

        const attack = (weapon, gear) => {
            let damage = weapon
                ? Number(weapon.damage || DUEL_RULES.defaultWeaponDamage)
                : DUEL_RULES.unarmedDamage;

            if (weapon?.weaponType === "firearm") {
                if (gear.ammo <= 0) {
                    throw new Error(
                        "Uma arma de fogo está sem munição."
                    );
                }

                db.prepare(`
                    UPDATE combat_gear
                    SET ammo = ammo - 1
                    WHERE guild_id = ?
                      AND user_id = ?
                `).run(
                    guildId,
                    gear.user_id
                );
            }

            if (
                weapon &&
                gear.durability <= 0
            ) {
                throw new Error(
                    "Uma arma está sem durabilidade."
                );
            }

            if (weapon) {
                db.prepare(`
                    UPDATE combat_gear
                    SET durability = MAX(
                        0,
                        durability - 1
                    )
                    WHERE guild_id = ?
                      AND user_id = ?
                `).run(
                    guildId,
                    gear.user_id
                );
            }

            return Math.max(
                1,
                damage - Math.min(DUEL_RULES.vestCap, gear.vest)
            );
        };

        const senderDamage = attack(
            senderWeapon,
            sender
        );

        const targetDamage = attack(
            targetWeapon,
            target
        );

        // ==============================
        // APLICAR DANO
        // ==============================

        const senderHp = Math.max(
            0,
            sender.hp - targetDamage
        );

        const targetHp = Math.max(
            0,
            target.hp - senderDamage
        );

        db.prepare(`
            UPDATE combat_players
            SET hp = ?,
                last_duel = ?
            WHERE guild_id = ?
              AND user_id = ?
        `).run(
            senderHp,
            timestamp,
            guildId,
            senderId
        );

        db.prepare(`
            UPDATE combat_players
            SET hp = ?,
                last_duel = ?
            WHERE guild_id = ?
              AND user_id = ?
        `).run(
            targetHp,
            timestamp,
            guildId,
            targetId
        );

        // ==============================
        // RESULTADO
        // ==============================

        let winner = null;
        let loser = null;

        if (senderHp !== targetHp) {
            winner = senderHp > targetHp
                ? senderId
                : targetId;

            loser = senderHp > targetHp
                ? targetId
                : senderId;

            // Registrar vitória.
            db.prepare(`
                UPDATE combat_players
                SET wins = wins + 1
                WHERE guild_id = ?
                  AND user_id = ?
            `).run(
                guildId,
                winner
            );

            // Registrar derrota.
            db.prepare(`
                UPDATE combat_players
                SET losses = losses + 1
                WHERE guild_id = ?
                  AND user_id = ?
            `).run(
                guildId,
                loser
            );

            // ==========================
            // EXPERIÊNCIA DO VENCEDOR
            // ==========================

            getPlayer(guildId, winner);

            db.prepare(`
                UPDATE players
                SET xp = xp + ?
                WHERE guild_id = ?
                  AND user_id = ?
            `).run(
                WINNER_XP,
                guildId,
                winner
            );

            const player = db.prepare(`
                SELECT xp
                FROM players
                WHERE guild_id = ?
                  AND user_id = ?
            `).get(
                guildId,
                winner
            );

            db.prepare(`
                UPDATE players
                SET level = ?
                WHERE guild_id = ?
                  AND user_id = ?
            `).run(
                calculateLevel(player.xp),
                guildId,
                winner
            );

            // ==========================
            // HISTÓRICO DO DUELO
            // ==========================

            db.prepare(`
                INSERT INTO combat_history (
                    guild_id,
                    winner_id,
                    loser_id,
                    damage,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?)
            `).run(
                guildId,
                winner,
                loser,

                winner === senderId
                    ? senderDamage
                    : targetDamage,

                timestamp
            );

            // ==========================
            // CONQUISTAS AUTOMÁTICAS
            // ==========================

            // Verifica vitórias, nível e demais
            // requisitos após registrar o duelo.
            checkAchievements(
                guildId,
                winner
            );
        }

        // ==============================
        // RETORNO ORIGINAL
        // ==============================

        return {
            sender: senderId,
            target: targetId,

            senderHp,
            targetHp,

            senderDamage,
            targetDamage,

            winner,
            loser
        };
    });
}

// ==========================================
// HISTÓRICO DE COMBATE
// ==========================================

export function history(guildId, userId) {
    return db.prepare(`
        SELECT *
        FROM combat_history
        WHERE guild_id = ?
          AND (
              winner_id = ?
              OR loser_id = ?
          )
        ORDER BY id DESC
        LIMIT 5
    `).all(
        guildId,
        userId,
        userId
    );
}