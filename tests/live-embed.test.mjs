import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const {
    startLiveUpdate, stopLiveUpdate, stopAllLiveUpdates,
    activeLiveUpdates, LiveEditError
} = await import("../services/live-embed.mjs");
const { LIVE_CONFIG } = await import("../config/live.mjs");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const base = {
    intervalMs: 20,
    maxMs: 10_000,
    render: () => ({ payload: {}, done: false })
};

test.afterEach(() => stopAllLiveUpdates());

test("edita a cada intervalo até o render dizer que acabou", async () => {
    let left = 3;
    const edited = [];

    startLiveUpdate({
        ...base,
        key: "k1",
        render: () => ({ payload: { left }, done: --left < 0 }),
        edit: async payload => { edited.push(payload.left); }
    });

    await wait(250);

    assert.deepEqual(edited, [3, 2, 1, 0]);
    assert.equal(activeLiveUpdates(), 0, "para sozinho");
});

test("a mesma chave substitui a atualização anterior", async () => {
    let a = 0;
    let b = 0;

    startLiveUpdate({ ...base, key: "k", edit: async () => { a++; } });
    await wait(70);

    startLiveUpdate({ ...base, key: "k", edit: async () => { b++; } });
    const aBefore = a;
    await wait(120);

    assert.equal(a, aBefore, "a antiga parou");
    assert.ok(b > 0);
    assert.equal(activeLiveUpdates(), 1);
});

test("404 (mensagem apagada) para na hora", async () => {
    let calls = 0;

    startLiveUpdate({
        ...base,
        key: "k404",
        edit: async () => { calls++; throw new LiveEditError("x", { status: 404 }); }
    });

    await wait(150);

    assert.equal(calls, 1);
    assert.equal(activeLiveUpdates(), 0);
});

test("429 espera o retryAfterMs antes de tentar de novo", async () => {
    const marks = [];

    startLiveUpdate({
        ...base,
        key: "k429",
        edit: async () => {
            marks.push(Date.now());

            if (marks.length === 1) {
                throw new LiveEditError("limite", { status: 429, retryAfterMs: 1200 });
            }
        }
    });

    await wait(1600);

    assert.ok(marks.length >= 2);
    assert.ok(marks[1] - marks[0] >= 1150, "respeitou a espera");
});

test("desiste depois de 3 falhas seguidas", async () => {
    let calls = 0;

    startLiveUpdate({
        ...base,
        key: "k500",
        edit: async () => { calls++; throw new LiveEditError("boom", { status: 500 }); }
    });

    await wait(300);

    assert.equal(calls, 3);
    assert.equal(activeLiveUpdates(), 0);
});

test("ao expirar, faz uma última edição marcada como stale", async () => {
    const seen = [];

    startLiveUpdate({
        ...base,
        key: "kexp",
        maxMs: 100,
        render: ({ stale }) => ({ payload: { stale }, done: false }),
        edit: async payload => { seen.push(payload.stale); }
    });

    await wait(300);

    assert.equal(seen.at(-1), true);
    assert.ok(seen.slice(0, -1).every(stale => stale === false));
    assert.equal(activeLiveUpdates(), 0);
});

test("nunca faz duas edições ao mesmo tempo", async () => {
    let current = 0;
    let peak = 0;

    startLiveUpdate({
        ...base,
        key: "kbusy",
        intervalMs: 10,
        edit: async () => {
            current++;
            peak = Math.max(peak, current);
            await wait(80);
            current--;
        }
    });

    await wait(300);

    assert.equal(peak, 1);
});

test("respeita o teto de atualizações simultâneas", () => {
    const results = [];

    for (let i = 0; i < LIVE_CONFIG.maxActive + 2; i++) {
        results.push(startLiveUpdate({
            ...base, key: "cap" + i, intervalMs: 5000, edit: async () => {}
        }));
    }

    assert.equal(results.filter(Boolean).length, LIVE_CONFIG.maxActive);
});
