import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// A imagem do avatar que o embed do /userinfo usa. A VSync mostra a imagem grande de um embed
// num quadro de 300 px de altura (object-fit: cover): um avatar quadrado ficava cortado e
// achatado. O bot serve o avatar inteiro no centro de uma tela 1000x600.

const sharp = (await import("sharp")).default;

const {
    AVATAR_HOSTS, PREVIEW_PATH, PREVIEW_SIZE, avatarPreviewUrl, composeAvatar, createAvatarPreview, isAvatarSource
} = await import("../services/web/avatar-preview.mjs");

const { createWebApi } = await import("../services/web/web-api.mjs");

const SOURCE = "https://cdn.vsync.lat/att/2026/avatarabc123@256.webp";

const solid = (width, height, color) =>
    sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();

const pixel = async (png, x, y) => {
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });

    const at = (y * info.width + x) * info.channels;

    return [data[at], data[at + 1], data[at + 2]];
};

// ==========================================
// QUAIS AVATARES VALEM
// ==========================================

test("só avatar da CDN da VSync, em https e sem usuário e senha", () => {
    assert.deepEqual([...AVATAR_HOSTS], ["cdn.vsync.lat"]);

    assert.ok(isAvatarSource(SOURCE));
    assert.ok(isAvatarSource("https://cdn.vsync.lat/att/2026/avatar-1.png"));

    for (const bad of [
        "http://cdn.vsync.lat/att/a.png",
        "https://cdn.vsync.lat.evil.test/a.png",
        "https://evilcdn.vsync.lat/a.png",
        "https://exemplo.test/a.png",
        "https://user:senha@cdn.vsync.lat/a.png",
        "javascript:alert(1)",
        "file:///etc/passwd",
        "https://cdn.vsync.lat/" + "a".repeat(600),
        "", null, undefined, "não é url"
    ]) {
        assert.equal(isAvatarSource(bad), false, String(bad).slice(0, 50));
    }
});

test("o endereço da imagem leva o avatar e o endereço público da API; fora da CDN não há endereço", () => {
    assert.equal(
        avatarPreviewUrl(SOURCE, "https://helena.exemplo.test"),
        `https://helena.exemplo.test${PREVIEW_PATH}?u=${encodeURIComponent(SOURCE)}`
    );

    assert.equal(PREVIEW_PATH, "/img/avatar.jpg");
    assert.equal(avatarPreviewUrl("https://exemplo.test/a.png", "https://helena.exemplo.test"), null);
    assert.equal(avatarPreviewUrl(SOURCE, ""), null);
});

// ==========================================
// A IMAGEM
// ==========================================

test("a tela é 1000x600 em JPEG leve, com o avatar inteiro e quadrado no centro e o fundo escurecido", async () => {
    assert.deepEqual({ ...PREVIEW_SIZE }, { width: 1000, height: 600 });

    const png = await composeAvatar(await solid(256, 256, "#ff0000"));

    const meta = await sharp(png).metadata();

    assert.equal(meta.format, "jpeg");
    assert.deepEqual([meta.width, meta.height], [1000, 600]);
    assert.ok(png.length < 200_000, `tela leve: ${png.length} bytes`);

    // o centro é o avatar, na cor original
    const [r, g, b] = await pixel(png, 500, 300);

    assert.ok(r > 240 && g < 15 && b < 15, `centro ${[r, g, b]}`);

    // a faixa do lado é o fundo (mesma cor, mas desfocada e mais escura)
    const [br, bg, bb] = await pixel(png, 40, 300);

    assert.ok(br > 80 && br < 200 && bg < 30 && bb < 30, `lado ${[br, bg, bb]}`);

    // o avatar ocupa a altura toda (600 px de lado): a borda esquerda dele está em x=200
    assert.ok((await pixel(png, 210, 300))[0] > 240, "dentro do avatar");
    assert.ok((await pixel(png, 190, 300))[0] < 200, "fora do avatar");

    // os cantos do avatar são arredondados: o canto de cima vira fundo
    assert.ok((await pixel(png, 203, 3))[0] < 200, "canto arredondado");
});

