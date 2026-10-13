import { db, getPlayer, set, get } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const { createWebApi, loadWebConfig, startWebApi, stopWebApi } = await import("../services/web-api.mjs");
const { guildIds } = await import("../services/guild-registry.mjs");
const { imprison } = await import("../services/prison.mjs");
const { WEB_CONFIG } = await import("../config/web.mjs");
const { GEM_BONUS } = await import("../config/gems.mjs");

const SITE = "https://site.exemplo.test";
const REDIRECT = "https://site.exemplo.test/conta/";
const VERIFIER = "v".repeat(43);

const USER = "444444444444444444";

const G1 = "g-web-1";
const G2 = "g-web-2";
const G3 = "g-web-3"; // a pessoa está lá, a Helena não

const T0 = 1_800_000_000;

const BASE_CONFIG = Object.freeze({
    enabled: true,
    port: 0,
    host: "127.0.0.1",
    origins: [SITE],
    redirects: [REDIRECT],
    clientId: "app-id",
    clientSecret: null,
    turnstileSecret: null,
    trustProxy: false
});

// ==========================================
// FERRAMENTAS
// ==========================================

guildIds.add(G1);
guildIds.add(G2);

// VSync e Cloudflare simuladas. "calls" guarda tudo o que a API pediu.
function makeUpstream() {
    const calls = [];

    const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });

    const fetch = async (url, init = {}) => {
        const u = String(url);
        const params = init.body instanceof URLSearchParams ? init.body : new URLSearchParams(String(init.body ?? ""));

        calls.push({ url: u, method: init.method ?? "GET", params, headers: init.headers ?? {} });

        if (u.endsWith("/oauth2/token")) {
            const good =
                params.get("code") === "good-code" &&
                params.get("code_verifier") === VERIFIER &&
                params.get("client_id") === "app-id" &&
                params.get("redirect_uri") === REDIRECT;

            return good
                ? reply(200, { access_token: "vsat_abc", refresh_token: "vsrt_abc", token_type: "Bearer", expires_in: 604800, scope: "identify guilds" })
                : reply(401, { error: "invalid_grant" });
        }

        if (u.endsWith("/oauth2/userinfo")) {
            return init.headers?.Authorization === "Bearer vsat_abc"
                ? reply(200, { id: USER, username: "jogadora", displayName: "Jogadora", avatarUrl: "https://cdn.exemplo.test/a.png" })
                : reply(401, { error: "invalid_token" });
        }

        if (u.endsWith("/oauth2/guilds")) {
            return reply(200, [
                { id: G1, name: "Servidor Um", iconUrl: "https://cdn.exemplo.test/1.png" },
                { id: G3, name: "Sem Helena" },
                { id: G2, name: "Servidor Dois" }
            ]);
        }

        if (u.endsWith("/oauth2/token/revoke")) {
            return reply(200, {});
        }

        if (u.includes("challenges.cloudflare.com")) {
            return reply(200, { success: params.get("response") === "ok-token" });
        }

        return reply(404, {});
    };

    return { fetch, calls };
}

// Sobe a API num servidor próprio, numa porta livre, com relógio controlável.
async function startApi(overrides = {}, { random = () => 0.5 } = {}) {
    const upstream = makeUpstream();

    const state = { now: T0 };

    const api = createWebApi(
        { ...BASE_CONFIG, ...overrides },
        { fetch: upstream.fetch, now: () => state.now, random }
    );

    const server = http.createServer((req, res) => api.handle(req, res));

    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

    const base = `http://127.0.0.1:${server.address().port}`;

    return {
        base,
        upstream,
        state,
        api,
        close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); })
    };
}

async function call(ctx, method, path, { body, token, origin = SITE, headers = {}, raw } = {}) {
    const response = await fetch(ctx.base + path, {
        method,
        headers: {
            ...(origin ? { Origin: origin } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body !== undefined || raw !== undefined ? { "Content-Type": "application/json" } : {}),
            ...headers
        },
        body: raw ?? (body === undefined ? undefined : JSON.stringify(body))
    });

    return { status: response.status, headers: response.headers, json: await response.json().catch(() => null) };
}

const login = ctx => call(ctx, "POST", "/api/auth/login", {
    body: { code: "good-code", codeVerifier: VERIFIER, redirectUri: REDIRECT }
});

