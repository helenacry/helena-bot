import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

// As pétalas de sakura do herói (site/js/petals.js). A física fica em
// Helena.petalsLib, sem tocar na página, então dá para simular minutos em
// milissegundos e conferir o que antes só se via a olho.

const source = readFileSync(new URL("../site/js/petals.js", import.meta.url), "utf8");

// Sem #petals na página, o script só expõe a física e para.
const context = { window: { Helena: { $: () => null, reduced: false } } };

vm.runInNewContext(source, context);

const lib = context.window.Helena.petalsLib;

// Sorteio com semente: o resultado de cada teste é sempre o mesmo.
function seeded(seed) {
    let a = seed;

    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;

        let t = Math.imul(a ^ (a >>> 15), 1 | a);

        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const W = 1440;
const H = 800;

// Roda "seconds" segundos de animação, em quadros de fpsMs milissegundos.
function run(state, seconds, frameMs, scrollPerSecond = 0, each = null) {
    const frames = Math.round((seconds * 1000) / frameMs);

    for (let i = 0; i < frames; i++) {
        lib.step(state, frameMs, (scrollPerSecond * frameMs) / 1000);

        if (each) each(state);
    }

    return state;
}

const visible = (state, p = null) =>
    (p ? [p] : state.petals).filter(item => item.x >= 0 && item.x < state.w && item.y >= 0 && item.y < state.h);

test("quantas pétalas: uma por área da tela, com mínimo e máximo", () => {
    assert.equal(lib.countFor(390, 900), 12, "celular: mínimo");
    assert.equal(lib.countFor(1440, 800), 32);
    assert.equal(lib.countFor(3840, 2000), 44, "monitor enorme: máximo");

    for (const [w, h] of [[320, 600], [768, 1024], [1920, 1080]]) {
        const n = lib.countFor(w, h);

        assert.ok(n >= 12 && n <= 44, `${w}x${h}: ${n}`);
    }
});

test("depois de minutos, as pétalas continuam espalhadas pela tela toda (não escorrem todas para a esquerda)", () => {
    let right = 0;
    let all = 0;
    let bottomRight = 0;
    let bottom = 0;
    let shown = 0;
    let wanted = 0;

    for (let seed = 1; seed <= 60; seed++) {
        const state = run(lib.create(W, H, seeded(seed * 7919)), 120, lib.FRAME_MS);

        wanted += state.petals.length;

        for (const p of visible(state)) {
            shown++;
            if (p.x >= W / 2) right++;
            if (p.y >= H / 2) { bottom++; if (p.x >= W / 2) bottomRight++; }
        }

        all += state.petals.length;
    }

    // antes da correção: ~35% na metade direita e ~25% no canto de baixo à direita
    assert.ok(right / shown > 0.45 && right / shown < 0.55, `metade direita: ${(100 * right / shown).toFixed(0)}%`);
    assert.ok(bottomRight / bottom > 0.42 && bottomRight / bottom < 0.58, `canto de baixo à direita: ${(100 * bottomRight / bottom).toFixed(0)}%`);

    assert.ok(shown / wanted > 0.9, `quase todas as pétalas estão na tela (${(100 * shown / wanted).toFixed(0)}%)`);
    assert.equal(all / 60, lib.countFor(W, H), "nenhuma pétala some nem se multiplica");
});

test("nenhuma pétala nasce aparecendo no meio da tela: entram sempre por fora", () => {
    // com rolagem para cima e para baixo, para exercitar também o vento
    const entered = [];

    for (let seed = 1; seed <= 20; seed++) {
        const state = lib.create(W, H, seeded(seed));

        for (let i = 0; i < 7200; i++) {
            const before = state.petals.map(p => ({ x: p.x, y: p.y }));

            lib.step(state, lib.FRAME_MS, Math.sin(i / 90) * 14);

            // as que foram trocadas por uma nova (a posição de quando nasceram, não a de depois)
            entered.push(...state.respawned.map(p => ({ x: p.x, y: p.y })));

            // e as que só deram a volta pela direita: o salto de x termina fora da tela
            state.petals.forEach((p, index) => {
                if (state.respawned.includes(p)) return;

                if (p.x - before[index].x > 50) {
                    assert.ok(p.x > W, `voltou pela direita em x=${p.x}, dentro da tela`);
                }
            });
        }
    }

    assert.ok(entered.length > 50, "houve trocas para conferir");

    for (const p of entered) {
        assert.ok(p.y < 0 || p.y > H, `nasceu dentro da tela em y=${p.y}`);
    }
});

test("o movimento não depende dos quadros por segundo (60, 120 e 144 Hz andam igual)", () => {
    // tela enorme, para nenhuma pétala sair e ser trocada durante a medida
    const big = 1e7;

    const positions = frameMs => run(lib.create(big, big, seeded(42)), 10, frameMs).petals.map(p => [p.x, p.y]);

    const base = positions(1000 / 60);

    for (const fps of [30, 120, 144]) {
        const other = positions(1000 / fps);

        other.forEach(([x, y], index) => {
            assert.ok(Math.abs(x - base[index][0]) < 1.5, `${fps} Hz: x ${x.toFixed(2)} contra ${base[index][0].toFixed(2)}`);
            assert.ok(Math.abs(y - base[index][1]) < 1.5, `${fps} Hz: y ${y.toFixed(2)} contra ${base[index][1].toFixed(2)}`);
        });
    }
});

test("o vento da rolagem também não depende dos quadros por segundo", () => {
    const big = 1e7;

    const windAfter = frameMs => run(lib.create(big, big, seeded(7)), 3, frameMs, 600).wind;

    const base = windAfter(1000 / 60);

    assert.ok(base > 1 && base <= 6, `vento de uma rolagem rápida: ${base.toFixed(2)}`);

    for (const fps of [30, 144]) {
        assert.ok(Math.abs(windAfter(1000 / fps) - base) < 0.2, `${fps} Hz`);
    }

    // sem rolar, o vento morre
    assert.ok(Math.abs(run(lib.create(big, big, seeded(7)), 5, 1000 / 60).wind) < 1e-9);
});

test("rolar para baixo empurra as pétalas para cima, e para cima, para baixo", () => {
    const big = 1e7;

    const meanY = (state, scroll) => {
        const startY = state.petals.map(p => p.y);

        run(state, 2, lib.FRAME_MS, scroll);

        return state.petals.reduce((sum, p, i) => sum + (p.y - startY[i]), 0) / state.petals.length;
    };

    const calm = meanY(lib.create(big, big, seeded(3)), 0);
    const down = meanY(lib.create(big, big, seeded(3)), 600);
    const up = meanY(lib.create(big, big, seeded(3)), -600);

    assert.ok(down < calm, "rolar para baixo levanta as pétalas");
    assert.ok(up > calm, "rolar para cima as derruba");
});

test("depois de um tempo parado (aba em segundo plano), a pétala não pula de uma vez", () => {
    const big = 1e7;

    const slow = lib.step(lib.create(big, big, seeded(9)), 5000, 0).petals.map(p => [p.x, p.y]);
    const capped = lib.step(lib.create(big, big, seeded(9)), lib.MAX_STEP_MS, 0).petals.map(p => [p.x, p.y]);

    assert.equal(slow.length, capped.length);

    slow.forEach(([x, y], index) => {
        assert.equal(x, capped[index][0], "5 segundos parados contam como o máximo de um passo");
        assert.equal(y, capped[index][1]);
    });

    const still = lib.create(big, big, seeded(9));
    const before = still.petals.map(p => [p.x, p.y]);

    lib.step(still, 0, 0);

    assert.deepEqual(still.petals.map(p => [p.x, p.y]), before, "tempo zero não mexe em nada");
    assert.equal(still.respawned.length, 0);
});

test("mudar o tamanho da tela ajusta a quantidade sem recomeçar as pétalas que já caem", () => {
    const state = lib.create(1440, 800, seeded(5));

    const first = state.petals.slice(0, 12);

    assert.equal(state.petals.length, 32);

    lib.resize(state, 390, 900);   // celular (ou herói que encolheu)

    assert.equal(state.petals.length, 12);
    assert.deepEqual(state.petals, first, "as 12 que ficaram são as mesmas");

    lib.resize(state, 1920, 1080);

    assert.equal(state.petals.length, lib.countFor(1920, 1080));
    assert.deepEqual(state.petals.slice(0, 12), first);

    assert.equal(state.w, 1920);
    assert.equal(state.h, 1080);
});

test("o desenho acompanha o tamanho real do canvas e não deixa a pétala esticada", () => {
    // o tamanho interno do canvas vem do tamanho que ele tem na tela, a cada mudança
    assert.match(source, /new ResizeObserver\(resizeCanvas\)/);
    assert.match(source, /getBoundingClientRect\(\)/);

    // não existe mais a quantidade fixa de 24 pétalas
    assert.doesNotMatch(source, /i < 24/);

    // pétalas fora da tela nem são desenhadas
    assert.match(source, /fora da tela/);
});
