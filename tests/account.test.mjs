import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";

// O painel (site/js/account.js) é um script de navegador. Aqui ele roda num
// contexto sem página: sem #account a tela não monta, e sobram só as funções
// puras, expostas em Helena.accountLib.

const SITE = new URL("../site/", import.meta.url);

const source = readFileSync(new URL("js/account.js", SITE), "utf8");

const context = {
    window: {},
    crypto: globalThis.crypto,
    btoa: globalThis.btoa,
    TextEncoder,
    URLSearchParams,
    console
};

context.window.Helena = { config: { apiUrl: "https://api.exemplo.test", clientId: "app-id" } };

vm.runInNewContext(source, context);

const lib = context.window.Helena.accountLib;

const base64url = buffer =>
    Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// ==========================================
// LOGIN (PKCE)
// ==========================================

test("PKCE: verifier de 43 caracteres e desafio S256 certo, diferente a cada login", async () => {
    const first = await lib.pkce();
    const second = await lib.pkce();

    assert.match(first.verifier, /^[A-Za-z0-9_-]{43}$/);

    const expected = base64url(createHash("sha256").update(first.verifier).digest());

    assert.equal(first.challenge, expected);
    assert.notEqual(first.verifier, second.verifier);
    assert.match(lib.randomState(), /^[A-Za-z0-9_-]{22}$/);
    assert.notEqual(lib.randomState(), lib.randomState());

    // o que o cliente gera é o que a API aceita como verifier
    assert.match(first.verifier, /^[A-Za-z0-9\-._~]{43,128}$/);
});

test("o endereço de autorização leva exatamente o que a VSync documenta", () => {
    const url = new URL(lib.buildAuthorizeUrl({
        clientId: "app-id",
        redirectUri: "https://site.exemplo.test/conta/",
        state: "estado123",
        challenge: "desafio456"
    }));

    assert.equal(url.origin + url.pathname, "https://vsync.lat/oauth2/authorize");

    assert.deepEqual(Object.fromEntries(url.searchParams), {
        client_id: "app-id",
        response_type: "code",
        redirect_uri: "https://site.exemplo.test/conta/",
        scope: "identify guilds",
        state: "estado123",
        code_challenge: "desafio456",
        code_challenge_method: "S256"
    });
});

test("o endereço de retorno é a própria página, sempre com a barra final", () => {
    const uri = pathname => lib.redirectUri({ origin: "https://helenacry.github.io", pathname });

    assert.equal(uri("/helena-bot/conta/"), "https://helenacry.github.io/helena-bot/conta/");
    assert.equal(uri("/helena-bot/conta/index.html"), "https://helenacry.github.io/helena-bot/conta/");
    assert.equal(uri("/helena-bot/conta"), "https://helenacry.github.io/helena-bot/conta/");
    assert.equal(uri("/conta/"), "https://helenacry.github.io/conta/");
});

test("lê o que a VSync devolve na volta do login", () => {
    assert.deepEqual({ ...lib.parseCallback("?code=abc&state=xyz") }, { code: "abc", state: "xyz", error: "" });
    assert.deepEqual({ ...lib.parseCallback("?error=access_denied&state=xyz") }, { code: "", state: "xyz", error: "access_denied" });
    assert.deepEqual({ ...lib.parseCallback("") }, { code: "", state: "", error: "" });
});

// ==========================================
// FORMATOS
// ==========================================

test("dinheiro em reais e duração em horas, minutos e segundos", () => {
    assert.match(lib.formatMoney(123456), /^R\$\s1\.234,56$/);
    assert.match(lib.formatMoney(0), /^R\$\s0,00$/);
    assert.match(lib.formatMoney("lixo"), /^R\$\s0,00$/);

    assert.equal(lib.formatDuration(3725), "1h 2m 5s");
    assert.equal(lib.formatDuration(125), "2m 5s");
    assert.equal(lib.formatDuration(5), "5s");
    assert.equal(lib.formatDuration(3600), "1h 0m 0s");
    assert.equal(lib.formatDuration(0), "0s");
    assert.equal(lib.formatDuration(-10), "0s");
    assert.equal(lib.formatDuration(4.2), "5s", "arredonda para cima, como o /daily");
});