test("uma foto larga ou alta não achata: o avatar é recortado no centro, nunca esticado", async () => {
    // 600x200: esquerda azul, meio vermelho, direita azul. O recorte quadrado do centro (200x200)
    // pega só o vermelho; esticar levaria azul para as pontas do avatar.
    const wide = await sharp({
        create: { width: 600, height: 200, channels: 3, background: "#0000ff" }
    }).composite([{
        input: await solid(200, 200, "#ff0000"),
        left: 200,
        top: 0
    }]).png().toBuffer();

    const png = await composeAvatar(wide);

    for (const x of [210, 300, 500, 700, 790]) {
        const [r, , b] = await pixel(png, x, 300);

        assert.ok(r > 240 && b < 15, `x=${x}: ${[r, b]}`);
    }
});

// ==========================================
// A ROTA
// ==========================================

function fakeFetch({ status = 200, bytes, hold } = {}) {
    const calls = [];

    const impl = async url => {
        calls.push(String(url));

        if (hold) await hold;

        if (status !== 200) return { ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) };

        const png = bytes ?? await solid(128, 128, "#00ff00");

        return { ok: true, status: 200, arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) };
    };

    return { impl, calls };
}

test("atende o avatar da CDN com JPEG, guarda na memória e não baixa de novo", async () => {
    const upstream = fakeFetch();

    const preview = createAvatarPreview({ fetch: upstream.impl });

    const first = await preview.render(SOURCE);

    assert.equal(first.status, 200);
    assert.equal(first.headers["Content-Type"], "image/jpeg");
    assert.match(first.headers["Cache-Control"], /^public, max-age=\d+$/);
    assert.equal(first.headers["X-Content-Type-Options"], "nosniff");
    assert.deepEqual([(await sharp(first.body).metadata()).width, (await sharp(first.body).metadata()).height], [1000, 600]);

    await preview.render(SOURCE);

    assert.deepEqual(upstream.calls, [SOURCE], "a segunda vez vem da memória");
});

test("a memória vence depois de 1 hora e o limite de itens descarta os mais antigos", async () => {
    let clock = 1_800_000_000;

    const upstream = fakeFetch();

    const preview = createAvatarPreview({ fetch: upstream.impl, now: () => clock, cacheMax: 3 });

    await preview.render(SOURCE);

    clock += 3599;
    await preview.render(SOURCE);

    assert.equal(upstream.calls.length, 1);

    clock += 2;
    await preview.render(SOURCE);

    assert.equal(upstream.calls.length, 2, "passou de 1 hora");

    for (let i = 0; i < 6; i++) {
        await preview.render(`https://cdn.vsync.lat/att/2026/avatar-${i}.png`);
    }

    assert.equal(preview.cache.size, 3, "o limite de itens descarta os mais antigos");
    assert.ok(!preview.cache.has(SOURCE), "o mais antigo saiu");
});

test("endereço de fora da CDN é recusado (400) sem baixar nada; falhas de origem viram 502 e 415", async () => {
    const upstream = fakeFetch();

    const preview = createAvatarPreview({ fetch: upstream.impl });

    for (const source of ["https://exemplo.test/a.png", "http://cdn.vsync.lat/a.png", "", "../etc/passwd"]) {
        const refused = await preview.render(source);

        assert.equal(refused.status, 400, source);
        assert.equal(JSON.parse(refused.body).error, "invalid_source");
    }

    assert.deepEqual(upstream.calls, []);

    const warn = console.warn;

    console.warn = () => {};

    try {
        const down = await createAvatarPreview({ fetch: fakeFetch({ status: 404 }).impl }).render(SOURCE);

        assert.equal(down.status, 502);
        assert.equal(down.headers["Cache-Control"], "no-store");

        const huge = await createAvatarPreview({ fetch: fakeFetch({ bytes: Buffer.alloc(9_000_000) }).impl }).render(SOURCE);

        assert.equal(huge.status, 415);

        // um arquivo que não é imagem
        const text = await createAvatarPreview({ fetch: fakeFetch({ bytes: Buffer.from("não sou uma imagem") }).impl }).render(SOURCE);

        assert.equal(text.status, 502);
    } finally {
        console.warn = warn;
    }
});