async function loggedIn(ctx) {
    const result = await login(ctx);

    assert.equal(result.status, 200);

    return result.json.token;
}

function reset() {
    for (const table of [
        "web_sessions", "web_claim_log", "players", "daily_streaks", "global_users",
        "transactions", "mission_progress", "prison_players", "crime_players"
    ]) {
        db.exec(`DELETE FROM ${table}`);
    }
}

async function withApi(overrides, fn, options) {
    reset();

    const ctx = await startApi(overrides, options);

    try {
        await fn(ctx);
    } finally {
        await ctx.close();
    }
}

const logRows = () => db.prepare("SELECT kind, ok, detail, guild_id FROM web_claim_log ORDER BY id").all().map(r => ({ ...r }));

// ==========================================
// CONFIGURAÇÃO
// ==========================================

test("a API vem desligada: sem porta, com porta inválida ou faltando o resto", () => {
    assert.deepEqual({ ...loadWebConfig({}) }, { enabled: false, reason: "HELENA_WEB_PORT não definida" });
    assert.equal(loadWebConfig({ HELENA_WEB_PORT: "abc" }).enabled, false);
    assert.equal(loadWebConfig({ HELENA_WEB_PORT: "70000" }).enabled, false);

    const partial = loadWebConfig({ HELENA_WEB_PORT: "3000", HELENA_WEB_ORIGINS: SITE });

    assert.equal(partial.enabled, false);
    assert.match(partial.reason, /HELENA_OAUTH_REDIRECTS/);
    assert.match(partial.reason, /HELENA_OAUTH_CLIENT_ID/);
});

test("configuração completa: tira a barra final das origens e só confia em proxy se mandarem", () => {
    const base = {
        HELENA_WEB_PORT: "3000",
        HELENA_WEB_ORIGINS: `${SITE}/, https://outro.exemplo.test`,
        HELENA_OAUTH_REDIRECTS: REDIRECT,
        HELENA_OAUTH_CLIENT_ID: " app-id "
    };

    const config = loadWebConfig(base);

    assert.equal(config.enabled, true);
    assert.deepEqual(config.origins, [SITE, "https://outro.exemplo.test"]);
    assert.equal(config.clientId, "app-id");
    assert.equal(config.host, "127.0.0.1", "só escuta no próprio computador por padrão");
    assert.equal(config.trustProxy, false);
    assert.equal(config.turnstileSecret, null);
    assert.equal(config.clientSecret, null);

    const full = loadWebConfig({
        ...base,
        HELENA_WEB_TRUST_PROXY: "1",
        HELENA_TURNSTILE_SECRET: "segredo",
        HELENA_OAUTH_CLIENT_SECRET: "outro"
    });

    assert.equal(full.trustProxy, true);
    assert.equal(full.turnstileSecret, "segredo");
    assert.equal(full.clientSecret, "outro");
});

// ==========================================
// CORS E CABEÇALHOS
// ==========================================

test("só o site cadastrado fala com a API: CORS exato, sem curinga, sem cookie", async () => {
    await withApi({}, async ctx => {
        const ok = await call(ctx, "GET", "/api/health");

        assert.equal(ok.status, 200);
        assert.equal(ok.headers.get("access-control-allow-origin"), SITE);
        assert.equal(ok.headers.get("vary"), "Origin");
        assert.equal(ok.headers.get("cache-control"), "no-store");
        assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
        assert.equal(ok.headers.get("set-cookie"), null, "a sessão não usa cookie");

        const pre = await fetch(ctx.base + "/api/me", {
            method: "OPTIONS",
            headers: { Origin: SITE, "Access-Control-Request-Method": "GET" }
        });

        assert.equal(pre.status, 204);
        assert.match(pre.headers.get("access-control-allow-headers"), /authorization/);
        assert.equal(pre.headers.get("access-control-allow-origin"), SITE);

        const foreign = await call(ctx, "GET", "/api/health", { origin: "https://golpista.exemplo.test" });

        assert.equal(foreign.status, 403);
        assert.equal(foreign.headers.get("access-control-allow-origin"), null);

        const foreignPre = await fetch(ctx.base + "/api/me", {
            method: "OPTIONS",
            headers: { Origin: "https://golpista.exemplo.test", "Access-Control-Request-Method": "GET" }
        });

        assert.equal(foreignPre.status, 403);
        assert.notEqual(foreignPre.headers.get("access-control-allow-origin"), "*");
    });
});

