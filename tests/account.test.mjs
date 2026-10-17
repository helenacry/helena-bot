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
        redirectUri: "https://site.exemplo.test/account/",
        state: "estado123",
        challenge: "desafio456"
    }));

    assert.equal(url.origin + url.pathname, "https://vsync.lat/oauth2/authorize");

    assert.deepEqual(Object.fromEntries(url.searchParams), {
        client_id: "app-id",
        response_type: "code",
        redirect_uri: "https://site.exemplo.test/account/",
        scope: "identify guilds",
        state: "estado123",
        code_challenge: "desafio456",
        code_challenge_method: "S256"
    });
});

test("o endereço de retorno é a própria página, sempre com a barra final", () => {
    const uri = pathname => lib.redirectUri({ origin: "https://helenacry.github.io", pathname });

    assert.equal(uri("/helena-bot/account/"), "https://helenacry.github.io/helena-bot/account/");
    assert.equal(uri("/helena-bot/account/index.html"), "https://helenacry.github.io/helena-bot/account/");
    assert.equal(uri("/helena-bot/account"), "https://helenacry.github.io/helena-bot/account/");
    assert.equal(uri("/account/"), "https://helenacry.github.io/account/");
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
            location: { search: "", pathname: "/account/", origin: "https://x.test", assign: url => calls.push(url) },
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

    const redirect = lib.redirectUri({ origin: SITE_ORIGIN, pathname: "/account/index.html" });

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

// ==========================================
// FICHA DO JOGADOR: FUNÇÕES DA TELA
// ==========================================

test("shortMoney mostra o prêmio na escada, sem R$ e sem centavos", () => {
    assert.equal(lib.shortMoney(50_000), "500");
    assert.equal(lib.shortMoney(55_000), "550");
    assert.equal(lib.shortMoney(130_000), "1.300");
    assert.equal(lib.shortMoney(undefined), "0");
});

test("waitProgress: quanto da espera já passou, sempre de 0 a 1", () => {
    assert.equal(lib.waitProgress(86_400, 86_400), 0, "acabou de começar");
    assert.equal(lib.waitProgress(43_200, 86_400), 0.5);
    assert.equal(lib.waitProgress(0, 86_400), 1);
    assert.equal(lib.waitProgress(-5, 86_400), 1, "tempo negativo não passa de 1");
    assert.equal(lib.waitProgress(999_999, 86_400), 0, "nem abaixo de 0");
    assert.equal(lib.waitProgress(10, 0), 0, "sem total conhecido não divide por zero");
});

const guild = (id, daily, extra = {}) => ({
    id, name: id, icon: null, player: null, prison: null,
    daily: { available: false, remaining: 0, streak: 0, nextStreak: 1, nextReward: { total: 50_000 }, ...daily },
    ...extra
});

test("sortGuilds: liberado primeiro (o maior prêmio na frente), depois quem espera (o que libera antes), preso por último", () => {
    const list = [
        guild("espera-longa", { remaining: 80_000 }),
        guild("preso", { remaining: 10 }, { prison: { remaining: 600 } }),
        guild("liberado-pequeno", { available: true, nextReward: { total: 50_000 } }),
        guild("espera-curta", { remaining: 600 }),
        guild("liberado-grande", { available: true, nextReward: { total: 130_000 } }),
        guild("liberado-igual", { available: true, nextReward: { total: 50_000 } })
    ];

    assert.deepEqual(
        lib.sortGuilds(list).map(item => item.id),
        ["liberado-grande", "liberado-pequeno", "liberado-igual", "espera-curta", "espera-longa", "preso"],
        "empate no prêmio mantém a ordem da API"
    );

    assert.equal(list[0].id, "espera-longa", "não mexe na lista original");
    assert.deepEqual(lib.sortGuilds([]), []);
    assert.deepEqual([...lib.sortGuilds(undefined)], []);
});

test("tally: conta os liberados, soma os prêmios, ignora o preso e diz quando sai o próximo", () => {
    assert.deepEqual(
        { ...lib.tally([
            guild("a", { available: true, nextReward: { total: 150_000 } }),
            guild("b", { available: true, nextReward: { total: 50_000 } }),
            guild("c", { remaining: 600 }),
            guild("d", { available: true, nextReward: { total: 999_999 } }, { prison: { remaining: 60 } })
        ]) },
        { ready: 2, total: 200_000, nextIn: 600 }
    );

    assert.deepEqual({ ...lib.tally([guild("a", { remaining: 900 }), guild("b", { remaining: 300 })]) }, { ready: 0, total: 0, nextIn: 300 });
    assert.deepEqual({ ...lib.tally([]) }, { ready: 0, total: 0, nextIn: null });
});

test("a escada de exemplo da tela de entrada é a mesma que o bot paga (não fica desatualizada)", async () => {
    const { calculateReward, DAILY_CONFIG } = await import("../services/daily.mjs");

    assert.deepEqual([...lib.SAMPLE_LADDER], [1, 2, 3, 4, 5, 6, 7].map(day => calculateReward(day).total));
    assert.equal(lib.SAMPLE_LADDER[0], DAILY_CONFIG.reward);
});

// ==========================================
// A FICHA NA TELA (DOM simulado)
// ==========================================

// Um DOM mínimo: o suficiente para o painel montar a ficha e para o teste ler o resultado.
function fakeDocument() {
    const nodes = {};

    const make = tag => {
        const node = {
            tag, children: [], attrs: {}, listeners: {}, className: "", hidden: false, disabled: false, parent: null,
            _text: "",
            get textContent() { return this._text + this.children.map(child => child.textContent ?? child.text ?? "").join(""); },
            set textContent(value) { this._text = String(value); this.children = []; },
            get firstChild() { return this.children[0] ?? null; },
            appendChild(child) { child.parent = this; this.children.push(child); return child; },
            removeChild(child) { this.children = this.children.filter(item => item !== child); return child; },
            setAttribute(name, value) { this.attrs[name] = String(value); },
            getAttribute(name) { return this.attrs[name] ?? null; },
            addEventListener(type, listener) { this.listeners[type] = listener; },
            classList: {
                set: new Set(),
                add(name) { this.set.add(name); },
                remove(name) { this.set.delete(name); },
                contains(name) { return this.set.has(name); }
            }
        };

        return node;
    };

    nodes.account = make("div");
    nodes["acc-captcha-box"] = make("section");

    const document = {
        createElement: make,
        createTextNode: text => ({ text: String(text), textContent: String(text) }),
        getElementById: id => nodes[id] ?? null,
        head: make("head")
    };

    return { document, root: nodes.account, nodes };
}

const has = (node, name) => String(node.className).split(/\s+/).includes(name);

function findAll(node, test, found = []) {
    if (node && typeof node === "object" && node.children) {
        if (test(node)) found.push(node);

        node.children.forEach(child => findAll(child, test, found));
    }

    return found;
}

test("a ficha: gemas, resumo, linhas na ordem certa e os botões com o valor do prêmio", async () => {
    const { document, root } = fakeDocument();

    // el() de verdade (site/js/util.js) sobre o DOM simulado
    const el = (tag, props = {}, children = []) => {
        const node = document.createElement(tag);

        Object.keys(props).forEach(key => {
            if (key === "text") node.textContent = props[key];
            else if (key === "class") node.className = props[key];
            else node.setAttribute(key, props[key]);
        });

        children.forEach(child => node.appendChild(child));

        return node;
    };

    const ME = {
        user: { id: "9", username: "thz", displayName: "thz", avatarUrl: null },
        captcha: false,
        gems: { balance: 1234, available: false, remaining: 17_990, min: 1, max: 3, cooldown: 18_000 },
        daily: { cooldown: 86_400, ladder: [50_000, 55_000, 60_000, 65_000, 70_000, 75_000, 130_000] },
        guilds: [
            guild("g-espera", { remaining: 80_300, streak: 1, nextStreak: 2, nextReward: { total: 55_000 } }, { name: "Servidor de Helena", player: { wallet: 115_000, bank: 0, level: 1 } }),
            guild("g-preso", { remaining: 100, streak: 3, nextStreak: 4, nextReward: { total: 65_000 } }, { name: "Cadeia", prison: { remaining: 1800 } }),
            guild("g-bonus", { available: true, streak: 6, nextStreak: 7, nextReward: { total: 130_000, weeklyBonus: 50_000 } }, { name: "Turma", player: { wallet: 50_000, bank: 1_250_000, level: 12 } }),
            guild("g-novo", { available: true, streak: 0, nextStreak: 1, nextReward: { total: 50_000 } }, { name: "SDT" })
        ]
    };

    const page = {
        window: {
            Helena: { config: { apiUrl: "https://api.exemplo.test", clientId: "app-id" }, el },
            location: { search: "", pathname: "/account/", origin: "https://x.test", assign() {} },
            localStorage: {
                getItem: () => JSON.stringify({ token: "teste", expiresAt: Math.floor(Date.now() / 1000) + 3600 }),
                setItem() {},
                removeItem() {}
            },
            sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
            history: { replaceState() {} }
        },
        document,
        crypto: globalThis.crypto,
        btoa: globalThis.btoa,
        TextEncoder,
        URLSearchParams,
        fetch: async url => ({ status: 200, json: async () => (String(url).endsWith("/api/me") ? ME : {}) }),
        setInterval: () => 1,
        clearInterval() {},
        console
    };

    page.window.document = document;

    vm.runInNewContext(source, page);

    // o painel busca /api/me e monta a ficha
    for (let i = 0; i < 20 && !findAll(root, node => has(node, "acc-sheet")).length; i++) await new Promise(resolve => setImmediate(resolve));

    assert.ok(root.classList.contains("in"), "a primeira montagem liga a entrada animada");

    const sheet = findAll(root, node => has(node, "acc-sheet"))[0];

    assert.ok(sheet, "a ficha do jogador foi montada");
    assert.equal(findAll(sheet, node => node.tag === "h1")[0].textContent, "thz");
    assert.equal(findAll(sheet, node => has(node, "acc-purse-num"))[0].textContent, "1.234");

    // as linhas: liberadas (maior prêmio primeiro), depois quem espera, o preso por último
    const rows = findAll(root, node => has(node, "acc-row"));

    assert.deepEqual(rows.map(row => ["ready", "wait", "jail"].find(mode => has(row, mode))), ["ready", "ready", "wait", "jail"]);
    assert.deepEqual(
        rows.map(row => findAll(row, node => node.tag === "h3")[0].textContent),
        ["Turma", "SDT", "Servidor de Helena", "Cadeia"]
    );

    // o botão traz o valor do prêmio; a linha de espera não tem botão; o preso mostra o aviso
    // o formato de moeda do navegador usa um espaço que não quebra entre "R$" e o valor
    const plain = value => value.replace(/ /g, " ");

    const label = row => findAll(row, node => node.tag === "button").map(button => plain(button.textContent));

    assert.deepEqual(label(rows[0]), ["Resgatar R$ 1.300,00"]);
    assert.deepEqual(label(rows[1]), ["Resgatar R$ 500,00"]);
    assert.deepEqual(label(rows[2]), []);
    assert.deepEqual(label(rows[3]), []);
    assert.match(rows[3].textContent, /Preso, falta 30m 0s/);
    assert.match(rows[0].textContent, /inclui o bônus semanal/);
    assert.doesNotMatch(rows[1].textContent, /inclui o bônus semanal/);

    // a escada: números reais do bot, o 7º é o do bônus e o estado de cada dia bate com a sequência
    const stops = row => findAll(row, node => has(node, "stop"));

    assert.deepEqual(stops(rows[0]).map(stop => stop.children[1].textContent), ["500", "550", "600", "650", "700", "750", "1.300"]);
    assert.deepEqual(stops(rows[0]).map(stop => ["done", "next", "todo"].find(mode => has(stop, mode))), ["done", "done", "done", "done", "done", "done", "next"]);
    assert.ok(has(stops(rows[0])[6], "weekly"));
    assert.deepEqual(stops(rows[2]).map(stop => ["done", "next", "todo"].find(mode => has(stop, mode))).slice(0, 3), ["done", "next", "todo"]);

    // o resumo do topo da lista
    const tally = findAll(root, node => has(node, "acc-tally"))[0];

    assert.match(plain(tally.textContent), /2 liberados · R\$ 1\.800,00 para resgatar/);

    // texto da API entra só como texto (nada de HTML)
    assert.equal(findAll(root, node => node.tag === "img").length, 0, "sem avatar https, a inicial no lugar");
});
