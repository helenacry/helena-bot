import { db, seq, set, get, blockedTitle } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const {
    startEscape,
    clickExit,
    handleEscapeClick,
    escapeEligibility,
    activeEscapeSessions,
    clearEscapeSessions
} = await import("../services/prison-escape.mjs");

const { imprison, applyEscape, getPrison } =
    await import("../services/prison.mjs");
const { ESCAPE_CONFIG } = await import("../config/crime.mjs");

const G = "g-escape";
const U = "preso";
const T0 = 1_800_000_000;

// ==========================================
// RELÓGIO SIMULADO
// ==========================================

function createClock(startSec = T0) {
    let now = startSec * 1000;
    let nextId = 1;
    const timers = [];

    const flush = () => new Promise(resolve => setImmediate(resolve));

    return {
        runtime: rng => ({
            nowMs: () => now,
            schedule: (fn, ms) => {
                const id = nextId++;
                timers.push({ id, at: now + ms, fn });
                return id;
            },
            cancel: id => {
                const index = timers.findIndex(t => t.id === id);
                if (index >= 0) timers.splice(index, 1);
            },
            rng
        }),

        async advance(ms) {
            const target = now + ms;

            for (;;) {
                timers.sort((a, b) => a.at - b.at);

                const next = timers[0];

                if (!next || next.at > target) break;

                timers.shift();
                now = next.at;
                next.fn();

                await flush();
            }

            now = target;

            await flush();
        },

        pending: () => timers.length
    };
}

// Sorteios de uma etapa SEM fingimento:
//   [tempo de vigia, fingir?, saída certa]
// vigia 0 = 2500 ms; fingir 0.9 = não; saída v -> 1 + floor(v * 8)
const stage = exit => [0, 0.9, (exit - 0.5) / 8];

function reset({ sentence = 3600 } = {}) {
    clearEscapeSessions();

    db.exec(`
        DELETE FROM prison_players;
        DELETE FROM laundering_jobs;
        DELETE FROM players;
    `);

    set("INSERT INTO players (guild_id, user_id) VALUES (?, ?)", G, U);

    imprison(G, U, sentence, "teste", T0);
}

function start(clock, rngValues, extra = {}) {
    const edits = [];

    const first = startEscape({
        guildId: G,
        userId: U,
        edit: async payload => { edits.push(payload); },
        runtime: clock.runtime(seq(...rngValues)),
        ...extra
    });

    return { first, edits };
}

const titleOf = payload => payload.embeds[0].title;
const prisonRow = () => get("SELECT * FROM prison_players WHERE guild_id=? AND user_id=?", G, U);

// ==========================================
// FLUXO DO JOGO
// ==========================================

test("vencer as 3 etapas corta 15% da pena", async () => {
    reset();

    const clock = createClock();
    const { first, edits } = start(clock, [...stage(1), ...stage(5), ...stage(8)]);

    assert.match(titleOf(first), /O guarda está de olho/);
    assert.equal(first.components.length, 2, "2 fileiras de botões");
    assert.equal(first.components[0].components.length, 4);
    assert.equal(first.components[0].components[0].customId, `fuga:saida:${U}:1`);
    assert.equal(first.components[1].components[3].customId, `fuga:saida:${U}:8`);

    await clock.advance(2500);
    assert.match(titleOf(edits.at(-1)), /O corredor abriu/);
    assert.match(edits.at(-1).embeds[0].description, /saída \*\*1\*\*/);
    assert.equal(clickExit(G, U, 1), true);

    await clock.advance(2500);
    assert.match(edits.at(-1).embeds[0].description, /saída \*\*5\*\*/);
    assert.equal(clickExit(G, U, 5), true);

    await clock.advance(2500);
    assert.match(edits.at(-1).embeds[0].description, /saída \*\*8\*\*/);
    assert.equal(clickExit(G, U, 8), true);

    await clock.advance(0);

    assert.match(titleOf(edits.at(-1)), /Fuga bem-sucedida/);
    assert.deepEqual(edits.at(-1).components, [], "botões somem no fim");

    const row = prisonRow();
    assert.equal(row.release_at, T0 + 3600 - 540, "cortou 15% de 3600 s");
    assert.equal(row.escape_delta, -540);
    assert.equal(activeEscapeSessions(), 0);
    assert.equal(clock.pending(), 0, "não sobra temporizador");
});