test("rota que não existe, método errado, corpo grande e JSON ruim", async () => {
    await withApi({}, async ctx => {
        assert.equal((await call(ctx, "GET", "/api/nada")).status, 404);
        assert.equal((await call(ctx, "GET", "/api/auth/login")).status, 404, "login só aceita POST");

        const big = await call(ctx, "POST", "/api/auth/login", { raw: JSON.stringify({ code: "x".repeat(WEB_CONFIG.maxBodyBytes + 10) }) });

        assert.equal(big.status, 413, "responde 413 em vez de só derrubar a conexão");
        assert.equal(big.json.error, "body_too_large");

        assert.equal((await call(ctx, "POST", "/api/auth/login", { raw: "{isto não é json" })).json.error, "invalid_json");
        assert.equal((await call(ctx, "POST", "/api/auth/login", { raw: "[1,2]" })).json.error, "invalid_json");
    });
});

// ==========================================
// LOGIN
// ==========================================

test("o login troca o código, devolve a sessão e a VSync fica sem acesso", async () => {
    await withApi({}, async ctx => {
        const result = await login(ctx);

        assert.equal(result.status, 200);
        assert.match(result.json.token, /^[A-Za-z0-9_-]{40,}$/);
        assert.equal(result.json.expiresAt, T0 + WEB_CONFIG.sessionTtl);

        assert.deepEqual({ ...result.json.user }, {
            id: USER, username: "jogadora", displayName: "Jogadora", avatarUrl: "https://cdn.exemplo.test/a.png"
        });

        // o que foi enviado à VSync na troca
        const exchange = ctx.upstream.calls.find(c => c.url.endsWith("/oauth2/token"));

        assert.equal(exchange.params.get("grant_type"), "authorization_code");
        assert.equal(exchange.params.get("code_verifier"), VERIFIER);
        assert.equal(exchange.params.get("client_secret"), null, "sem segredo configurado, só PKCE");

        // o acesso da VSync é devolvido na hora (o da Helena vale por conta própria)
        const revoked = ctx.upstream.calls
            .filter(c => c.url.endsWith("/oauth2/token/revoke"))
            .map(c => c.params.get("token"))
            .sort();

        assert.deepEqual(revoked, ["vsat_abc", "vsrt_abc"]);

        // só o hash do token fica no banco
        const row = get("SELECT * FROM web_sessions");

        assert.notEqual(row.token_hash, result.json.token);
        assert.match(row.token_hash, /^[0-9a-f]{64}$/);
        assert.equal(row.user_id, USER);
        assert.doesNotMatch(JSON.stringify({ ...row }), new RegExp(result.json.token));

        // só os servidores em que a Helena também está
        assert.deepEqual(
            JSON.parse(row.guilds_json).map(g => g.id),
            [G1, G2]
        );

        assert.deepEqual(logRows(), [{ kind: "login", ok: 1, detail: "2 servidores", guild_id: null }]);
    });
});

test("com segredo configurado, ele vai junto na troca", async () => {
    await withApi({ clientSecret: "segredo-do-app" }, async ctx => {
        await login(ctx);

        const exchange = ctx.upstream.calls.find(c => c.url.endsWith("/oauth2/token"));

        assert.equal(exchange.params.get("client_secret"), "segredo-do-app");
    });
});

