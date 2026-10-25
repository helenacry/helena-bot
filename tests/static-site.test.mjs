import test from "node:test";
import assert from "node:assert/strict";

import http from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import "./helpers.mjs";

const { createStaticSite } = await import("../services/web/static-site.mjs");
const { startWebApi } = await import("../services/web/web-api.mjs");

// Um site de mentira, do tamanho certo para testar: a home, a wiki, uma página sem filha, o 404, um arquivo
// com código no nome, uma fonte, o wasm da busca e um segredo FORA da pasta.
function fakeSite({ with404 = true } = {}) {
    const outside = mkdtempSync(path.join(tmpdir(), "helena-site-"));

    const root = path.join(outside, "dist");

    mkdirSync(path.join(root, "wiki", "start"), { recursive: true });
    mkdirSync(path.join(root, "assets"), { recursive: true });
    mkdirSync(path.join(root, "pagefind"), { recursive: true });
    mkdirSync(path.join(root, ".git"), { recursive: true });

    writeFileSync(path.join(root, "index.html"), "<h1>Helena</h1>");
    writeFileSync(path.join(root, "wiki", "index.html"), "<h1>Wiki</h1>");
    writeFileSync(path.join(root, "wiki", "start", "index.html"), "<h1>Começo</h1>");
    writeFileSync(path.join(root, "assets", "app.abc123.js"), "export const a = 1;");
    writeFileSync(path.join(root, "assets", "font.woff2"), "fonte");
    writeFileSync(path.join(root, "pagefind", "pagefind_web_bg.wasm"), "wasm");
    writeFileSync(path.join(root, "pagefind", "index.pf_meta"), "meta");
    writeFileSync(path.join(root, "robots.txt"), "User-agent: *");
    writeFileSync(path.join(root, ".git", "config"), "segredo do git");
    writeFileSync(path.join(root, ".env"), "TOKEN=nao");
    writeFileSync(path.join(outside, "segredo.txt"), "fora da pasta");

    if (with404) writeFileSync(path.join(root, "404.html"), "<h1>Não achei</h1>");

    return root;
}

// um servidor só com o servidor de arquivos, numa porta livre
async function listen(root) {
    const site = await createStaticSite({ root });

    const server = http.createServer(async (req, res) => {
        if (!(await site.serve(req, res))) {
            res.writeHead(418);
            res.end("api");
        }
    });

    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

    return {
        site,
        base: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); })
    };
}

// pede um endereço sem normalizar o caminho (o fetch arrumaria "..")
function raw(base, requestPath, { method = "GET", headers = {} } = {}) {
    const url = new URL(base);

    return new Promise((resolve, reject) => {
        const req = http.request({ host: url.hostname, port: url.port, path: requestPath, method, headers }, res => {
            const chunks = [];

            res.on("data", chunk => chunks.push(chunk));
            res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
        });

        req.on("error", reject);
        req.end();
    });
}

// ==========================================
// O QUE ELE ENTREGA
// ==========================================

test("a raiz e as pastas entregam o index.html, com o tipo e os cabeçalhos certos", async () => {
    const { base, close } = await listen(fakeSite());

    try {
        const home = await raw(base, "/");

        assert.equal(home.status, 200);
        assert.equal(home.body, "<h1>Helena</h1>");
        assert.equal(home.headers["content-type"], "text/html; charset=utf-8");
        assert.equal(home.headers["cache-control"], "no-cache", "o HTML sempre confere de novo");
        assert.equal(home.headers["x-content-type-options"], "nosniff");
        assert.equal(home.headers["x-frame-options"], "DENY");
        assert.equal(home.headers["referrer-policy"], "strict-origin-when-cross-origin");
        assert.equal(Number(home.headers["content-length"]), Buffer.byteLength("<h1>Helena</h1>"));

        assert.equal((await raw(base, "/wiki/")).body, "<h1>Wiki</h1>");
        assert.equal((await raw(base, "/wiki/start/")).body, "<h1>Começo</h1>");
        assert.equal((await raw(base, "/wiki/start/?q=1")).status, 200, "a busca na URL não atrapalha");

    } finally {
        await close();
    }
});

test("os arquivos têm o tipo certo (incluindo a fonte e a busca da wiki) e os com código no nome ficam em cache para sempre", async () => {
    const { base, close } = await listen(fakeSite());

    try {
        const js = await raw(base, "/assets/app.abc123.js");

        assert.equal(js.headers["content-type"], "text/javascript; charset=utf-8");
        assert.equal(js.headers["cache-control"], "public, max-age=31536000, immutable");

        assert.equal((await raw(base, "/assets/font.woff2")).headers["content-type"], "font/woff2");
        assert.equal((await raw(base, "/pagefind/pagefind_web_bg.wasm")).headers["content-type"], "application/wasm");
        assert.equal((await raw(base, "/pagefind/index.pf_meta")).headers["content-type"], "application/octet-stream");

        const robots = await raw(base, "/robots.txt");

        assert.equal(robots.headers["content-type"], "text/plain; charset=utf-8");
        assert.equal(robots.headers["cache-control"], "public, max-age=3600");

    } finally {
        await close();
    }
});