test("clicar cedo (guarda vigiando) é ser pego: +10%", async () => {
    reset();

    const clock = createClock();
    const { edits } = start(clock, stage(1));

    assert.equal(clickExit(G, U, 1), true);
    await clock.advance(0);

    assert.match(titleOf(edits.at(-1)), /O guarda te pegou/);
    assert.match(edits.at(-1).embeds[0].description, /hora errada/);
    assert.equal(prisonRow().release_at, T0 + 3600 + 360);
    assert.equal(prisonRow().escape_delta, 360);
    assert.equal(activeEscapeSessions(), 0);
});

test("saída errada é ser pego", async () => {
    reset();

    const clock = createClock();
    const { edits } = start(clock, stage(1));

    await clock.advance(2500);
    clickExit(G, U, 2);
    await clock.advance(0);

    assert.match(titleOf(edits.at(-1)), /O guarda te pegou/);
    assert.match(edits.at(-1).embeds[0].description, /saída errada/);
    assert.equal(prisonRow().escape_delta, 360);
});

test("deixar o tempo do corredor acabar é ser pego", async () => {
    reset();

    const clock = createClock();
    const { edits } = start(clock, stage(1));

    await clock.advance(2500);
    await clock.advance(ESCAPE_CONFIG.openMs - 1);

    assert.match(titleOf(edits.at(-1)), /O corredor abriu/, "ainda dentro do prazo");

    await clock.advance(1);

    assert.match(titleOf(edits.at(-1)), /O guarda te pegou/);
    assert.match(edits.at(-1).embeds[0].description, /demorou demais/);
    assert.equal(prisonRow().escape_delta, 360);
    assert.equal(clickExit(G, U, 1), false, "tentativa já encerrada");
});

test("fingimento: clicar é ser pego e o corredor só abre 2 s depois", async () => {
    reset();

    const clock = createClock();

    // vigia 2500, FINGE (0.1), espera 2000 depois, saída 1
    const { edits } = start(clock, [0, 0.1, 0, 0]);

    await clock.advance(2500);
    assert.match(titleOf(edits.at(-1)), /virou as costas/);

    await clock.advance(ESCAPE_CONFIG.feintMs);
    assert.match(titleOf(edits.at(-1)), /de olho/, "volta a vigiar");

    await clock.advance(ESCAPE_CONFIG.afterFeintMs.min - 1);
    assert.match(titleOf(edits.at(-1)), /de olho/, "ainda não abriu");

    await clock.advance(1);
    assert.match(titleOf(edits.at(-1)), /O corredor abriu/, "abre só depois do mínimo");
});

test("clicar durante o fingimento é ser pego", async () => {
    reset();

    const clock = createClock();
    const { edits } = start(clock, [0, 0.1, 0, 0]);

    await clock.advance(2500);
    clickExit(G, U, 1);
    await clock.advance(0);

    assert.match(titleOf(edits.at(-1)), /O guarda te pegou/);
    assert.match(edits.at(-1).embeds[0].description, /truque/);
});

// ==========================================
// REGRAS DE ELEGIBILIDADE
// ==========================================

test("recarga de 10 minutos, contada do início da tentativa", async () => {
    reset();

    const clock = createClock();
    start(clock, stage(1));

    assert.equal(prisonRow().last_escape_at, T0, "a recarga começa ao iniciar");

    clickExit(G, U, 1); // perde
    await clock.advance(0);

    assert.equal(
        await blockedTitle(() => startEscape({
            guildId: G, userId: U, edit: async () => {},
            runtime: createClock(T0 + 30).runtime(seq())
        })),
        "Fuga em recarga"
    );

    const ok = createClock(T0 + ESCAPE_CONFIG.cooldown);

    assert.doesNotThrow(() => startEscape({
        guildId: G, userId: U, edit: async () => {}, runtime: ok.runtime(seq())
    }));
});