test("login recusado: endereço de retorno fora da lista, verifier ruim, código errado", async () => {
    await withApi({}, async ctx => {
        const strange = await call(ctx, "POST", "/api/auth/login", {
            body: { code: "good-code", codeVerifier: VERIFIER, redirectUri: "https://golpista.exemplo.test/conta/" }
        });

        assert.equal(strange.status, 400);
        assert.equal(strange.json.error, "invalid_redirect");
        assert.equal(ctx.upstream.calls.length, 0, "nem chegou a falar com a VSync");

        const noSlash = await call(ctx, "POST", "/api/auth/login", {
            body: { code: "good-code", codeVerifier: VERIFIER, redirectUri: REDIRECT.slice(0, -1) }
        });

        assert.equal(noSlash.json.error, "invalid_redirect", "a barra final conta (casamento exato)");

        const shortVerifier = await call(ctx, "POST", "/api/auth/login", {
            body: { code: "good-code", codeVerifier: "curto", redirectUri: REDIRECT }
        });

        assert.equal(shortVerifier.json.error, "invalid_verifier");

        const badChars = await call(ctx, "POST", "/api/auth/login", {
            body: { code: "good-code", codeVerifier: "!".repeat(43), redirectUri: REDIRECT }
        });

        assert.equal(badChars.json.error, "invalid_verifier");

        assert.equal((await call(ctx, "POST", "/api/auth/login", { body: { codeVerifier: VERIFIER, redirectUri: REDIRECT } })).json.error, "invalid_code");

        const wrong = await call(ctx, "POST", "/api/auth/login", {
            body: { code: "codigo-errado", codeVerifier: VERIFIER, redirectUri: REDIRECT }
        });

        assert.equal(wrong.status, 401);
        assert.equal(wrong.json.error, "login_failed");

        assert.equal(get("SELECT COUNT(*) c FROM web_sessions").c, 0, "nenhuma sessão criada");
    });
});

test("VSync fora do ar: erro claro, sem sessão", async () => {
    reset();

    const api = createWebApi(BASE_CONFIG, {
        fetch: async () => { throw new Error("rede caiu"); },
        now: () => T0
    });

    const server = http.createServer((req, res) => api.handle(req, res));

    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

    const ctx = { base: `http://127.0.0.1:${server.address().port}` };

    const warn = console.warn;
    console.warn = () => {};

    try {
        const result = await login(ctx);

        assert.equal(result.status, 502);
        assert.equal(result.json.error, "vsync_unavailable");
        assert.equal(get("SELECT COUNT(*) c FROM web_sessions").c, 0);

    } finally {
        console.warn = warn;
        server.close();
        server.closeAllConnections();
    }
});

test("o login tem limite de tentativas por IP", async () => {
    await withApi({}, async ctx => {
        const bad = () => call(ctx, "POST", "/api/auth/login", {
            body: { code: "codigo-errado", codeVerifier: VERIFIER, redirectUri: REDIRECT }
        });

        for (let i = 0; i < WEB_CONFIG.limits.login.max; i++) {
            assert.equal((await bad()).status, 401);
        }

        const blocked = await bad();

        assert.equal(blocked.status, 429);
        assert.equal(blocked.json.error, "too_many_requests");
        assert.ok(Number(blocked.headers.get("retry-after")) > 0);

        // passada a janela, volta a funcionar
        ctx.state.now += WEB_CONFIG.limits.login.windowSeconds + 1;

        assert.equal((await bad()).status, 401);
    });
});

test("atrás de um proxy confiável, cada IP real tem o seu limite", async () => {
    await withApi({ trustProxy: true }, async ctx => {
        const bad = ip => call(ctx, "POST", "/api/auth/login", {
            body: { code: "x", codeVerifier: VERIFIER, redirectUri: REDIRECT },
            headers: { "X-Forwarded-For": ip }
        });

        for (let i = 0; i < WEB_CONFIG.limits.login.max; i++) {
            await bad("203.0.113.7");
        }

        assert.equal((await bad("203.0.113.7")).status, 429);
        assert.equal((await bad("203.0.113.8")).status, 401, "outro IP não é afetado");

        assert.ok(get("SELECT COUNT(*) c FROM web_claim_log").c >= 0);
    });
});

// ==========================================
// SESSÃO
// ==========================================

test("sem token, com token inventado ou vencido: 401", async () => {
    await withApi({}, async ctx => {
        assert.equal((await call(ctx, "GET", "/api/me")).status, 401);
        assert.equal((await call(ctx, "GET", "/api/me", { token: "inventado-inventado-inventado" })).status, 401);
        assert.equal((await call(ctx, "GET", "/api/me", { headers: { Authorization: "Basic abc" } })).status, 401);

        const token = await loggedIn(ctx);

        assert.equal((await call(ctx, "GET", "/api/me", { token })).status, 200);

        // um segundo antes de vencer ainda vale; no segundo exato vence
        ctx.state.now = T0 + WEB_CONFIG.sessionTtl - 1;

        assert.equal((await call(ctx, "GET", "/api/me", { token })).status, 200);

        ctx.state.now = T0 + WEB_CONFIG.sessionTtl;

        const expired = await call(ctx, "GET", "/api/me", { token });

        assert.equal(expired.status, 401);
        assert.equal(expired.json.error, "session_expired");
        assert.equal(get("SELECT COUNT(*) c FROM web_sessions").c, 0, "a sessão vencida é apagada");
    });
});

