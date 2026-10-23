import {
    db, getPlayer, set, get, receiptOf, createPrefixRunner
} from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { imprison } = await import("../services/crime/prison.mjs");

const G = "g-daily";
const ME = { id: "111111111111111111", username: "eu", displayName: "Eu Mesmo" };

const HOUR = 3600;
const MAX_WALLET = 100_000_000_000_000;

const run = await createPrefixRunner({ guildId: G, author: ME });

const nowSec = () => Math.floor(Date.now() / 1000);

function reset() {
    for (const table of [
        "players", "daily_streaks", "transactions", "mission_progress",
        "prison_players", "crime_players"
    ]) {
        db.exec(`DELETE FROM ${table}`);
    }

    db.exec("DELETE FROM global_users");

    getPlayer(G, ME.id);
}

const wallet = () => get("SELECT wallet w FROM players WHERE guild_id=? AND user_id=?", G, ME.id).w;
const streakRow = () => get("SELECT * FROM daily_streaks WHERE guild_id=? AND user_id=?", G, ME.id);

// simula "já resgatei há tantas horas, com esta sequência"
function resgatadoHa(hours, streak, best = streak) {
    set("UPDATE players SET last_daily=? WHERE guild_id=? AND user_id=?", nowSec() - hours * HOUR, G, ME.id);

    set(
        `INSERT INTO daily_streaks (guild_id, user_id, streak, best_streak, last_claim_day, total_claims)
         VALUES (?, ?, ?, ?, '2000-01-01', ?)
         ON CONFLICT(guild_id, user_id) DO UPDATE SET streak=excluded.streak, best_streak=excluded.best_streak`,
        G, ME.id, streak, best, streak
    );
}

const embed = r => r.sent[0].embeds[0];

// ==========================================
// PRIMEIRO RESGATE
// ==========================================

test("o primeiro resgate paga R$ 500, abre a sequência e registra tudo", async () => {
    reset();

    const r = await run("hdaily");

    assert.equal(r.title, "🎁 Recompensa do dia");

    const f = receiptOf(embed(r));

    assert.match(f["Recompensa base"], /\+R\$\s?500,00/);
    assert.match(f["Total"], /\+R\$\s?500,00/);
    assert.match(f["Carteira"], /R\$\s?500,00/);
    assert.match(embed(r).description, /\*\*1 dia\*\* seguidos · recorde de 1 dia/);
    assert.match(embed(r).description, /Dia \*\*1\*\* de 7/);

    assert.equal(wallet(), 50_000);

    const streak = streakRow();

    assert.deepEqual(
        [streak.streak, streak.best_streak, streak.total_claims],
        [1, 1, 1]
    );

    assert.deepEqual(
        { ...get("SELECT type, amount FROM transactions WHERE guild_id=? AND user_id=?", G, ME.id) },
        { type: "daily", amount: 50_000 }
    );

    assert.equal(
        get("SELECT progress p FROM mission_progress WHERE guild_id=? AND user_id=? AND mission_id='daily'", G, ME.id).p,
        1,
        "a missão diária conta o resgate"
    );

    assert.ok(Math.abs(get("SELECT last_daily l FROM players WHERE guild_id=? AND user_id=?", G, ME.id).l - nowSec()) <= 2);
});

test("resgatar de novo antes de 24 horas só mostra o tempo que falta", async () => {
    reset();

    await run("hdaily");

    const again = await run("hdaily");

    assert.equal(again.title, "⏳ Você já resgatou hoje");
    assert.match(embed(again).description, /Volte em \*\*2[34]h /);
    assert.match(embed(again).description, /\*\*1 dia\*\* seguidos/);

    assert.equal(wallet(), 50_000, "não pagou outra vez");
    assert.equal(streakRow().total_claims, 1);
    assert.equal(get("SELECT COUNT(*) c FROM transactions").c, 1);
});

// ==========================================
// SEQUÊNCIA
// ==========================================

test("no dia seguinte a sequência continua e o bônus de R$ 50 aparece", async () => {
    reset();
    resgatadoHa(25, 1);

    const e = embed(await run("hdaily"));
    const f = receiptOf(e);

    assert.match(e.description, /\*\*2 dias\*\* seguidos/);
    assert.match(f["Bônus de sequência"], /\+R\$\s?50,00/);
    assert.match(f["Total"], /\+R\$\s?550,00/);
    assert.equal(wallet(), 55_000);
});

test("passando de 48 horas a sequência volta para 1, mas o recorde fica", async () => {
    reset();
    resgatadoHa(49, 5, 9);

    const e = embed(await run("hdaily"));

    assert.match(e.description, /\*\*1 dia\*\* seguidos · recorde de 9 dias/);
    assert.match(receiptOf(e)["Total"], /\+R\$\s?500,00/);
});

test("exatamente 48 horas depois ainda mantém a sequência", async () => {
    reset();
    resgatadoHa(48, 3);

    assert.match(embed(await run("hdaily")).description, /\*\*4 dias\*\* seguidos/);
});

test("o sétimo dia paga o bônus semanal: R$ 1.300 no total", async () => {
    reset();
    resgatadoHa(25, 6);

    const r = await run("hdaily");
    const f = receiptOf(embed(r));

    assert.match(embed(r).description, /\*\*7 dias\*\* seguidos/);
    assert.match(f["Bônus de sequência"], /\+R\$\s?300,00/);
    assert.match(f["Bônus de 7 dias"], /\+R\$\s?500,00/);
    assert.match(f["Total"], /\+R\$\s?1\.300,00/);
    assert.match(embed(r).description, /bônus semanal saiu junto/);
    assert.equal(wallet(), 130_000);
});

