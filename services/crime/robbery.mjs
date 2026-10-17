
import { db } from "../../database/connection.mjs";

import { getPlayer } from "../../database/economy.mjs";

import { consumeEnergy } from "../economy/energy.mjs";

import { getEquippedWeapon } from "../combat/equipment.mjs";

import {
    status as combatStatus,
    tx,
    now as clock
} from "../combat/combat.mjs";

import { getPrison } from "./prison.mjs";

import {
    ensureCrimePlayer,
    defaultRng,
    rollBetween
} from "./crime-player.mjs";

import {
    CRIME_CONFIG,
    ROBBERY_CONFIG,
    ROBBERY_WEAPON_CHANCE,
    ROBBERY_DEFAULT_CHANCE
} from "../../config/crime.mjs";

import { GameBlocked } from "../../utils/game-error.mjs";

import { formatDuration } from "../../utils/time.mjs";

// Chance base (em %) de a arma equipada render um roubo.
export function robberyChance(weapon) {
    return ROBBERY_WEAPON_CHANCE[weapon.id] ?? ROBBERY_DEFAULT_CHANCE;
}

// Quanto, no máximo, um roubo pode levar de uma carteira.
export function robberyCap(wallet) {
    const {
        capBase,
        capThreshold,
        capExcessRate,
        capMax
    } = ROBBERY_CONFIG;

    if (wallet <= capThreshold) {
        return capBase;
    }

    return Math.min(
        capMax,
        capBase + Math.floor((wallet - capThreshold) * capExcessRate)
    );
}

// Sorteia o nível do ferimento pelos pesos configurados.
function rollInjury(rng) {
    const levels = ROBBERY_CONFIG.injuryLevels;

    const total = levels.reduce(
        (sum, level) => sum + level.weight,
        0
    );

    let point = rng() * total;

    for (const level of levels) {
        point -= level.weight;

        if (point < 0) {
            return level;
        }
    }

    return levels.at(-1);
}

// ==========================================
// ROUBAR UM JOGADOR
// ==========================================

// Só a carteira do alvo está em risco; o banco é seguro. Tudo
// acontece numa transação. Energia e recarga são gastas com
// sucesso ou falha. Munição e durabilidade só no sucesso.
export function attemptRobbery(
    guildId,
    thiefId,
    victimId,
    {
        now = clock(),
        rng = defaultRng
    } = {}
) {
    if (String(thiefId) === String(victimId)) {
        throw new GameBlocked(
            "Alvo inválido",
            "Você não pode roubar a si mesmo."
        );
    }

    // Garante que o ladrão exista.
    getPlayer(guildId, thiefId);

    return tx(() => {
        // ==================================
        // PRISÃO
        // ==================================

        const prison = getPrison(guildId, thiefId, now);

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

        const combat = combatStatus(guildId, thiefId);

        if (combat.hp < ROBBERY_CONFIG.minHp) {
            throw new GameBlocked(
                "Ferido demais",
                "Você precisa de pelo menos **" +
                ROBBERY_CONFIG.minHp +
                " HP** para roubar.\n" +
                "❤️ **Vida atual:** " + combat.hp + "\n\n" +
                "Use `/curar` no hospital."
            );
        }

        // ==================================
        // RECARGA
        // ==================================

        const state = ensureCrimePlayer(guildId, thiefId);

        const remaining =
            state.last_rob + ROBBERY_CONFIG.cooldown - now;

        if (remaining > 0) {
            throw new GameBlocked(
                "Recarga em andamento",
                "Você ainda está se escondendo depois do último roubo.\n\n" +
                "⏰ **Próximo roubo em:** " +
                formatDuration(remaining)
            );
        }

        // ==================================
        // ARMA
        // ==================================

        const weapon = getEquippedWeapon(guildId, thiefId);

        if (!weapon) {
            throw new GameBlocked(
                "Sem arma",
                "Você precisa de uma arma equipada para roubar.\n" +
                "Use `/equipar` com uma arma do seu inventário."
            );
        }

        const firearm = weapon.weaponType === "firearm";

        if (firearm && combat.ammo < 1) {
            throw new GameBlocked(
                "Sem munição",
                "Sua arma de fogo está descarregada.\n" +
                "Use `/municao` para comprar balas."
            );
        }

        if (combat.durability <= 0) {
            throw new GameBlocked(
                "Arma quebrada",
                "Sua arma está sem durabilidade.\n" +
                "Use `/reparar` para consertá-la."
            );
        }

        // ==================================
        // ENERGIA
        // ==================================

        const energy = consumeEnergy(
            guildId,
            thiefId,
            ROBBERY_CONFIG.energyCost,
            now
        );

        if (!energy.success) {
            throw new GameBlocked(
                "Energia insuficiente",
                "Você não tem energia para um roubo agora.\n\n" +
                "⚡ **Custo:** " + ROBBERY_CONFIG.energyCost +
                " pontos\n" +
                "🔋 **Energia atual:** " + energy.energy +
                "/" + energy.max + "\n" +
                "❌ **Faltam:** " + energy.missing + " pontos\n\n" +
                "Use `/energia` para acompanhar a regeneração."
            );
        }

        // ==================================
        // SORTEIO
        // ==================================

        // O alvo não é criado nem alterado além do que o roubo
        // leva: lê a carteira sem inserir registros.
        const victim = db.prepare(`
            SELECT wallet
            FROM players
            WHERE guild_id = ?
              AND user_id = ?
        `).get(guildId, victimId);

        const wallet = victim?.wallet ?? 0;

        const chance = robberyChance(weapon);

        // Carteira pequena demais: sempre falha, mas gasta tudo.
        const poor = wallet <= ROBBERY_CONFIG.minTargetWallet;

        const success = !poor && rng() * 100 < chance;

        const context = {
            guildId,
            thiefId,
            victimId,
            now,
            rng,
            combat,
            weapon,
            firearm,
            wallet,
            chance,
            poor,
            energy
        };

        return success
            ? resolveSuccess(context)
            : resolveFailure(context);
    });
}