test("os 7 dias da sequência: coletados, o de hoje e os que faltam", () => {
    const states = pips => pips.map(p => p.state[0]).join("");

    assert.equal(states(lib.weekPips(1)), "ntttttt");
    assert.equal(states(lib.weekPips(4)), "dddnttt");
    assert.equal(states(lib.weekPips(7)), "ddddddn");
    assert.equal(states(lib.weekPips(8)), "ntttttt", "recomeça o ciclo");
    assert.equal(states(lib.weekPips(0)), "ntttttt");

    // (spread: o array nasce no contexto isolado, com outro protótipo de Array)
    assert.deepEqual([...lib.weekPips(3).filter(p => p.weekly).map(p => p.day)], [7], "só o 7º é o do bônus semanal");
});

test("só imagens https entram na página", () => {
    assert.equal(lib.safeImage("https://cdn.exemplo.test/a.png"), "https://cdn.exemplo.test/a.png");

    for (const bad of ["javascript:alert(1)", "data:image/png;base64,AAAA", "http://x.test/a.png", "//x.test/a.png", "", null, undefined, 42, {}]) {
        assert.equal(lib.safeImage(bad), "", String(bad));
    }
});

// ==========================================
// TEXTOS DAS RECUSAS
// ==========================================

test("as recusas trazem o tempo que falta quando há", () => {
    assert.equal(lib.errorText("cooldown", { remaining: 3725 }), "Ainda não liberou. Falta 1h 2m 5s.");
    assert.equal(lib.errorText("cooldown"), "Ainda não liberou.");
    assert.match(lib.errorText("prison", { remaining: 125 }), /falta 2m 5s/);
    assert.match(lib.errorText("too_many_requests", { retryAfter: 90 }), /1m 30s/);
    assert.match(lib.errorText("coisa_que_nao_existe"), /Algo deu errado/);
});