test("o oitavo dia recomeça o bônus de sequência do zero", async () => {
    reset();
    resgatadoHa(25, 7);

    const e = embed(await run("hdaily"));
    const f = receiptOf(e);

    assert.match(e.description, /\*\*8 dias\*\* seguidos/);
    assert.equal(f["Bônus de sequência"], undefined, "sem bônus, a linha nem aparece");
    assert.match(f["Total"], /\+R\$\s?500,00/);
    assert.equal(f["Bônus de 7 dias"], undefined);
});

// ==========================================
// LIMITES
// ==========================================

test("carteira no limite: recusa sem pagar nem gastar a recarga", async () => {
    reset();
    set("UPDATE players SET wallet=? WHERE guild_id=? AND user_id=?", MAX_WALLET - 100, G, ME.id);

    const r = await run("hdaily");

    assert.match(r.title, /Carteira no limite/);
    assert.equal(wallet(), MAX_WALLET - 100);
    assert.equal(streakRow(), undefined, "não abriu sequência");
    assert.equal(get("SELECT last_daily l FROM players WHERE guild_id=? AND user_id=?", G, ME.id).l, 0);
});

test("preso não resgata o daily", async () => {
    reset();
    imprison(G, ME.id, 1800, "teste", nowSec());

    const r = await run("hdaily");

    assert.match(r.title, /Você está preso/);
    assert.equal(wallet(), 0);
    assert.equal(streakRow(), undefined);
});

test("o alias hdiario resgata do mesmo jeito", async () => {
    reset();

    assert.equal((await run("hdiario")).title, "🎁 Recompensa do dia");
    assert.equal(wallet(), 50_000);
});

test("cada servidor tem a própria recarga e a própria sequência", async () => {
    reset();

    await run("hdaily");

    const other = await createPrefixRunner({ guildId: "g-daily-2", author: ME });

    assert.equal((await other("hdaily")).title, "🎁 Recompensa do dia", "em outro servidor ainda está liberado");

    assert.equal(
        get("SELECT wallet w FROM players WHERE guild_id='g-daily-2' AND user_id=?", ME.id).w,
        50_000
    );
});

// ==========================================
// SERVIÇO (usado também pelo site)
// ==========================================

const { claimDaily, getDailyStatus, DAILY_CONFIG } = await import("../services/economy/daily.mjs");

test("getDailyStatus de quem nunca jogou: liberado, e não cria o jogador", () => {
    reset();

    const before = get("SELECT COUNT(*) c FROM players").c;

    const status = getDailyStatus("g-novo", "999999999999999999");

    assert.equal(status.available, true);
    assert.equal(status.remaining, 0);
    assert.equal(status.streak, 0);
    assert.equal(status.nextStreak, 1);
    assert.equal(status.nextReward.total, 50_000);

    assert.equal(get("SELECT COUNT(*) c FROM players").c, before, "só leitura");
    assert.equal(get("SELECT COUNT(*) c FROM daily_streaks").c, 0);
});

test("getDailyStatus depois do resgate: em espera, com a sequência e o próximo prêmio", () => {
    reset();

    claimDaily(G, ME.id);

    const status = getDailyStatus(G, ME.id);

    assert.equal(status.available, false);
    assert.ok(status.remaining > DAILY_CONFIG.cooldown - 5 && status.remaining <= DAILY_CONFIG.cooldown);
    assert.equal(status.streak, 1);
    assert.equal(status.bestStreak, 1);
    assert.equal(status.nextStreak, 2);
    assert.equal(status.nextReward.total, 55_000);
});

test("getDailyStatus: sequência que já venceu aparece como 0, e a próxima volta para 1", () => {
    reset();
    resgatadoHa(49, 5, 9);

    const status = getDailyStatus(G, ME.id);

    assert.equal(status.available, true);
    assert.equal(status.streak, 0);
    assert.equal(status.bestStreak, 9);
    assert.equal(status.nextStreak, 1);
});

test("claimDaily devolve o resultado em vez de mensagens, e aceita a hora como parâmetro", () => {
    reset();

    const t = 1_800_000_000;

    const first = claimDaily(G, ME.id, t);

    assert.equal(first.status, "claimed");
    assert.equal(first.reward.total, 50_000);
    assert.equal(first.streak, 1);
    assert.equal(first.wallet, 50_000);

    const second = claimDaily(G, ME.id, t + 10);

    assert.deepEqual({ ...second }, { status: "cooldown", remaining: DAILY_CONFIG.cooldown - 10, streak: 1, bestStreak: 1 });

    const third = claimDaily(G, ME.id, t + DAILY_CONFIG.cooldown);

    assert.equal(third.status, "claimed");
    assert.equal(third.streak, 2, "exatamente 24 h depois já libera");
    assert.equal(third.wallet, 50_000 + 55_000);
});

test("duas coletas na mesma hora: só uma paga", () => {
    reset();

    const t = 1_800_000_000;
    const results = [claimDaily(G, ME.id, t), claimDaily(G, ME.id, t)];

    assert.deepEqual(results.map(r => r.status), ["claimed", "cooldown"]);
    assert.equal(wallet(), 50_000);
    assert.equal(get("SELECT COUNT(*) c FROM transactions").c, 1);
});