// ==========================================
// SUCESSO
// ==========================================

function resolveSuccess({
    guildId,
    thiefId,
    victimId,
    now,
    rng,
    combat,
    weapon,
    firearm,
    wallet,
    chance,
    energy
}) {
    const { stealRate, cleanShare } = ROBBERY_CONFIG;

    const rate =
        stealRate.min +
        rng() * (stealRate.max - stealRate.min);

    const amount = Math.max(
        1,
        Math.min(
            Math.floor(wallet * rate),
            robberyCap(wallet),
            wallet
        )
    );

    const clean = Math.floor(amount * cleanShare);

    const dirty = amount - clean;

    const taken = db.prepare(`
        UPDATE players
        SET wallet = wallet - ?
        WHERE guild_id = ?
          AND user_id = ?
          AND wallet >= ?
    `).run(amount, guildId, victimId, amount);

    if (taken.changes !== 1) {
        throw new Error("Não foi possível levar o dinheiro do alvo.");
    }

    const thief = db.prepare(`
        SELECT dirty_money
        FROM players
        WHERE guild_id = ?
          AND user_id = ?
    `).get(guildId, thiefId);

    if (thief.dirty_money > CRIME_CONFIG.maxDirtyMoney - dirty) {
        throw new GameBlocked(
            "Limite atingido",
            "Seu dinheiro sujo atingiu o limite permitido. " +
            "Lave parte dele com `/lavagem` antes de continuar."
        );
    }

    db.prepare(`
        UPDATE players
        SET wallet = wallet + ?,
            dirty_money = dirty_money + ?
        WHERE guild_id = ?
          AND user_id = ?
    `).run(clean, dirty, guildId, thiefId);

    // Só o sucesso gasta munição (arma de fogo) e durabilidade.
    db.prepare(`
        UPDATE combat_gear
        SET ammo = ammo - ?,
            durability = MAX(0, durability - 1)
        WHERE guild_id = ?
          AND user_id = ?
    `).run(firearm ? 1 : 0, guildId, thiefId);

    // Ferimento na fuga.
    let injury = null;
    let hpLost = 0;

    if (rng() < ROBBERY_CONFIG.escapeInjuryChance) {
        injury = rollInjury(rng);

        hpLost = Math.min(combat.hp, injury.hp);

        db.prepare(`
            UPDATE combat_players
            SET hp = hp - ?
            WHERE guild_id = ?
              AND user_id = ?
        `).run(hpLost, guildId, thiefId);
    }

    db.prepare(`
        INSERT INTO transactions (
            guild_id,
            user_id,
            target_id,
            type,
            amount
        )
        VALUES (?, ?, ?, 'robbery', ?)
    `).run(guildId, thiefId, victimId, amount);

    registerAttempt(guildId, thiefId, now);

    return {
        success: true,
        amount,
        clean,
        dirty,
        chance,
        weapon: { name: weapon.name, emoji: weapon.emoji || "🔫" },
        spentAmmo: firearm,
        injury: injury?.name ?? null,
        hpLost,
        hp: combat.hp - hpLost,
        energy: energy.energy,
        energyMax: energy.max
    };
}

// ==========================================
// FALHA
// ==========================================

function resolveFailure({
    guildId,
    thiefId,
    victimId,
    now,
    rng,
    combat,
    chance,
    poor,
    energy
}) {
    // Revide: o alvo armado (e com munição, se for arma de fogo)
    // pode ferir o ladrão. Não gasta munição do alvo.
    let retaliated = false;
    let hpLost = 0;

    const defender = getEquippedWeapon(guildId, victimId);

    if (defender) {
        const gear = db.prepare(`
            SELECT ammo
            FROM combat_gear
            WHERE guild_id = ?
              AND user_id = ?
        `).get(guildId, victimId);

        const armed =
            defender.weaponType !== "firearm" ||
            (gear?.ammo ?? 0) >= 1;

        if (armed && rng() < ROBBERY_CONFIG.retaliationChance) {
            retaliated = true;

            hpLost = Math.min(
                combat.hp,
                rollBetween(
                    rng,
                    ROBBERY_CONFIG.retaliationHp.min,
                    ROBBERY_CONFIG.retaliationHp.max
                )
            );

            db.prepare(`
                UPDATE combat_players
                SET hp = hp - ?
                WHERE guild_id = ?
                  AND user_id = ?
            `).run(hpLost, guildId, thiefId);
        }
    }

    registerAttempt(guildId, thiefId, now);

    return {
        success: false,
        poor,
        chance,
        retaliated,
        hpLost,
        hp: combat.hp - hpLost,
        energy: energy.energy,
        energyMax: energy.max
    };
}

// Toda tentativa, com sucesso ou falha, gasta a recarga e entra
// na ficha criminal.
function registerAttempt(guildId, thiefId, now) {
    db.prepare(`
        UPDATE crime_players
        SET last_rob = ?,
            criminal_record = criminal_record + 1
        WHERE guild_id = ?
          AND user_id = ?
    `).run(now, guildId, thiefId);
}