test("o mesmo avatar pedido junto é montado uma vez; passando de 4 montagens ao mesmo tempo, avisa que está ocupado", async () => {
    let release;

    const hold = new Promise(resolve => { release = resolve; });

    const upstream = fakeFetch({ hold });

    const preview = createAvatarPreview({ fetch: upstream.impl });

    const same = [preview.render(SOURCE), preview.render(SOURCE), preview.render(SOURCE)];

    const others = [1, 2, 3].map(i => preview.render(`https://cdn.vsync.lat/att/2026/avatar-o${i}.png`));

    // a quinta fonte diferente não cabe
    const busy = await preview.render("https://cdn.vsync.lat/att/2026/avatar-o4.png");

    assert.equal(busy.status, 503);
    assert.equal(busy.headers["Retry-After"], "2");

    assert.equal(upstream.calls.filter(call => call === SOURCE).length, 1, "o mesmo avatar baixa uma vez");

    release();

    const done = await Promise.all([...same, ...others]);

    assert.ok(done.every(result => result.status === 200));

    // liberou: agora cabe
    assert.equal((await preview.render("https://cdn.vsync.lat/att/2026/avatar-o4.png")).status, 200);
});

// ==========================================
// PELA API DO BOT
// ==========================================

const CONFIG = Object.freeze({
    enabled: true, port: 0, host: "127.0.0.1",
    origins: ["https://site.exemplo.test"], redirects: ["https://site.exemplo.test/account/"],
    clientId: "app-id", clientSecret: null, turnstileSecret: null, trustProxy: false
});

async function withServer(fn) {
    const upstream = fakeFetch();

    const api = createWebApi(CONFIG, { fetch: upstream.impl });

    const server = http.createServer((req, res) => { api.handle(req, res); });

    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

    try {
        return await fn(`http://127.0.0.1:${server.address().port}`, upstream);
    } finally {
        server.closeAllConnections?.();
        await new Promise(resolve => server.close(resolve));
    }
}

test("GET /img/avatar.jpg?u=... devolve a imagem pela API, sem exigir origem; HEAD vem sem corpo", async () => {
    await withServer(async (base, upstream) => {
        const url = `${base}${PREVIEW_PATH}?u=${encodeURIComponent(SOURCE)}`;

        const response = await fetch(url);

        assert.equal(response.status, 200);
        assert.equal(response.headers.get("content-type"), "image/jpeg");

        const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();

        assert.deepEqual([meta.width, meta.height], [1000, 600]);
        assert.deepEqual(upstream.calls, [SOURCE]);

        const head = await fetch(url, { method: "HEAD" });

        assert.equal(head.status, 200);
        assert.equal(head.headers.get("content-type"), "image/jpeg");
        assert.equal((await head.arrayBuffer()).byteLength, 0);

        // sem o parâmetro, ou com um avatar de fora: 400 em JSON
        const none = await fetch(`${base}${PREVIEW_PATH}`);

        assert.equal(none.status, 400);
        assert.deepEqual(await none.json(), { error: "invalid_source" });

        assert.equal((await fetch(`${base}${PREVIEW_PATH}?u=${encodeURIComponent("https://exemplo.test/a.png")}`)).status, 400);
    });
});

test("o resto da API não muda: rota desconhecida segue 404 e o POST na rota da imagem também", async () => {
    await withServer(async base => {
        assert.equal((await fetch(`${base}/api/nao-existe`)).status, 404);
        assert.equal((await fetch(`${base}/img/outra.jpg`)).status, 404);
        assert.equal((await fetch(`${base}${PREVIEW_PATH}`, { method: "POST" })).status, 404);
        assert.equal((await (await fetch(`${base}/api/health`)).json()).ok, true);
    });
});
