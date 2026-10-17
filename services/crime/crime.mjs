
import { db } from "../../database/connection.mjs";

import { getPlayer } from "../../database/economy.mjs";

import { consumeEnergy } from "../economy/energy.mjs";

import { calculateLevel } from "../progress/experience.mjs";

import {
    status as combatStatus,
    tx,
    now as clock
} from "../combat/combat.mjs";

import { getPrison, imprison } from "./prison.mjs";

import {
    ensureCrimePlayer,
    defaultRng,
    rollBetween,
    pick
} from "./crime-player.mjs";

import {
    CRIME_CONFIG,
    CRIME_SUCCESS_STORIES,
    CRIME_JACKPOT_STORY,
    CRIME_FAILURE_STORIES,
    CRIME_FINE,
    rewardScale
} from "../../config/crime.mjs";

import { GameBlocked } from "../../utils/game-error.mjs";

import { formatDuration } from "../../utils/time.mjs";

// Arredonda um valor em centavos para reais inteiros.
const wholeReais = cents => Math.round(cents / 100) * 100;

// ==========================================
// COMETER UM CRIME
// ==========================================

// Tudo acontece numa única transação: a energia, a
// recarga e o resultado são gravados juntos. A recarga
// e a energia são gastas com sucesso ou falha.
export function attemptCrime(
    guildId,
    userId,
    {
        now = clock(),
        rng = defaultRng
    } = {}
) {
    // Garante que o jogador exista.
    getPlayer(guildId, userId);

    return tx(() => {
        // ==================================
        // PRISÃO
        // ==================================

        const prison = getPrison(guildId, userId, now);

        if (prison) {
            throw new GameBlocked(
                "Você está preso",
                "Você ainda cumpre pena por **" +
                formatDuration(prison.remaining) +
                "**."
            );
        }

        // ==================================
        // VIDA
        // ==================================

        const combat = combatStatus(guildId, userId);

        if (combat.hp < CRIME_CONFIG.minHp) {
            throw new GameBlocked(
                "Ferido demais",
                "Você precisa de pelo menos **" +
                CRIME_CONFIG.minHp +
                " HP** para cometer um crime.\n" +
                "❤️ **Vida atual:** " + combat.hp + "\n\n" +
                "Use `/curar` no hospital."
            );
        }

        // ==================================
        // RECARGA
        // ==================================

        const state = ensureCrimePlayer(guildId, userId);

        const remaining =
            state.last_crime + CRIME_CONFIG.cooldown - now;

        if (remaining > 0) {
            throw new GameBlocked(
                "Recarga em andamento",
                "A polícia ainda está de olho em você.\n\n" +
                "⏰ **Próximo crime em:** " +
                formatDuration(remaining)
            );
        }

        const player = db.prepare(`
            SELECT wallet, xp, level, dirty_money
            FROM players
            WHERE guild_id = ?
              AND user_id = ?
        `).get(guildId, userId);

        if (!player) {
            throw new Error("Jogador não encontrado.");
        }

        // ==================================
        // ENERGIA
        // ==================================

        const energy = consumeEnergy(
            guildId,
            userId,
            CRIME_CONFIG.energyCost,
            now
        );

        if (!energy.success) {
            throw new GameBlocked(
                "Energia insuficiente",
                "Você não tem energia para um crime agora.\n\n" +
                "⚡ **Custo:** " + CRIME_CONFIG.energyCost +
                " pontos\n" +
                "🔋 **Energia atual:** " + energy.energy +
                "/" + energy.max + "\n" +
                "❌ **Faltam:** " + energy.missing + " pontos\n\n" +
                "Use `/energia` para acompanhar a regeneração."
            );
        }

        // ==================================
        // RESULTADO
        // ==================================

        const context = {
            guildId,
            userId,
            now,
            rng,
            player,
            combat,
            energy
        };

        return rng() < CRIME_CONFIG.successChance
            ? resolveSuccess(context)
            : resolveFailure(context);
    });
}

// ==========================================
// SUCESSO
// ==========================================