test("toda recusa que a API pode mostrar à pessoa tem texto próprio na tela", () => {
    const api = readFileSync(new URL("../services/web-api.mjs", import.meta.url), "utf8");

    const emitted = [...new Set([...api.matchAll(/new HttpError\(\d+,\s*"([a-z_]+)"/g)].map(m => m[1]))];

    // erros de uso incorreto da API: o site nunca os provoca
    const internal = new Set([
        "invalid_json", "invalid_code", "invalid_verifier",
        "body_too_large", "origin_not_allowed", "not_found", "invalid_request"
    ]);

    assert.ok(emitted.length > 10, "achou os códigos da API");

    const fallback = lib.errorText("___");

    for (const code of emitted.filter(code => !internal.has(code))) {
        assert.notEqual(lib.errorText(code, { remaining: 60 }), fallback, `"${code}" cai no texto genérico`);
    }
});

// ==========================================
// SEGURANÇA DA PÁGINA
// ==========================================

test("a tela nunca monta HTML com texto da API (só textContent)", () => {
    const screen = source.slice(source.indexOf("// TELA"));

    assert.doesNotMatch(screen, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test("sem apiUrl a página mostra o aviso em vez de tentar o login", () => {
    const calls = [];

    const nodes = {};

    const fakeNode = () => ({
        hidden: false,
        children: [],
        firstChild: null,
        appendChild(child) { this.children.push(child); this.firstChild = this.children[0]; return child; },
        removeChild(child) { this.children = this.children.filter(c => c !== child); this.firstChild = this.children[0] ?? null; }
    });

    nodes.account = fakeNode();
    nodes["acc-captcha-box"] = fakeNode();

    const el = (tag, props = {}, children = []) => {
        const node = fakeNode();

        node.tag = tag;
        node.text = props.text ?? "";
        children.forEach(child => node.appendChild(child));

        return node;
    };

    const page = {
        window: {
            Helena: { config: { apiUrl: "", clientId: "app-id" }, el },
            location: { search: "", pathname: "/conta/", origin: "https://x.test", assign: url => calls.push(url) },
            localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
            sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }
        },
        document: {
            getElementById: id => nodes[id] ?? null,
            createTextNode: text => ({ text }),
            head: fakeNode()
        },
        crypto: globalThis.crypto,
        btoa: globalThis.btoa,
        TextEncoder,
        URLSearchParams,
        fetch: () => { calls.push("fetch"); throw new Error("não devia chamar a API"); },
        setInterval: () => 0,
        clearInterval() {},
        console
    };

    page.window.document = page.document;

    vm.runInNewContext(source, page);

    assert.deepEqual(calls, [], "sem API não há chamada nem redirecionamento");

    const box = nodes.account.children[0];

    assert.equal(box.children[0].text, "Painel indisponível");
    assert.equal(nodes["acc-captcha-box"].hidden, true);
});

// ==========================================
// CLIENTE x API: O LOGIN COMPLETO
// ==========================================

test("o que o painel gera é aceito pela API: login com PKCE conferido de verdade", async () => {
    const http = await import("node:http");
    const { createWebApi } = await import("../services/web-api.mjs");
    const { guildIds } = await import("../services/guild-registry.mjs");

    const SITE_ORIGIN = "https://site.exemplo.test";

    guildIds.add("g-e2e");

    // o painel monta o pedido de autorização e guarda o desafio
    const { verifier, challenge } = await lib.pkce();

    const redirect = lib.redirectUri({ origin: SITE_ORIGIN, pathname: "/conta/index.html" });

    const authorize = new URL(lib.buildAuthorizeUrl({ clientId: "app-id", redirectUri: redirect, state: "s", challenge }));

    // VSync simulada: só troca o código se o verifier combinar com o desafio S256
    const upstream = async (url, init = {}) => {
        const u = String(url);
        const params = new URLSearchParams(String(init.body ?? ""));

        const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });

        if (u.endsWith("/oauth2/token")) {
            const derived = base64url(createHash("sha256").update(params.get("code_verifier") ?? "").digest());

            const good =
                derived === authorize.searchParams.get("code_challenge") &&
                params.get("redirect_uri") === authorize.searchParams.get("redirect_uri") &&
                params.get("client_id") === authorize.searchParams.get("client_id");

            return good ? reply(200, { access_token: "vsat_e2e", token_type: "Bearer" }) : reply(401, { error: "invalid_grant" });
        }

        if (u.endsWith("/oauth2/userinfo")) return reply(200, { id: "555", username: "e2e", displayName: "E2E" });
        if (u.endsWith("/oauth2/guilds")) return reply(200, [{ id: "g-e2e", name: "Servidor E2E" }]);

        return reply(200, {});
    };

    const api = createWebApi({
        enabled: true, port: 0, host: "127.0.0.1",
        origins: [SITE_ORIGIN], redirects: [redirect],
        clientId: "app-id", clientSecret: null, turnstileSecret: null, trustProxy: false
    }, { fetch: upstream, now: () => 1_800_000_000 });

    const server = http.createServer((req, res) => api.handle(req, res));

    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

    try {
        const login = body => fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
            method: "POST",
            headers: { Origin: SITE_ORIGIN, "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        // exatamente o corpo que o painel envia (finishLogin)
        const ok = await login({ code: "codigo", codeVerifier: verifier, redirectUri: redirect });

        assert.equal(ok.status, 200);
        assert.equal((await ok.json()).user.id, "555");

        // outro verifier (por exemplo, de um login anterior) não passa
        const other = await lib.pkce();
        const wrong = await login({ code: "codigo", codeVerifier: other.verifier, redirectUri: redirect });

        assert.equal(wrong.status, 401);

    } finally {
        server.close();
        server.closeAllConnections();
    }
});
