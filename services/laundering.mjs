
import { db } from "../database/connection.mjs";

import {
    getPlayer,
    formatMoney
} from "../database/economy.mjs";

import { consumeEnergy } from "./energy.mjs";

import {
    tx,
    now as clock
} from "./combat.mjs";

import { getPrison } from "./prison.mjs";

import {
    ensureCrimePlayer,
    defaultRng
} from "./crime-player.mjs";

import {
    LAUNDERING_CONFIG
} from "../config/crime.mjs";

import { GameBlocked } from "../utils/game-error.mjs";

import { formatDuration } from "../utils/time.mjs";

export const LAUNDERING_KINDS = Object.keys(
    LAUNDERING_CONFIG.kinds
);

// ==========================================
// CONSULTAR SITUAÇÃO
// ==========================================

export function getLaunderingStatus(
    guildId,
    userId,
    now = clock()
) {
    getPlayer(guildId, userId);

    const state = ensureCrimePlayer(guildId, userId);

    const player = db.prepare(`
        SELECT dirty_money
        FROM players
        WHERE guild_id = ?
          AND user_id = ?
    `).get(guildId, userId);

    const active = db.prepare(`
        SELECT id, kind, amount, started_at, finish_at
        FROM laundering_jobs
        WHERE guild_id = ?
          AND user_id = ?
          AND settled_at IS NULL
    `).get(guildId, userId);

    // Lavagem pública de outra pessoa ocupando o servidor.
    const publicBusy = db.prepare(`
        SELECT finish_at
        FROM laundering_jobs
        WHERE guild_id = ?
          AND kind = 'public'
          AND settled_at IS NULL
          AND user_id <> ?
    `).get(guildId, userId);

    return {
        dirtyMoney: player?.dirty_money ?? 0,

        active: active
            ? {
                kind: active.kind,
                amount: active.amount,
                finishAt: active.finish_at,
                remaining: Math.max(0, active.finish_at - now)
            }
            : null,

        cooldownRemaining: Math.max(
            0,
            state.launder_ready_at - now
        ),

        privateUnlocked: state.private_unlocked === 1,

        publicBusyRemaining: publicBusy
            ? Math.max(0, publicBusy.finish_at - now)
            : 0
    };
}

// ==========================================
// LIBERAR A LAVANDERIA PRIVADA
// ==========================================

// Paga as gemas uma única vez, neste servidor.
export function unlockPrivate(guildId, userId) {
    getPlayer(guildId, userId);

    return tx(() => {
        const state = ensureCrimePlayer(guildId, userId);

        if (state.private_unlocked === 1) {
            throw new GameBlocked(
                "Já liberada",
                "Você já tem acesso à lavanderia privada neste servidor."
            );
        }

        const cost = LAUNDERING_CONFIG.privateUnlockGems;

        const paid = db.prepare(`
            UPDATE global_users
            SET gems = gems - ?
            WHERE user_id = ?
              AND gems >= ?
        `).run(cost, userId, cost);

        if (paid.changes !== 1) {
            throw new GameBlocked(
                "Gemas insuficientes",
                "Liberar a lavanderia privada custa **" +
                cost + " gemas** (uma única vez neste servidor)."
            );
        }

        db.prepare(`
            UPDATE crime_players
            SET private_unlocked = 1
            WHERE guild_id = ?
              AND user_id = ?
        `).run(guildId, userId);

        return { cost };
    });
}

// ==========================================
// INICIAR UMA LAVAGEM
// ==========================================