test("cada pessoa mantém no máximo 5 sessões: as mais antigas saem", async () => {
    await withApi({}, async ctx => {
        const tokens = [];

        for (let i = 0; i < WEB_CONFIG.maxSessionsPerUser + 2; i++) {
            ctx.state.now = T0 + i * 10;

            tokens.push(await loggedIn(ctx));
        }

        assert.equal(get("SELECT COUNT(*) c FROM web_sessions WHERE user_id=?", USER).c, WEB_CONFIG.maxSessionsPerUser);

        const status = await Promise.all(tokens.map(token => call(ctx, "GET", "/api/me", { token }).then(r => r.status)));

        assert.deepEqual(status, [401, 401, 200, 200, 200, 200, 200], "as duas primeiras caíram");
    });
});

test("sair apaga a sessão", async () => {
    await withApi({}, async ctx => {
        const token = await loggedIn(ctx);

        assert.equal((await call(ctx, "POST", "/api/auth/logout", { token })).status, 200);
        assert.equal((await call(ctx, "GET", "/api/me", { token })).status, 401);
        assert.equal((await call(ctx, "POST", "/api/auth/logout", { token })).status, 401, "já saiu");

        assert.deepEqual(logRows().map(r => r.kind), ["login", "logout"]);
    });
});

test("a limpeza apaga só as sessões vencidas", async () => {
    await withApi({}, async ctx => {
        await loggedIn(ctx);

        ctx.state.now = T0 + 100;
        await loggedIn(ctx);

        ctx.state.now = T0 + WEB_CONFIG.sessionTtl + 50;
        ctx.api.cleanup();

        assert.equal(get("SELECT COUNT(*) c FROM web_sessions").c, 1, "a segunda ainda vale");
    });
});

// ==========================================
// PAINEL (/api/me)
// ==========================================

test("o painel mostra os servidores em comum, o daily de cada um e as gemas, sem criar nada", async () => {
    await withApi({}, async ctx => {
        const token = await loggedIn(ctx);

        const before = get("SELECT COUNT(*) c FROM players").c;

        const me = await call(ctx, "GET", "/api/me", { token });

        assert.equal(me.status, 200);
        assert.equal(me.json.user.id, USER);
        assert.equal(me.json.captcha, false);
        assert.equal(me.json.expiresAt, T0 + WEB_CONFIG.sessionTtl);

        assert.deepEqual(me.json.guilds.map(g => g.id), [G1, G2]);

        const first = me.json.guilds[0];

        assert.equal(first.name, "Servidor Um");
        assert.equal(first.icon, "https://cdn.exemplo.test/1.png");
        assert.equal(first.player, null, "quem nunca jogou ali aparece sem registro");
        assert.equal(first.prison, null);
        assert.equal(first.daily.available, true);
        assert.equal(first.daily.nextReward.total, 50_000);

        assert.deepEqual({ ...me.json.gems }, {
            balance: 0, available: true, remaining: 0,
            min: GEM_BONUS.min, max: GEM_BONUS.max, cooldown: GEM_BONUS.cooldown
        });

        assert.equal(get("SELECT COUNT(*) c FROM players").c, before, "só leitura");
        assert.equal(get("SELECT COUNT(*) c FROM global_users").c, 0);
    });
});

test("o painel mostra dinheiro, prisão e some com servidor de onde a Helena saiu", async () => {
    await withApi({}, async ctx => {
        const token = await loggedIn(ctx);

        getPlayer(G1, USER);
        set("UPDATE players SET wallet=?, bank=?, level=? WHERE guild_id=? AND user_id=?", 12_300, 4_500, 7, G1, USER);

        imprison(G2, USER, 1800, "teste", T0);

        const me = await call(ctx, "GET", "/api/me", { token });

        const [one, two] = me.json.guilds;

        assert.deepEqual({ ...one.player }, { wallet: 12_300, bank: 4_500, level: 7 });
        assert.equal(one.prison, null);
        assert.deepEqual({ ...two.prison }, { remaining: 1800 });

        guildIds.delete(G2);

        try {
            const after = await call(ctx, "GET", "/api/me", { token });

            assert.deepEqual(after.json.guilds.map(g => g.id), [G1]);

        } finally {
            guildIds.add(G2);
        }
    });
});