test("só uma tentativa por vez", async () => {
    reset();

    const clock = createClock();
    start(clock, stage(1));

    assert.equal(
        await blockedTitle(() => start(createClock(), stage(1))),
        "Fuga em andamento"
    );
});

test("quem está livre não pode fugir", async () => {
    reset();
    db.exec("DELETE FROM prison_players");

    assert.equal(
        await blockedTitle(() => start(createClock(), stage(1))),
        "Você não está preso"
    );
});

test("não deixa tentar depois de cortar o máximo da pena", async () => {
    reset({ sentence: 3600 });

    // já cortou 50% (1800 s)
    set("UPDATE prison_players SET escape_delta = -1800 WHERE user_id = ?", U);

    const check = escapeEligibility(G, U, T0 + 1000);

    assert.equal(check.ok, false);
    assert.equal(check.title, "Corte máximo atingido");
});

// ==========================================
// EFEITO NA PENA
// ==========================================

test("o corte e o acréscimo respeitam o teto de ±50% da pena", () => {
    reset({ sentence: 3600 });

    const win = () => applyEscape(G, U, "win", T0);
    const loss = () => applyEscape(G, U, "loss", T0);

    assert.equal(win().applied, -540);
    assert.equal(win().applied, -540);
    assert.equal(win().applied, -540);   // -1620 acumulado

    const fourth = win();
    assert.equal(fourth.applied, -180, "só o que falta para -1800");
    assert.equal(prisonRow().escape_delta, -1800);

    assert.equal(win().applied, 0, "no teto, nada muda");

    // do outro lado: derrotas empurram até +1800 e param
    reset({ sentence: 3600 });
    for (let i = 0; i < 5; i++) loss();
    assert.equal(prisonRow().escape_delta, 1800);
    assert.equal(loss().applied, 0);
});

test("o corte maior que o tempo restante solta o preso na hora", () => {
    reset({ sentence: 1000 });

    // faltam só 50 s
    set("UPDATE prison_players SET release_at = ? WHERE user_id = ?", T0 + 50, U);

    const result = applyEscape(G, U, "win", T0);

    assert.equal(result.released, true);
    assert.equal(prisonRow(), undefined, "registro de prisão removido");
    assert.equal(getPrison(G, U, T0), null);
});

test("lavagem pausada acompanha o corte da pena", () => {
    reset({ sentence: 3600 });

    set(`INSERT INTO laundering_jobs
         (guild_id, user_id, kind, amount, payout, started_at, finish_at)
         VALUES (?, ?, 'private', 100000, 80000, ?, ?)`, G, U, T0, T0 + 5000);

    applyEscape(G, U, "win", T0);

    assert.equal(
        get("SELECT finish_at f FROM laundering_jobs WHERE user_id = ?", U).f,
        T0 + 5000 - 540,
        "o término da lavagem adianta junto com a pena"
    );

    applyEscape(G, U, "loss", T0);

    assert.equal(
        get("SELECT finish_at f FROM laundering_jobs WHERE user_id = ?", U).f,
        T0 + 5000 - 540 + 360
    );
});

test("a pena original inclui penas somadas depois", () => {
    reset({ sentence: 3600 });

    imprison(G, U, 3600, "outra", T0 + 10);

    // pena total 7200: 15% = 1080
    assert.equal(applyEscape(G, U, "win", T0 + 10).applied, -1080);
});

// ==========================================
// FALHAS NA EDIÇÃO
// ==========================================

test("se a edição falhar, a tentativa é abandonada sem punição", async () => {
    reset();

    const clock = createClock();

    startEscape({
        guildId: G,
        userId: U,
        edit: async () => { throw new Error("mensagem sumiu"); },
        runtime: clock.runtime(seq(...stage(1)))
    });

    await clock.advance(2500);

    assert.equal(activeEscapeSessions(), 0, "sessão encerrada");
    assert.equal(prisonRow().escape_delta, 0, "pena intacta");
    assert.equal(prisonRow().last_escape_at, T0, "mas a recarga foi gasta");
});