function resolveSuccess({
    guildId,
    userId,
    now,
    rng,
    player,
    energy
}) {
    const jackpot = rng() < CRIME_CONFIG.jackpotChance;

    const story = jackpot
        ? CRIME_JACKPOT_STORY
        : pick(rng, CRIME_SUCCESS_STORIES);

    const xp = rollBetween(
        rng,
        CRIME_CONFIG.xp.min,
        CRIME_CONFIG.xp.max
    );

    const newXp = player.xp + xp;

    const newLevel = calculateLevel(newXp);

    // O XP do sucesso conta antes do multiplicador.
    const amount = wholeReais(
        rollBetween(rng, story.min, story.max) *
        rewardScale(newLevel)
    );

    if (
        !Number.isSafeInteger(newXp) ||
        player.dirty_money > CRIME_CONFIG.maxDirtyMoney - amount
    ) {
        throw new GameBlocked(
            "Limite atingido",
            "Seu dinheiro sujo atingiu o limite permitido. " +
            "Lave parte dele com `/lavagem` antes de continuar."
        );
    }

    const update = db.prepare(`
        UPDATE players
        SET dirty_money = dirty_money + ?,
            xp = ?,
            level = ?
        WHERE guild_id = ?
          AND user_id = ?
    `).run(amount, newXp, newLevel, guildId, userId);

    if (update.changes !== 1) {
        throw new Error("Não foi possível registrar o crime.");
    }

    db.prepare(`
        UPDATE crime_players
        SET last_crime = ?,
            crimes = crimes + 1,
            successes = successes + 1,
            criminal_record = criminal_record + 1,
            dirty_earned = dirty_earned + ?
        WHERE guild_id = ?
          AND user_id = ?
    `).run(now, amount, guildId, userId);

    db.prepare(`
        INSERT INTO transactions (
            guild_id,
            user_id,
            target_id,
            type,
            amount
        )
        VALUES (?, ?, NULL, 'crime', ?)
    `).run(guildId, userId, amount);

    return {
        success: true,
        jackpot,
        story: story.text,
        amount,
        xp,
        level: newLevel,
        leveledUp: newLevel > player.level,
        dirtyTotal: player.dirty_money + amount,
        energy: energy.energy,
        energyMax: energy.max
    };
}

// ==========================================
// FALHA
// ==========================================

function resolveFailure({
    guildId,
    userId,
    now,
    rng,
    player,
    combat,
    energy
}) {
    const story = pick(rng, CRIME_FAILURE_STORIES);

    // Multa: sai da carteira e nunca passa do saldo.
    const wanted = wholeReais(
        rollBetween(rng, CRIME_FINE.min, CRIME_FINE.max) *
        rewardScale(player.level)
    );

    const fine = Math.min(player.wallet, wanted);

    if (fine > 0) {
        const paid = db.prepare(`
            UPDATE players
            SET wallet = wallet - ?
            WHERE guild_id = ?
              AND user_id = ?
              AND wallet >= ?
        `).run(fine, guildId, userId, fine);

        if (paid.changes !== 1) {
            throw new Error("Não foi possível cobrar a multa.");
        }

        db.prepare(`
            INSERT INTO transactions (
                guild_id,
                user_id,
                target_id,
                type,
                amount
            )
            VALUES (?, ?, NULL, 'crime_fine', ?)
        `).run(guildId, userId, fine);
    }

    // Ferimento, quando a história termina em ferido.
    let hpLost = 0;

    if (story.injury) {
        hpLost = Math.min(
            combat.hp,
            rollBetween(
                rng,
                CRIME_CONFIG.injuryHp.min,
                CRIME_CONFIG.injuryHp.max
            )
        );

        db.prepare(`
            UPDATE combat_players
            SET hp = hp - ?
            WHERE guild_id = ?
              AND user_id = ?
        `).run(hpLost, guildId, userId);
    }

    imprison(
        guildId,
        userId,
        CRIME_CONFIG.jailSeconds,
        "Crime frustrado",
        now
    );

    db.prepare(`
        UPDATE crime_players
        SET last_crime = ?,
            crimes = crimes + 1,
            failures = failures + 1,
            criminal_record = criminal_record + 1
        WHERE guild_id = ?
          AND user_id = ?
    `).run(now, guildId, userId);

    return {
        success: false,
        story: story.text,
        fine,
        fineWanted: wanted,
        hpLost,
        hp: combat.hp - hpLost,
        jailSeconds: CRIME_CONFIG.jailSeconds,
        energy: energy.energy,
        energyMax: energy.max
    };
}