// ==========================================
// COLETA DO DAILY
// ==========================================

test("coletar o daily paga, registra e mostra a recarga na segunda tentativa", async () => {
    await withApi({}, async ctx => {
        const token = await loggedIn(ctx);

        const first = await call(ctx, "POST", "/api/claim/daily", { token, body: { guildId: G1 } });

        assert.equal(first.status, 200);
        assert.equal(first.json.status, "claimed");
        assert.equal(first.json.reward.total, 50_000);
        assert.equal(first.json.streak, 1);
        assert.equal(first.json.wallet, 50_000);
        assert.equal(first.json.daily.available, false);

        assert.equal(get("SELECT wallet w FROM players WHERE guild_id=? AND user_id=?", G1, USER).w, 50_000);
        assert.equal(get("SELECT COUNT(*) c FROM transactions WHERE type='daily'").c, 1);

        const again = await call(ctx, "POST", "/api/claim/daily", { token, body: { guildId: G1 } });

        assert.equal(again.status, 409);
        assert.equal(again.json.error, "cooldown");
        assert.equal(again.json.remaining, 24 * 3600);

        // o outro servidor é independente
        const other = await call(ctx, "POST", "/api/claim/daily", { token, body: { guildId: G2 } });

        assert.equal(other.status, 200);

        assert.deepEqual(
            logRows().filter(r => r.kind === "daily").map(r => [r.ok, r.guild_id, r.detail]),
            [[1, G1, "dia 1, 50000"], [0, G1, "cooldown"], [1, G2, "dia 1, 50000"]]
        );

        // 24 h depois (a sessão de 6 h já venceu, então entra de novo), a sequência anda
        ctx.state.now = T0 + 24 * 3600;

        assert.equal((await call(ctx, "GET", "/api/me", { token })).status, 401);

        const next = await call(ctx, "POST", "/api/claim/daily", { token: await loggedIn(ctx), body: { guildId: G1 } });

        assert.equal(next.json.streak, 2);
        assert.equal(next.json.reward.total, 55_000);
    });
});

test("só dá para coletar em servidor visto no login e onde a Helena está", async () => {
    await withApi({}, async ctx => {
        const token = await loggedIn(ctx);

        for (const guildId of [G3, "g-qualquer", "", undefined, 123, null, { toString: () => G1 }, [G1]]) {
            const result = await call(ctx, "POST", "/api/claim/daily", { token, body: { guildId } });

            assert.equal(result.status, 403, JSON.stringify(guildId));
            assert.equal(result.json.error, "guild_not_allowed");
        }

        assert.equal(get("SELECT COUNT(*) c FROM players").c, 0, "nada foi criado");

        // a Helena saiu do servidor depois do login: também não vale
        guildIds.delete(G1);

        try {
            const gone = await call(ctx, "POST", "/api/claim/daily", { token, body: { guildId: G1 } });

            assert.equal(gone.status, 403);

        } finally {
            guildIds.add(G1);
        }
    });
});

test("preso não coleta o daily, como no comando", async () => {
    await withApi({}, async ctx => {
        const token = await loggedIn(ctx);

        imprison(G1, USER, 1800, "teste", T0);

        const result = await call(ctx, "POST", "/api/claim/daily", { token, body: { guildId: G1 } });

        assert.equal(result.status, 409);
        assert.equal(result.json.error, "prison");
        assert.equal(result.json.remaining, 1800);

        assert.equal(get("SELECT COUNT(*) c FROM players").c, 0);
        assert.equal(logRows().at(-1).detail, "prison");
    });
});

test("carteira no limite: recusa sem gastar a recarga", async () => {
    await withApi({}, async ctx => {
        const token = await loggedIn(ctx);

        getPlayer(G1, USER);
        set("UPDATE players SET wallet=? WHERE guild_id=? AND user_id=?", 100_000_000_000_000 - 100, G1, USER);

        const result = await call(ctx, "POST", "/api/claim/daily", { token, body: { guildId: G1 } });

        assert.equal(result.status, 409);
        assert.equal(result.json.error, "wallet_full");
        assert.equal(get("SELECT last_daily l FROM players WHERE guild_id=? AND user_id=?", G1, USER).l, 0);
    });
});