test("página sem a barra do fim vai para a com barra; HEAD manda só os cabeçalhos; ETag devolve 304", async () => {
    const { base, close } = await listen(fakeSite());

    try {
        const redirect = await raw(base, "/wiki/start?x=1");

        assert.equal(redirect.status, 301);
        assert.equal(redirect.headers.location, "/wiki/start/?x=1");

        const head = await raw(base, "/wiki/", { method: "HEAD" });

        assert.equal(head.status, 200);
        assert.equal(head.body, "");
        assert.ok(Number(head.headers["content-length"]) > 0);

        const first = await raw(base, "/assets/app.abc123.js");

        const again = await raw(base, "/assets/app.abc123.js", { headers: { "If-None-Match": first.headers.etag } });

        assert.equal(again.status, 304);
        assert.equal(again.body, "");

    } finally {
        await close();
    }
});

test("o que não existe responde 404 com a página 404.html (ou um texto, se o site não tem a página)", async () => {
    const withPage = await listen(fakeSite());

    try {
        const missing = await raw(withPage.base, "/nao-existe/");

        assert.equal(missing.status, 404);
        assert.equal(missing.body, "<h1>Não achei</h1>");
        assert.equal(missing.headers["content-type"], "text/html; charset=utf-8");

        assert.equal((await raw(withPage.base, "/assets/nada.js")).status, 404);

    } finally {
        await withPage.close();
    }

    const plain = await listen(fakeSite({ with404: false }));

    try {
        const missing = await raw(plain.base, "/nao-existe/");

        assert.equal(missing.status, 404);
        assert.equal(missing.body, "Página não encontrada.");

    } finally {
        await plain.close();
    }
});

// ==========================================
// O QUE ELE NUNCA ENTREGA
// ==========================================

test("nunca sai da pasta: .., barra invertida, byte nulo e escapes são recusados, e o segredo de fora não vaza", async () => {
    const { base, close } = await listen(fakeSite());

    try {
        for (const bad of [
            "/../segredo.txt",
            "/wiki/../../segredo.txt",
            "/%2e%2e/segredo.txt",
            "/%2E%2E%2Fsegredo.txt",
            "/..%2fsegredo.txt",
            "/assets/..%5c..%5csegredo.txt",
            "/wiki/%00",
            "/%c0%ae%c0%ae/segredo.txt",
            "/%zz"
        ]) {
            const response = await raw(base, bad);

            assert.ok([400, 404].includes(response.status), `${bad} -> ${response.status}`);
            assert.doesNotMatch(response.body, /fora da pasta/, bad);
        }

    } finally {
        await close();
    }
});

test("arquivos escondidos (.git, .env) não são entregues, nem listados; pasta sem index não lista nada", async () => {
    const { base, close } = await listen(fakeSite());

    try {
        for (const hidden of ["/.env", "/.git/config", "/.git/", "/wiki/.env"]) {
            const response = await raw(base, hidden);

            assert.ok([400, 404].includes(response.status), `${hidden} -> ${response.status}`);
            assert.doesNotMatch(response.body, /TOKEN|segredo/);
        }

        // a pasta assets não tem index.html: 404, não a lista de arquivos
        const listing = await raw(base, "/assets/");

        assert.equal(listing.status, 404);
        assert.doesNotMatch(listing.body, /app\.abc123/);

    } finally {
        await close();
    }
});

test("só GET e HEAD: outros métodos e tudo em /api ficam com a API", async () => {
    const { base, close } = await listen(fakeSite());

    try {
        assert.equal((await raw(base, "/", { method: "POST" })).status, 418);
        assert.equal((await raw(base, "/", { method: "OPTIONS" })).status, 418);
        assert.equal((await raw(base, "/wiki/", { method: "DELETE" })).status, 418);

        assert.equal((await raw(base, "/api/health")).status, 418, "a API é com o outro roteador");
        assert.equal((await raw(base, "/api")).status, 418);

    } finally {
        await close();
    }
});

test("sem a pasta do site, o servidor não faz nada (só a API), como antes", async () => {
    const site = await createStaticSite({ root: path.join(tmpdir(), "helena-nao-existe-" + Date.now()) });

    assert.equal(site.enabled, false);
    assert.equal(await site.serve({ method: "GET", url: "/" }, {}), false);

    assert.equal((await createStaticSite({})).enabled, false);
    assert.equal((await createStaticSite({ root: "" })).enabled, false);
});

// ==========================================
// NO SERVIDOR DO BOT
// ==========================================

test("no servidor do bot, o site fica na raiz e a API em /api, no mesmo endereço", async () => {
    const root = fakeSite();

    const env = {
        HELENA_WEB_PORT: "0",
        HELENA_WEB_HOST: "127.0.0.1",
        HELENA_WEB_ORIGINS: "https://helena.exemplo.test",
        HELENA_OAUTH_REDIRECTS: "https://helena.exemplo.test/account/",
        HELENA_OAUTH_CLIENT_ID: "1559308576537714710"
    };

    const log = console.log;

    console.log = () => {};

    const running = await startWebApi(env, { siteDir: root });

    console.log = log;

    assert.ok(running, "a API subiu");

    try {
        const base = `http://127.0.0.1:${running.port}`;

        assert.equal((await raw(base, "/")).body, "<h1>Helena</h1>");
        assert.equal((await raw(base, "/wiki/")).body, "<h1>Wiki</h1>");

        const health = await raw(base, "/api/health");

        assert.equal(health.status, 200);
        assert.deepEqual(JSON.parse(health.body), { ok: true });
        assert.match(health.headers["content-type"], /application\/json/);

        // a API segue recusando o que não conhece, em JSON
        const unknown = await raw(base, "/api/nada");

        assert.equal(unknown.status, 404);
        assert.deepEqual(JSON.parse(unknown.body), { error: "not_found" });

        // e o POST sem rota continua sendo da API
        assert.equal((await raw(base, "/", { method: "POST" })).status, 404);

    } finally {
        await running.close();
    }
});
