
import { db } from "../../database/connection.mjs";
import { getPlayer } from "../../database/economy.mjs";

// ==========================================
// CONFIGURAÇÕES
// ==========================================

export const ENERGY_CONFIG = Object.freeze({
    max: 100,
    regenSeconds: 5 * 60,
    workCost: 10
});

// ==========================================
// REGENERAÇÃO
// ==========================================

// Esta função é síncrona e pode ser chamada
// dentro de uma transação SQLite já aberta.
export function syncEnergy(guildId, userId, now = Math.floor(Date.now() / 1000)) {
    if (!guildId || !userId) {
        throw new Error("Jogador inválido.");
    }

    const player = db.prepare(`
        SELECT energy, energy_updated_at
        FROM players
        WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId);

    if (!player) {
        throw new Error("Jogador não encontrado.");
    }

    const max = ENERGY_CONFIG.max;
    const interval = ENERGY_CONFIG.regenSeconds;

    // Inicializa o relógio para jogadores antigos.
    if (player.energy_updated_at === 0) {
        const energy = Math.max(
            0,
            Math.min(max, player.energy)
        );

        db.prepare(`
            UPDATE players
            SET energy = ?,
                energy_updated_at = ?
            WHERE guild_id = ? AND user_id = ?
        `).run(energy, now, guildId, userId);

        return {
            energy,
            max,
            nextRegen: energy < max ? interval : 0
        };
    }

    const elapsed = Math.max(
        0,
        now - player.energy_updated_at
    );

    const gained = Math.floor(elapsed / interval);

    const energy = Math.min(
        max,
        Math.max(0, player.energy) + gained
    );

    // Mantém o restante do tempo já acumulado.
    // Quando a energia chega ao máximo, reinicia
    // o relógio para não acumular regeneração infinita.
    const updatedAt = energy >= max
        ? now
        : player.energy_updated_at + gained * interval;

    if (
        energy !== player.energy ||
        updatedAt !== player.energy_updated_at
    ) {
        db.prepare(`
            UPDATE players
            SET energy = ?,
                energy_updated_at = ?
            WHERE guild_id = ? AND user_id = ?
        `).run(
            energy,
            updatedAt,
            guildId,
            userId
        );
    }

    const nextRegen = energy >= max
        ? 0
        : interval - Math.max(0, now - updatedAt);

    return {
        energy,
        max,
        nextRegen
    };
}

// ==========================================
// CONSULTAR ENERGIA
// ==========================================

export function getEnergy(guildId, userId) {
    getPlayer(guildId, userId);

    if (db.isTransaction) {
        throw new Error(
            "Não é possível abrir uma consulta de energia durante outra transação."
        );
    }

    db.exec("BEGIN IMMEDIATE");

    try {
        const result = syncEnergy(guildId, userId);

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
// CONSUMIR ENERGIA
// ==========================================

// Deve ser chamada DENTRO da mesma transação
// que registra a recompensa da atividade.
export function consumeEnergy(
    guildId,
    userId,
    amount,
    now = Math.floor(Date.now() / 1000)
) {
    if (
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        amount > ENERGY_CONFIG.max
    ) {
        throw new Error("Custo de energia inválido.");
    }

    if (!db.isTransaction) {
        throw new Error(
            "O consumo de energia exige uma transação SQLite."
        );
    }

    const status = syncEnergy(guildId, userId, now);

    if (status.energy < amount) {
        return {
            success: false,
            ...status,
            missing: amount - status.energy
        };
    }

    const result = db.prepare(`
        UPDATE players
        SET energy = energy - ?
        WHERE guild_id = ?
          AND user_id = ?
          AND energy >= ?
    `).run(amount, guildId, userId, amount);

    if (result.changes !== 1) {
        throw new Error(
            "Não foi possível consumir a energia."
        );
    }

    // Se o jogador estava com energia máxima,
    // inicia o relógio de regeneração agora.
    if (status.energy === ENERGY_CONFIG.max) {
        db.prepare(`
            UPDATE players
            SET energy_updated_at = ?
            WHERE guild_id = ? AND user_id = ?
        `).run(now, guildId, userId);
    }

    return {
        success: true,
        energy: status.energy - amount,
        max: status.max,
        nextRegen: status.energy === ENERGY_CONFIG.max
            ? ENERGY_CONFIG.regenSeconds
            : status.nextRegen
    };
}

// ==========================================
// REPOR ENERGIA
// ==========================================

// Soma energia (comida, café...) até o máximo; o que passa disso se
// perde. Com a energia já cheia, não faz nada e devolve success:false,
// para quem chama não gastar o item à toa.
//
// Deve ser chamada DENTRO de uma transação, junto do gasto do item.
export function restoreEnergy(
    guildId,
    userId,
    amount,
    now = Math.floor(Date.now() / 1000)
) {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new Error("Quantidade de energia inválida.");
    }

    if (!db.isTransaction) {
        throw new Error(
            "Repor energia exige uma transação SQLite."
        );
    }

    const status = syncEnergy(guildId, userId, now);

    if (status.energy >= status.max) {
        return { success: false, ...status, gained: 0, wasted: 0 };
    }

    const energy = Math.min(status.max, status.energy + amount);

    // Ao chegar no máximo, o relógio de regeneração reinicia (como
    // no syncEnergy); abaixo disso ele segue de onde estava.
    db.prepare(`
        UPDATE players
        SET energy = ?,
            energy_updated_at = CASE WHEN ? >= ? THEN ? ELSE energy_updated_at END
        WHERE guild_id = ?
          AND user_id = ?
    `).run(energy, energy, status.max, now, guildId, userId);

    return {
        success: true,
        energy,
        max: status.max,
        gained: energy - status.energy,
        wasted: amount - (energy - status.energy)
    };
}