test("cinco coletas ao mesmo tempo: só uma paga", async () => {
    await withApi({}, async ctx => {
        const token = await loggedIn(ctx);

        const results = await Promise.all(
            Array.from({ length: 5 }, () => call(ctx, "POST", "/api/claim/daily", { token, body: { guildId: G1 } }))
        );

        assert.deepEqual(results.map(r => r.status).sort(), [200, 409, 409, 409, 409]);
        assert.equal(get("SELECT wallet w FROM players WHERE guild_id=? AND user_id=?", G1, USER).w, 50_000);
        assert.equal(get("SELECT COUNT(*) c FROM transactions").c, 1);
    });
});

// ==========================================
// COLETA DE GEMAS
// ==========================================

test("coletar gemas soma na conta e abre a recarga de 5 horas", async () => {
    await withApi({}, async ctx => {
        const token = await loggedIn(ctx);

        const first = await call(ctx, "POST", "/api/claim/gems", { token, body: {} });

        assert.equal(first.status, 200);
        assert.equal(first.json.status, "claimed");
        assert.equal(first.json.amount, 2, "sorteio controlado pelo teste");
        assert.equal(first.json.balance, 2);
        assert.equal(first.json.remaining, GEM_BONUS.cooldown);

        const wait = await call(ctx, "POST", "/api/claim/gems", { token, body: {} });

        assert.equal(wait.status, 409);
        assert.equal(wait.json.error, "cooldown");
        assert.equal(wait.json.remaining, GEM_BONUS.cooldown);
        assert.equal(wait.json.balance, 2);

        const me = await call(ctx, "GET", "/api/me", { token });

        assert.equal(me.json.gems.balance, 2);
        assert.equal(me.json.gems.available, false);

        ctx.state.now = T0 + GEM_BONUS.cooldown;

        assert.equal((await call(ctx, "POST", "/api/claim/gems", { token, body: {} })).json.balance, 4);

        assert.deepEqual(
            logRows().filter(r => r.kind === "gems").map(r => [r.ok, r.detail]),
            [[1, "+2"], [0, "cooldown"], [1, "+2"]]
        );
    });
});

test("as gemas valem em qualquer servidor: não dependem de servidor", async () => {
    await withApi({}, async ctx => {
        const token = await loggedIn(ctx);

        // sem guildId, e mesmo com um (ignorado)
        assert.equal((await call(ctx, "POST", "/api/claim/gems", { token })).status, 200);
        assert.equal((await call(ctx, "POST", "/api/claim/gems", { token, body: { guildId: G3 } })).status, 409);
    });
});

// ==========================================
// ANTI-ROBÔ (TURNSTILE)
// ==========================================

test("com Turnstile configurado, as coletas exigem a verificação", async () => {
    await withApi({ turnstileSecret: "segredo-turnstile" }, async ctx => {
        const token = await loggedIn(ctx);

        const me = await call(ctx, "GET", "/api/me", { token });

        assert.equal(me.json.captcha, true, "o site fica sabendo que precisa mostrar o desafio");

        const missing = await call(ctx, "POST", "/api/claim/daily", { token, body: { guildId: G1 } });

        assert.equal(missing.status, 400);
        assert.equal(missing.json.error, "captcha_required");

        const bad = await call(ctx, "POST", "/api/claim/daily", { token, body: { guildId: G1, turnstile: "token-falso" } });

        assert.equal(bad.status, 403);
        assert.equal(bad.json.error, "captcha_failed");

        const gems = await call(ctx, "POST", "/api/claim/gems", { token, body: {} });

        assert.equal(gems.json.error, "captcha_required");

        assert.equal(get("SELECT COUNT(*) c FROM players").c, 0, "recusado antes de qualquer pagamento");
        assert.equal(get("SELECT COUNT(*) c FROM global_users").c, 0);

        const good = await call(ctx, "POST", "/api/claim/daily", { token, body: { guildId: G1, turnstile: "ok-token" } });

        assert.equal(good.status, 200);

        const verifications = ctx.upstream.calls.filter(c => c.url.includes("challenges.cloudflare.com"));

        // uma verificação por tentativa com token (a sem token nem chega à Cloudflare)
        assert.deepEqual(
            verifications.map(c => c.params.get("response")),
            ["token-falso", "ok-token"]
        );

        for (const verify of verifications) {
            assert.equal(verify.params.get("secret"), "segredo-turnstile");
            assert.ok(verify.params.get("remoteip"), "o IP vai para a Cloudflare");
        }

        assert.equal(
            (await call(ctx, "POST", "/api/claim/gems", { token, body: { turnstile: "ok-token" } })).status,
            200
        );
    });
});