// amount: dinheiro sujo, em centavos.
export function startLaundering(
    guildId,
    userId,
    {
        amount,
        kind,
        channelId = null,
        now = clock(),
        rng = defaultRng
    }
) {
    const spec = LAUNDERING_CONFIG.kinds[kind];

    if (!spec) {
        throw new Error("Tipo de lavanderia inválido.");
    }

    if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new Error("Valor de lavagem inválido.");
    }

    getPlayer(guildId, userId);

    return tx(() => {
        // ==================================
        // PRISÃO
        // ==================================

        const prison = getPrison(guildId, userId, now);

        if (prison) {
            throw new GameBlocked(
                "Você está preso",
                "Não é possível iniciar uma lavagem na cadeia. " +
                "Faltam **" + formatDuration(prison.remaining) + "**."
            );
        }

        // ==================================
        // LIMITES DO VALOR
        // ==================================

        if (
            amount < LAUNDERING_CONFIG.minAmount ||
            amount > LAUNDERING_CONFIG.maxAmount
        ) {
            throw new GameBlocked(
                "Valor fora do limite",
                "Cada lavagem aceita de **" +
                formatMoney(LAUNDERING_CONFIG.minAmount) +
                "** a **" +
                formatMoney(LAUNDERING_CONFIG.maxAmount) +
                "** em dinheiro sujo."
            );
        }

        // ==================================
        // JÁ EXISTE UMA LAVAGEM?
        // ==================================

        const state = ensureCrimePlayer(guildId, userId);

        const active = db.prepare(`
            SELECT finish_at
            FROM laundering_jobs
            WHERE guild_id = ?
              AND user_id = ?
              AND settled_at IS NULL
        `).get(guildId, userId);

        if (active) {
            throw new GameBlocked(
                "Lavagem em andamento",
                "Você já tem uma lavagem em curso.\n\n" +
                "⏳ **Termina em:** " +
                formatDuration(active.finish_at - now)
            );
        }

        // ==================================
        // RECARGA E ACESSO
        // ==================================

        if (state.launder_ready_at > now) {
            throw new GameBlocked(
                "Lavanderia em recarga",
                "Você usou uma lavanderia há pouco tempo.\n\n" +
                "⏰ **Disponível em:** " +
                formatDuration(state.launder_ready_at - now)
            );
        }

        if (kind === "private" && state.private_unlocked !== 1) {
            throw new GameBlocked(
                "Lavanderia privada bloqueada",
                "A lavanderia privada devolve mais, mas precisa ser " +
                "liberada uma única vez neste servidor por **" +
                LAUNDERING_CONFIG.privateUnlockGems + " gemas**.\n\n" +
                "Use `/lavagem valor:desbloquear` para liberar."
            );
        }

        if (spec.exclusive) {
            const busy = db.prepare(`
                SELECT finish_at
                FROM laundering_jobs
                WHERE guild_id = ?
                  AND kind = ?
                  AND settled_at IS NULL
            `).get(guildId, kind);

            if (busy) {
                throw new GameBlocked(
                    "Lavanderia pública ocupada",
                    "Só uma lavagem pública por vez no servidor.\n\n" +
                    "⏳ **Libera em:** " +
                    formatDuration(busy.finish_at - now)
                );
            }
        }

        // ==================================
        // DINHEIRO SUJO
        // ==================================

        const player = db.prepare(`
            SELECT dirty_money
            FROM players
            WHERE guild_id = ?
              AND user_id = ?
        `).get(guildId, userId);

        if (!player || player.dirty_money < amount) {
            throw new GameBlocked(
                "Dinheiro sujo insuficiente",
                "Você tem **" +
                formatMoney(player?.dirty_money ?? 0) +
                "** em dinheiro sujo."
            );
        }

        // ==================================
        // ENERGIA
        // ==================================

        const energy = consumeEnergy(
            guildId,
            userId,
            LAUNDERING_CONFIG.energyCost,
            now
        );

        if (!energy.success) {
            throw new GameBlocked(
                "Energia insuficiente",
                "Lavar dinheiro exige energia.\n\n" +
                "⚡ **Custo:** " + LAUNDERING_CONFIG.energyCost +
                " pontos\n" +
                "🔋 **Energia atual:** " + energy.energy +
                "/" + energy.max + "\n" +
                "❌ **Faltam:** " + energy.missing + " pontos"
            );
        }

        // ==================================
        // LOTES DE 1 MINUTO
        // ==================================

        // Cada lote sorteia a própria taxa dentro da faixa.
        // O resultado é decidido agora e creditado só ao
        // final, então o jogador não vê o valor antes.
        const batches = Math.ceil(amount / spec.perMinute);

        let left = amount;
        let payout = 0;

        for (let i = 0; i < batches; i++) {
            const part = Math.min(spec.perMinute, left);

            const rate =
                spec.rate.min +
                rng() * (spec.rate.max - spec.rate.min);

            payout += Math.floor(part * rate);

            left -= part;
        }

        const finishAt =
            now + batches * LAUNDERING_CONFIG.batchSeconds;

        // ==================================
        // GRAVAR
        // ==================================

        const spent = db.prepare(`
            UPDATE players
            SET dirty_money = dirty_money - ?
            WHERE guild_id = ?
              AND user_id = ?
              AND dirty_money >= ?
        `).run(amount, guildId, userId, amount);

        if (spent.changes !== 1) {
            throw new Error("Não foi possível separar o dinheiro sujo.");
        }

        db.prepare(`
            INSERT INTO laundering_jobs (
                guild_id,
                user_id,
                channel_id,
                kind,
                amount,
                payout,
                started_at,
                finish_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            guildId,
            userId,
            channelId,
            kind,
            amount,
            payout,
            now,
            finishAt
        );

        // Iniciar uma lavagem também entra na ficha criminal.
        db.prepare(`
            UPDATE crime_players
            SET launder_ready_at = ?,
                criminal_record = criminal_record + 1
            WHERE guild_id = ?
              AND user_id = ?
        `).run(now + spec.cooldown, guildId, userId);

        return {
            kind,
            amount,
            duration: finishAt - now,
            finishAt,
            cooldown: spec.cooldown,
            energy: energy.energy,
            energyMax: energy.max
        };
    });
}

// ==========================================
// CREDITAR LAVAGENS CONCLUÍDAS
// ==========================================

// Credita na carteira todas as lavagens cujo tempo
// acabou. Pode ser limitada a um jogador. Devolve a
// lista do que foi creditado.
export function settleDue(
    now = clock(),
    { guildId = null, userId = null } = {}
) {
    return tx(() => {
        const jobs = db.prepare(`
            SELECT id, guild_id, user_id, channel_id,
                   kind, amount, payout
            FROM laundering_jobs
            WHERE settled_at IS NULL
              AND finish_at <= ?
              AND (? IS NULL OR guild_id = ?)
              AND (? IS NULL OR user_id = ?)
            ORDER BY finish_at, id
        `).all(now, guildId, guildId, userId, userId);

        for (const job of jobs) {
            db.prepare(`
                UPDATE players
                SET wallet = wallet + ?
                WHERE guild_id = ?
                  AND user_id = ?
            `).run(job.payout, job.guild_id, job.user_id);

            db.prepare(`
                UPDATE laundering_jobs
                SET settled_at = ?
                WHERE id = ?
            `).run(now, job.id);

            if (job.payout > 0) {
                db.prepare(`
                    INSERT INTO transactions (
                        guild_id,
                        user_id,
                        target_id,
                        type,
                        amount
                    )
                    VALUES (?, ?, NULL, 'laundering', ?)
                `).run(job.guild_id, job.user_id, job.payout);
            }
        }

        return jobs;
    });
}

// ==========================================
// CONCLUSÃO AUTOMÁTICA
// ==========================================

let timer = null;

// A cada intervalo credita as lavagens que terminaram e
// chama notify({ guildId, channelId, body }) para avisar
// no canal onde foram iniciadas. Se o bot ficou fora do
// ar, o que venceu é creditado assim que ele volta.
export function startLaunderingSweeper(
    notify,
    intervalMs = 30_000
) {
    stopLaunderingSweeper();

    const run = async () => {
        let settled;

        try {
            settled = settleDue();
        } catch (error) {
            console.error("[LAVAGEM]", error);

            return;
        }

        for (const job of settled) {
            if (!job.channel_id) {
                continue;
            }

            try {
                await notify({
                    guildId: job.guild_id,
                    channelId: job.channel_id,
                    body:
                        "💸 <@" + job.user_id + "> sua lavagem " +
                        "terminou! **+" + formatMoney(job.payout) +
                        "** já estão na sua carteira."
                });
            } catch (error) {
                console.warn(
                    "[LAVAGEM] Não foi possível avisar o canal:",
                    error.message
                );
            }
        }
    };

    void run();

    timer = setInterval(() => {
        void run();
    }, intervalMs);

    // Não impede o processo de encerrar.
    timer.unref?.();
}

export function stopLaunderingSweeper() {
    if (timer !== null) {
        clearInterval(timer);
        timer = null;
    }
}
