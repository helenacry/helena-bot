
import { db } from "../../database/connection.mjs";

import {
    getPrison,
    applyEscape
} from "./prison.mjs";

import {
    defaultRng,
    rollBetween
} from "./crime-player.mjs";

import { ESCAPE_CONFIG } from "../../config/crime.mjs";

import { GameBlocked } from "../../utils/game-error.mjs";

import { formatDuration } from "../../utils/time.mjs";

import {
    errorEmbed,
    warningEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

// ==========================================
// FUGA DA PRISÃO (MINIGAME)
// ==========================================

// Três etapas. Em cada uma:
//   1. o guarda vigia (vermelho): qualquer clique é ser pego;
//   2. às vezes finge virar as costas (laranja): clicar também é
//      ser pego, e o corredor nunca abre logo depois;
//   3. o corredor abre (verde): é preciso apertar a saída certa
//      dentre 8, a tempo.
// Vencer as três corta uma parte da pena; ser pego acrescenta.
//
// A tela é uma mensagem só do jogador, editada a cada mudança de
// fase. Se a edição falhar (mensagem sumiu, token vencido), a
// tentativa é abandonada sem punição, mas a recarga já foi gasta.

const EXIT_ICONS = ["🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "🟫", "⬛"];

// Se a tentativa travar por qualquer motivo, a sessão some sozinha.
const SESSION_TIMEOUT_MS = 120_000;

const sessions = new Map();

const sessionKey = (guildId, userId) => `${guildId}:${userId}`;

// Relógio, agendador e sorteio. Os testes trocam por versões
// controladas, para não esperar segundos de verdade.
export function realRuntime() {
    return {
        nowMs: () => Date.now(),
        schedule: (fn, ms) => setTimeout(fn, ms),
        cancel: id => clearTimeout(id),
        rng: defaultRng
    };
}

export function activeEscapeSessions() {
    return sessions.size;
}

export function clearEscapeSessions() {
    for (const session of [...sessions.values()]) {
        abort(session);
    }
}

// ==========================================
// PODE TENTAR?
// ==========================================

export function escapeEligibility(guildId, userId, nowSec) {
    const prison = getPrison(guildId, userId, nowSec);

    if (!prison) {
        return {
            ok: false,
            title: "Você não está preso",
            message: "Não há do que fugir: você está livre."
        };
    }

    const since = nowSec - prison.lastEscapeAt;

    if (
        prison.lastEscapeAt > 0 &&
        since < ESCAPE_CONFIG.cooldown
    ) {
        return {
            ok: false,
            title: "Fuga em recarga",
            message:
                "Você só pode tentar outra fuga em **" +
                formatDuration(ESCAPE_CONFIG.cooldown - since) +
                "**."
        };
    }

    const limit = Math.round(
        prison.sentence * ESCAPE_CONFIG.maxChange
    );

    if (prison.escapeDelta <= -limit) {
        return {
            ok: false,
            title: "Corte máximo atingido",
            message:
                "Você já cortou o máximo da pena (" +
                Math.round(ESCAPE_CONFIG.maxChange * 100) +
                "%) com fugas. Agora é esperar o resto."
        };
    }

    return { ok: true, prison };
}

// ==========================================
// TELAS
// ==========================================

function cutLine(prison) {
    if (!prison) {
        return "—";
    }

    const percent = Math.round(
        (-prison.escapeDelta / prison.sentence) * 100
    );

    const max = Math.round(ESCAPE_CONFIG.maxChange * 100);

    // Positivo = pena cortada; negativo = pena aumentada.
    return (percent >= 0 ? "-" : "+") +
        Math.abs(percent) + "% (limite de ±" + max + "%)";
}

function exitButtons(userId, style, disabled = false) {
    const rows = [];

    const perRow = 4;

    for (let start = 0; start < ESCAPE_CONFIG.exits; start += perRow) {
        rows.push({
            type: "row",
            components: Array.from({ length: perRow }, (_, i) => {
                const exit = start + i + 1;

                return {
                    type: "button",
                    customId: `fuga:saida:${userId}:${exit}`,
                    label: String(exit),
                    emoji: EXIT_ICONS[exit - 1],
                    style,
                    disabled
                };
            })
        });
    }

    return rows;
}

function screen(session) {
    const prison = getPrison(session.guildId, session.userId);

    const rows = [
        ["Etapa", session.stage + "/" + ESCAPE_CONFIG.stages],
        ["Pena restante", prison ? formatDuration(prison.remaining) : "—"],
        ["Corte por fugas", cutLine(prison)]
    ];

    if (session.phase === "open") {
        const icon = EXIT_ICONS[session.correct - 1];

        return {
            embeds: [ledgerEmbed({
                section: "Fuga",
                title: "🟢 O corredor abriu",

                say:
                    "Aperte a saída **" + session.correct + "** " +
                    icon + " em até **" +
                    Math.round(ESCAPE_CONFIG.openMs / 1000) +
                    " segundos**!",

                rows,

                color: HELENA_COLORS.success,
                mood: "mascara",

                footer: "Fuga da prisão"
            })],

            components: exitButtons(session.userId, "success")
        };
    }

    if (session.phase === "feint") {
        return {
            embeds: [ledgerEmbed({
                section: "Fuga",
                title: "🟠 O guarda virou as costas...",

                say:
                    "Parece a hora, mas pode ser um truque. " +
                    "**Não clique!**",

                rows,

                color: HELENA_COLORS.warning,
                mood: "alerta",

                footer: "Fuga da prisão"
            })],

            components: exitButtons(session.userId, "danger")
        };
    }

    return {
        embeds: [ledgerEmbed({
            section: "Fuga",
            title: "🔴 O guarda está de olho",

            say:
                "Fique quieto e espere o corredor abrir. " +
                "**Clicar agora é ser pego!**",

            rows,

            color: HELENA_COLORS.error,
            mood: "preso",

            footer: "Fuga da prisão"
        })],

        components: exitButtons(session.userId, "secondary")
    };
}

function finalScreen(outcome, reason, result) {
    const cut = formatDuration(Math.abs(result.applied));

    if (outcome === "win") {
        return {
            embeds: [ledgerEmbed({
                section: "Fuga",
                title: result.released
                    ? "🔓 Você escapou da prisão"
                    : "✅ Fuga bem-sucedida",

                say: result.released
                    ? "Você passou pelos três guardas e saiu andando. " +
                      "Está livre!"
                    : "Você passou pelos três guardas e cortou parte " +
                      "da pena.",

                rows: [
                    ["Pena cortada", result.applied === 0 ? "nada (limite atingido)" : "-" + cut],
                    ["Pena restante", result.released ? "livre" : formatDuration(result.remaining)]
                ],

                color: HELENA_COLORS.success,
                mood: result.released ? "festa" : "feliz",

                footer: "Fuga da prisão"
            })],

            components: []
        };
    }

    return {
        embeds: [ledgerEmbed({
            section: "Fuga",
            title: "🚨 O guarda te pegou",

            say: reason,

            rows: [
                ["Pena acrescentada", result.applied === 0 ? "nada (limite atingido)" : "+" + cut],
                ["Pena restante", result.released ? "livre" : formatDuration(result.remaining)]
            ],

            color: HELENA_COLORS.error,
            mood: "preso",

            footer:
                "Próxima tentativa em até " +
                formatDuration(ESCAPE_CONFIG.cooldown)
        })],

        components: []
    };
}

// ==========================================
// EDIÇÃO EM FILA
// ==========================================

// As edições saem uma de cada vez e na ordem, para uma tela antiga
// nunca sobrescrever uma mais nova. Se uma falhar, a tentativa é
// abandonada.
function enqueue(session, payload) {
    session.chain = session.chain.then(async () => {
        if (session.aborted) {
            return;
        }

        try {
            await session.edit(payload);

        } catch (error) {
            abort(session);
        }
    });
}

function abort(session) {
    session.aborted = true;

    finishSession(session);
}

function finishSession(session) {
    session.done = true;

    for (const id of session.timers) {
        session.runtime.cancel(id);
    }

    session.timers.clear();

    if (sessions.get(session.key) === session) {
        sessions.delete(session.key);
    }
}

function later(session, ms, fn) {
    const id = session.runtime.schedule(() => {
        session.timers.delete(id);

        if (!session.done) {
            fn();
        }
    }, ms);

    session.timers.add(id);
}

// ==========================================
// FASES
// ==========================================

function beginStage(session) {
    const { rng } = session.runtime;

    session.phase = "watching";
    session.correct = null;
    session.deadline = null;

    const watch = rollBetween(
        rng,
        ESCAPE_CONFIG.watchMs.min,
        ESCAPE_CONFIG.watchMs.max
    );

    const feint = rng() < ESCAPE_CONFIG.feintChance;

    later(session, watch, () => {
        if (feint) {
            startFeint(session);
        } else {
            openCorridor(session);
        }
    });
}

function startFeint(session) {
    session.phase = "feint";

    enqueue(session, screen(session));

    later(session, ESCAPE_CONFIG.feintMs, () => {
        // Volta a vigiar. O corredor só abre depois de um tempo
        // mínimo, para o fingimento não ser confundido com ele.
        session.phase = "watching";

        enqueue(session, screen(session));

        const wait = rollBetween(
            session.runtime.rng,
            ESCAPE_CONFIG.afterFeintMs.min,
            ESCAPE_CONFIG.afterFeintMs.max
        );

        later(session, wait, () => openCorridor(session));
    });
}

function openCorridor(session) {
    const { rng, nowMs } = session.runtime;

    session.phase = "open";

    session.correct =
        1 + Math.floor(rng() * ESCAPE_CONFIG.exits);

    session.deadline = nowMs() + ESCAPE_CONFIG.openMs;

    enqueue(session, screen(session));

    later(session, ESCAPE_CONFIG.openMs, () => {
        if (session.phase === "open") {
            finish(
                session,
                "loss",
                "Você demorou demais e o guarda fechou o corredor."
            );
        }
    });
}

// Encerra a tentativa, aplica o efeito na pena e mostra o resultado.
function finish(session, outcome, reason) {
    finishSession(session);

    const nowSec = Math.floor(session.runtime.nowMs() / 1000);

    let result;

    try {
        result = applyEscape(
            session.guildId,
            session.userId,
            outcome,
            nowSec
        );

    } catch (error) {
        console.error("[FUGA]", error);

        return null;
    }

    // A mensagem final sai mesmo com a sessão já encerrada.
    session.aborted = false;

    enqueue(session, finalScreen(outcome, reason, result));

    return result;
}

// ==========================================
// INICIAR E RESPONDER A CLIQUES
// ==========================================

// Começa uma tentativa. Devolve a primeira tela (que vira a
// resposta ao clique em "Tentar fuga"); as seguintes saem por
// edit(payload). Gasta a recarga na hora.
export function startEscape({
    guildId,
    userId,
    edit,
    runtime = realRuntime()
}) {
    const id = sessionKey(guildId, userId);

    if (sessions.has(id)) {
        throw new GameBlocked(
            "Fuga em andamento",
            "Você já está no meio de uma tentativa de fuga."
        );
    }

    const nowSec = Math.floor(runtime.nowMs() / 1000);

    const check = escapeEligibility(guildId, userId, nowSec);

    if (!check.ok) {
        throw new GameBlocked(check.title, check.message);
    }

    db.prepare(`
        UPDATE prison_players
        SET last_escape_at = ?
        WHERE guild_id = ?
          AND user_id = ?
    `).run(nowSec, guildId, userId);

    const session = {
        key: id,
        guildId,
        userId,
        edit,
        runtime,
        stage: 1,
        phase: "watching",
        correct: null,
        deadline: null,
        timers: new Set(),
        chain: Promise.resolve(),
        done: false,
        aborted: false
    };

    sessions.set(id, session);

    // Rede de segurança contra tentativas travadas.
    later(session, SESSION_TIMEOUT_MS, () => abort(session));

    beginStage(session);

    return screen(session);
}

// Clique numa saída. Devolve false se não há tentativa em curso.
export function clickExit(guildId, userId, exit) {
    const session = sessions.get(sessionKey(guildId, userId));

    if (!session || session.done) {
        return false;
    }

    const { nowMs } = session.runtime;

    if (session.phase !== "open") {
        finish(
            session,
            "loss",
            session.phase === "feint"
                ? "Era um truque! O guarda só fingiu virar as costas."
                : "Você se mexeu na hora errada e o guarda te viu."
        );

        return true;
    }

    if (nowMs() > session.deadline) {
        finish(
            session,
            "loss",
            "Você demorou demais e o guarda fechou o corredor."
        );

        return true;
    }

    if (exit !== session.correct) {
        finish(
            session,
            "loss",
            "Você escolheu a saída errada e deu de cara com um guarda."
        );

        return true;
    }

    // Acertou: próxima etapa, ou fuga completa.
    for (const timer of session.timers) {
        session.runtime.cancel(timer);
    }

    session.timers.clear();

    if (session.stage >= ESCAPE_CONFIG.stages) {
        finish(session, "win", "");

        return true;
    }

    session.stage++;

    // O timeout de segurança precisa continuar valendo.
    later(session, SESSION_TIMEOUT_MS, () => abort(session));

    beginStage(session);

    enqueue(session, screen(session));

    return true;
}

// ==========================================
// RESPOSTA AO CLIQUE (usado pelo gateway)
// ==========================================

function ephemeral(response) {
    return {
        ...response,
        data: { ...response.data, ephemeral: true }
    };
}

// customId:
//   fuga:iniciar:<donoId>            botão "Tentar fuga"
//   fuga:saida:<donoId>:<número>     uma das saídas
export function handleEscapeClick(
    interaction,
    { edit, runtime } = {}
) {
    const [, action, ownerId, arg] = String(
        interaction.data?.customId || ""
    ).split(":");

    const guildId = interaction.guildId;
    const userId = interaction.user?.id;

    if (!guildId || !userId) {
        return ephemeral(warningEmbed(
            "Indisponível",
            "A fuga só funciona em um servidor."
        ));
    }

    if (String(userId) !== String(ownerId)) {
        return ephemeral(warningEmbed(
            "Esse botão não é seu",
            "Só quem está preso pode tentar a fuga."
        ));
    }

    try {
        if (action === "iniciar") {
            const first = startEscape({
                guildId,
                userId,
                edit,
                runtime
            });

            return {
                type: "message",
                data: { ephemeral: true, ...first }
            };
        }

        if (action === "saida") {
            const handled = clickExit(
                guildId,
                userId,
                Number(arg)
            );

            if (!handled) {
                return ephemeral(warningEmbed(
                    "Tentativa encerrada",
                    "Essa tentativa de fuga já terminou."
                ));
            }

            // O resultado vai por edição da mensagem; aqui só
            // confirma o clique.
            return { type: "defer_update" };
        }

    } catch (error) {
        if (error instanceof GameBlocked) {
            return ephemeral(
                warningEmbed(error.title, error.message)
            );
        }

        console.error("[FUGA]", error);

        return ephemeral(errorEmbed(
            "Não foi possível processar a fuga: " + error.message
        ));
    }

    return ephemeral(warningEmbed(
        "Ação desconhecida",
        "Esse botão de fuga não é reconhecido."
    ));
}