test("Cloudflare fora do ar: a coleta espera, não paga sem verificar", async () => {
    reset();

    const api = createWebApi(
        { ...BASE_CONFIG, turnstileSecret: "s" },
        {
            fetch: async url => {
                if (String(url).includes("challenges.cloudflare.com")) throw new Error("fora do ar");

                return makeUpstream().fetch(url, {});
            },
            now: () => T0
        }
    );

    const server = http.createServer((req, res) => api.handle(req, res));

    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));

    const ctx = { base: `http://127.0.0.1:${server.address().port}` };

    // sessão criada direto, para não depender do login simulado
    db.prepare(`
        INSERT INTO web_sessions (token_hash, user_id, guilds_json, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
    `).run(
        (await import("node:crypto")).createHash("sha256").update("t".repeat(43)).digest("hex"),
        USER,
        JSON.stringify([{ id: G1, name: "Um", icon: null }]),
        T0,
        T0 + 1000
    );

    const warn = console.warn;
    console.warn = () => {};

    try {
        const result = await call(ctx, "POST", "/api/claim/daily", { token: "t".repeat(43), body: { guildId: G1, turnstile: "qualquer" } });

        assert.equal(result.status, 503);
        assert.equal(result.json.error, "captcha_unavailable");
        assert.equal(get("SELECT COUNT(*) c FROM players").c, 0);

    } finally {
        console.warn = warn;
        server.close();
        server.closeAllConnections();
    }
});

test("sem Turnstile configurado as coletas funcionam (o bot avisa no início)", async () => {
    await withApi({ turnstileSecret: null }, async ctx => {
        const token = await loggedIn(ctx);

        assert.equal((await call(ctx, "POST", "/api/claim/daily", { token, body: { guildId: G1 } })).status, 200);
    });
});

// ==========================================
// LIMITES DE COLETA
// ==========================================

test("as coletas também têm limite de tentativas por pessoa", async () => {
    await withApi({}, async ctx => {
        const token = await loggedIn(ctx);

        const spam = () => call(ctx, "POST", "/api/claim/gems", { token, body: {} });

        let blocked = null;

        for (let i = 0; i < WEB_CONFIG.limits.claim.max + 5; i++) {
            const result = await spam();

            if (result.status === 429) {
                blocked = i;
                break;
            }
        }

        assert.equal(blocked, WEB_CONFIG.limits.claim.max, "bloqueia na tentativa seguinte ao limite");
    });
});

// ==========================================
// SERVIDOR DE VERDADE (LIGAR E DESLIGAR)
// ==========================================

test("startWebApi liga pela configuração do ambiente e stopWebApi desliga", async () => {
    assert.equal(await startWebApi({}), null, "sem HELENA_WEB_PORT, nada sobe");

    const log = console.log;
    const warn = console.warn;

    console.log = () => {};
    console.warn = () => {};

    let running;

    try {
        running = await startWebApi({
            HELENA_WEB_PORT: "0",
            HELENA_WEB_ORIGINS: SITE,
            HELENA_OAUTH_REDIRECTS: REDIRECT,
            HELENA_OAUTH_CLIENT_ID: "app-id"
        });

    } finally {
        console.log = log;
        console.warn = warn;
    }

    assert.ok(running && running.port > 0);

    const health = await fetch(`http://127.0.0.1:${running.port}/api/health`, { headers: { Origin: SITE } });

    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });

    await stopWebApi();

    await assert.rejects(fetch(`http://127.0.0.1:${running.port}/api/health`));

    await stopWebApi(); // chamar de novo não quebra
});
