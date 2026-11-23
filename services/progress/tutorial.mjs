import { db } from "../../database/connection.mjs";

import { getPlayer } from "../../database/economy.mjs";

import { getJob } from "../../config/jobs.mjs";

import {
    TUTORIAL_CLAIM_KEY,
    TUTORIAL_REWARD,
    TUTORIAL_STEPS
} from "../../config/tutorial.mjs";

import { calculateLevel } from "./experience.mjs";

import { addStat, getStat } from "./stats.mjs";

import { tx } from "../combat/combat.mjs";

// ==========================================
// O TUTORIAL: O QUE JÁ FOI FEITO E O PRÊMIO
// ==========================================

// Cada passo se confere pelo que a pessoa já fez neste servidor (config/tutorial.mjs). O prêmio é pago uma vez só:
// o contador "tutorial_claimed" marca, e tudo (conferir, marcar, pagar) acontece numa transação.

// O teto da carteira, o mesmo da loja.
const MAX_CENTS = 100_000_000_000_000;

function done(guildId, userId, condition) {
    switch (condition.kind) {
        case "job":
            return Boolean(getJob(getPlayer(guildId, userId).job_id));

        case "stat":
            return getStat(guildId, userId, condition.key) > 0;

        case "transaction":
            return Boolean(db.prepare(`
                SELECT 1
                FROM transactions
                WHERE guild_id = ?
                  AND user_id = ?
                  AND type = ?
                LIMIT 1
            `).get(String(guildId), String(userId), condition.type));

        default:
            return false;
    }
}

/** { steps: [{ ...passo, done }], completed, total, finished, claimed } */
export function tutorialStatus(guildId, userId) {
    const steps = TUTORIAL_STEPS.map(step => ({
        ...step,
        done: step.check.any.some(condition => done(guildId, userId, condition))
    }));

    const completed = steps.filter(step => step.done).length;

    return {
        steps,
        completed,
        total: steps.length,
        finished: completed === steps.length,
        claimed: getStat(guildId, userId, TUTORIAL_CLAIM_KEY) > 0
    };
}

/**
 * Paga o prêmio. Devolve { status }:
 *   incomplete  faltam passos (completed, total)
 *   claimed     já foi pago neste servidor
 *   ok          pago (money, xp, level, leveledUp, wallet)
 */
export function claimTutorial(guildId, userId) {
    return tx(() => {
        const status = tutorialStatus(guildId, userId);

        if (status.claimed) {
            return { status: "claimed" };
        }

        if (!status.finished) {
            return { status: "incomplete", completed: status.completed, total: status.total };
        }

        const player = getPlayer(guildId, userId);

        if (player.wallet > MAX_CENTS - TUTORIAL_REWARD.money) {
            throw new Error("Sua carteira não comporta o prêmio.");
        }

        const xp = player.xp + TUTORIAL_REWARD.xp;

        const level = calculateLevel(xp);

        const paid = db.prepare(`
            UPDATE players
            SET wallet = wallet + ?,
                xp = ?,
                level = ?
            WHERE guild_id = ?
              AND user_id = ?
        `).run(TUTORIAL_REWARD.money, xp, level, String(guildId), String(userId));

        if (paid.changes !== 1) {
            throw new Error("Não foi possível pagar o prêmio.");
        }

        db.prepare(`
            INSERT INTO transactions (guild_id, user_id, target_id, type, amount)
            VALUES (?, ?, NULL, 'tutorial', ?)
        `).run(String(guildId), String(userId), TUTORIAL_REWARD.money);

        addStat(guildId, userId, TUTORIAL_CLAIM_KEY);

        return {
            status: "ok",
            money: TUTORIAL_REWARD.money,
            xp: TUTORIAL_REWARD.xp,
            level,
            leveledUp: level > player.level,
            wallet: player.wallet + TUTORIAL_REWARD.money
        };
    });
}