test("as edições saem na ordem, mesmo com respostas lentas", async () => {
    reset();

    const clock = createClock();
    const order = [];

    startEscape({
        guildId: G,
        userId: U,
        // a primeira edição demora mais que as seguintes
        edit: async payload => {
            const label = titleOf(payload);

            await new Promise(r => setTimeout(r, order.length === 0 ? 30 : 1));

            order.push(label);
        },
        runtime: clock.runtime(seq(...stage(1), ...stage(1)))
    });

    await clock.advance(2500);          // corredor abre (edição 1, lenta)
    clickExit(G, U, 1);                 // etapa 2 (edição 2, rápida)

    // Espera as duas edições terminarem, sem contar com um tempo fixo: com a
    // máquina ocupada (a suíte roda vários arquivos ao mesmo tempo) os timers
    // atrasam, e 80 ms fixos às vezes não bastavam.
    for (let i = 0; i < 300 && order.length < 2; i++) {
        await new Promise(r => setTimeout(r, 10));
    }

    assert.equal(order.length, 2, "as duas edições terminaram");
    assert.match(order[0], /O corredor abriu/);
    assert.match(order[1], /de olho/);
});

// ==========================================
// CLIQUES (resposta ao gateway)
// ==========================================

const click = (customId, userId = U) => ({
    guildId: G,
    user: { id: userId },
    data: { customId }
});

test("o botão só funciona para o dono", () => {
    reset();

    const response = handleEscapeClick(click(`fuga:iniciar:${U}`, "outra-pessoa"), {});

    assert.equal(response.data.ephemeral, true);
    assert.match(response.data.embeds[0].title, /não é seu/);
    assert.equal(activeEscapeSessions(), 0);
});

test("iniciar solta uma mensagem só sua, com as 8 saídas", () => {
    reset();

    const clock = createClock();

    const response = handleEscapeClick(click(`fuga:iniciar:${U}`), {
        edit: async () => {},
        runtime: clock.runtime(seq(...stage(1)))
    });

    assert.equal(response.type, "message");
    assert.equal(response.data.ephemeral, true);
    assert.match(response.data.embeds[0].title, /de olho/);

    const buttons = response.data.components.flatMap(row => row.components);

    assert.equal(buttons.length, 8);
    assert.ok(buttons.every(b => b.customId.startsWith(`fuga:saida:${U}:`)));
    assert.equal(activeEscapeSessions(), 1);
});

test("cliques nas saídas só confirmam; o resultado vem por edição", async () => {
    reset();

    const clock = createClock();

    handleEscapeClick(click(`fuga:iniciar:${U}`), {
        edit: async () => {},
        runtime: clock.runtime(seq(...stage(1)))
    });

    const ack = handleEscapeClick(click(`fuga:saida:${U}:3`), {});

    assert.deepEqual(ack, { type: "defer_update" });
});

test("clique sem tentativa em andamento avisa que acabou", () => {
    reset();

    const response = handleEscapeClick(click(`fuga:saida:${U}:3`), {});

    assert.equal(response.data.ephemeral, true);
    assert.match(response.data.embeds[0].title, /encerrada/);
});

test("iniciar sem estar preso, ou em recarga, vira aviso privado", () => {
    reset();
    db.exec("DELETE FROM prison_players");

    const free = handleEscapeClick(click(`fuga:iniciar:${U}`), {});

    assert.equal(free.data.ephemeral, true);
    assert.match(free.data.embeds[0].title, /não está preso/);
});

test("botão desconhecido não quebra", () => {
    reset();

    const response = handleEscapeClick(click(`fuga:xyz:${U}`), {});

    assert.equal(response.data.ephemeral, true);
    assert.match(response.data.embeds[0].title, /desconhecida/);
});
