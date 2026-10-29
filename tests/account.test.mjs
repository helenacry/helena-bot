import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// O painel do site (site/src/islands/Account.tsx) usa a lógica de site/src/lib/account.ts.
// Aqui ela roda no Node, sem página: as funções puras, e o login completo contra a API de verdade.

const lib = await import("../site/src/lib/account.ts");

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

test("o endereço de autorização leva exatamente o que o Discord documenta", () => {
    const url = new URL(lib.buildAuthorizeUrl({
        clientId: "app-id",
        redirectUri: "https://site.exemplo.test/account/",
        state: "estado123",
        challenge: "desafio456"
    }));

    assert.equal(url.origin + url.pathname, "https://discord.com/oauth2/authorize");

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

test("lê o que o Discord devolve na volta do login", () => {
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

    assert.deepEqual(lib.weekPips(3).filter(p => p.weekly).map(p => p.day), [7], "só o 7º é o do bônus semanal");
});

test("só imagens https entram na página", () => {
    assert.equal(lib.safeImage("https://cdn.exemplo.test/a.png"), "https://cdn.exemplo.test/a.png");

    for (const bad of ["javascript:alert(1)", "data:image/png;base64,AAAA", "http://x.test/a.png", "//x.test/a.png", "", null, undefined, 42, {}]) {
        assert.equal(lib.safeImage(bad), "", String(bad));
    }
});

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

// ==========================================
// RECIBO DE RESULTADO (o que aparece depois de coletar)
// ==========================================

const NOON = new Date(2026, 9, 25, 18, 40);

// o espaço do "R$ 500,00" é inseparável; o teste não depende dele
const flat = value => JSON.parse(JSON.stringify(value).replace(/\u00a0/g, " "));

test("recibo do daily: linhas só do que veio, total em destaque, sequência e próxima coleta no rodapé", () => {
    const slip = flat(lib.dailySlip("Helena Lab", {
        reward: { base: 50_000, progressiveBonus: 5_000, weeklyBonus: 0, total: 55_000 },
        streak: 2,
        bestStreak: 4,
        wallet: 125_000,
        daily: { remaining: 86_400 }
    }, NOON));

    assert.equal(slip.title, "Daily · Helena Lab");
    assert.equal(slip.stamp, "Resgatado");
    assert.equal(slip.when, "25/10 · 18:40");

    assert.deepEqual(slip.rows, [
        ["Recompensa base", "+R$ 500,00"],
        ["Bônus de sequência", "+R$ 50,00"],
        null,
        ["Total", "+R$ 550,00", "plus"],
        ["Carteira", "R$ 1.250,00"]
    ], "bônus zerado não vira linha");

    assert.deepEqual(slip.foot, [
        "Sequência de 2 dias · recorde de 4 dias",
        "Próximo resgate neste servidor em 24h 0m 0s"
    ]);
});

test("recibo do daily: o bônus de 7 dias aparece e o singular vale para 1 dia", () => {
    const slip = flat(lib.dailySlip("A", {
        reward: { base: 50_000, progressiveBonus: 30_000, weeklyBonus: 100_000, total: 180_000 },
        streak: 1,
        bestStreak: 1
    }, NOON));

    assert.ok(slip.rows.some(row => row && row[0] === "Bônus de 7 dias" && row[1] === "+R$ 1.000,00"));
    assert.deepEqual(slip.foot, ["Sequência de 1 dia"], "sem recorde repetido e sem próxima coleta desconhecida");
});

test("recibo do daily: resposta enxuta não quebra e não deixa tracejado solto", () => {
    const slip = flat(lib.dailySlip("", { reward: { total: 60_000 }, streak: 3 }, NOON));

    assert.equal(slip.title, "Daily · servidor", "servidor sem nome");
    assert.deepEqual(slip.rows, [["Total", "+R$ 600,00", "plus"]], "o tracejado do começo some");

    const empty = lib.dailySlip("A", {}, NOON);

    assert.deepEqual(empty.rows, [], "sem nada para mostrar, sem linhas");
    assert.deepEqual(empty.foot, []);

    assert.doesNotThrow(() => lib.dailySlip("A", undefined, NOON));
    assert.doesNotThrow(() => lib.dailySlip("A", { reward: null, streak: "x", wallet: null }, NOON));
});

test("recibo das gemas: quanto veio, o saldo e a próxima coleta", () => {
    const slip = lib.gemsSlip({ amount: 3, balance: 1042, remaining: 7200 }, NOON);

    assert.equal(slip.title, "Bônus de gemas");
    assert.equal(slip.stamp, "Coletado");
    assert.deepEqual(slip.rows, [["Gemas", "+3", "plus"], ["Saldo", "1.042"]]);
    assert.deepEqual(slip.foot, ["Próxima coleta em 2h 0m 0s"]);

    assert.deepEqual(lib.gemsSlip({ amount: 1, balance: 8 }, NOON).foot, [], "sem tempo, sem rodapé");
    assert.doesNotThrow(() => lib.gemsSlip(undefined, NOON));
});

test("o recibo lido em voz alta: título, linhas e rodapé em frases, sem o tracejado", () => {
    const text = flat(lib.slipText(lib.dailySlip("Helena Lab", {
        reward: { base: 50_000, total: 50_000 },
        streak: 1,
        wallet: 51_000
    }, NOON)));

    assert.equal(text, "Daily · Helena Lab. Recompensa base +R$ 500,00. Total +R$ 500,00. Carteira R$ 510,00. Sequência de 1 dia.");
});

// ==========================================
// ORDEM E RESUMO DOS SERVIDORES
// ==========================================

const guild = (id, patch = {}) => ({
    id,
    name: `Servidor ${id}`,
    icon: null,
    player: null,
    prison: null,
    daily: { available: false, remaining: 100, streak: 0, nextStreak: 1, nextReward: { total: 50_000, weeklyBonus: 0 } },
    ...patch
});

test("ordem das linhas: liberado (maior prêmio primeiro), esperando (o que libera antes), preso por último", () => {
    const ready = (id, total) => guild(id, { daily: { available: true, remaining: 0, streak: 1, nextStreak: 2, nextReward: { total, weeklyBonus: 0 } } });
    const waiting = (id, remaining) => guild(id, { daily: { available: false, remaining, streak: 1, nextStreak: 2, nextReward: { total: 50_000, weeklyBonus: 0 } } });
    const jailed = id => guild(id, { prison: { remaining: 60 }, daily: { available: true, remaining: 0, streak: 1, nextStreak: 2, nextReward: { total: 999_999, weeklyBonus: 0 } } });

    const sorted = lib.sortGuilds([jailed("preso"), waiting("tarde", 9_000), ready("pouco", 50_000), waiting("cedo", 60), ready("muito", 130_000)]);

    assert.deepEqual(sorted.map(g => g.id), ["muito", "pouco", "cedo", "tarde", "preso"]);

    // empate: fica a ordem da API
    assert.deepEqual(lib.sortGuilds([ready("a", 50_000), ready("b", 50_000)]).map(g => g.id), ["a", "b"]);
    assert.deepEqual(lib.sortGuilds(null), []);
});

test("resumo do topo: quantos liberados, quanto somam e, se nenhum, quando sai o próximo (preso não conta)", () => {
    const ready = (id, total) => guild(id, { daily: { available: true, remaining: 0, streak: 1, nextStreak: 2, nextReward: { total, weeklyBonus: 0 } } });

    assert.deepEqual(lib.tally([ready("a", 50_000), ready("b", 60_000), guild("c", { prison: { remaining: 10 }, daily: ready("x", 70_000).daily })]), { ready: 2, total: 110_000, nextIn: null });
    assert.deepEqual(lib.tally([guild("a", { daily: { ...guild("x").daily, remaining: 500 } }), guild("b", { daily: { ...guild("x").daily, remaining: 90 } })]), { ready: 0, total: 0, nextIn: 90 });
    assert.deepEqual(lib.tally([]), { ready: 0, total: 0, nextIn: null });
});

test("a escada de exemplo da tela de entrada é a do bot (muda o daily, muda o exemplo)", async () => {
    const { calculateReward } = await import("../services/economy/daily.mjs");

    assert.deepEqual([...lib.SAMPLE_LADDER], [1, 2, 3, 4, 5, 6, 7].map(day => calculateReward(day).total));
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

test("'Não deu para entrar' leva o código curto do motivo, e só se for texto simples", () => {
    assert.equal(lib.errorText("login_failed"), "Não deu para entrar. Tente de novo.");
    assert.equal(lib.errorText("login_failed", { detail: "conta:401" }), "Não deu para entrar. Tente de novo. (código: conta:401)");
    assert.equal(lib.errorText("login_failed", { detail: "discord:server_error" }), "Não deu para entrar. Tente de novo. (código: discord:server_error)");

    for (const detail of ["<b>oi</b>", "a b", "", "x".repeat(61)]) {
        assert.equal(lib.errorText("login_failed", { detail }), "Não deu para entrar. Tente de novo.", JSON.stringify(detail));
    }
});

test("toda recusa que a API pode mostrar à pessoa tem texto próprio na tela", () => {
    const api = readFileSync(new URL("../services/web/web-api.mjs", import.meta.url), "utf8");

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

test("a tela nunca monta HTML com texto da API (nada de innerHTML nem dangerouslySetInnerHTML)", () => {
    for (const file of ["islands/Account.tsx", "lib/account.ts"]) {
        const source = readFileSync(new URL(`../site/src/${file}`, import.meta.url), "utf8");

        assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|dangerouslySetInnerHTML|set:html/, file);
    }
});

test("nenhum segredo vai para o site: só a chave pública do Turnstile e o ID do aplicativo", () => {
    const config = readFileSync(new URL("../site/src/config.ts", import.meta.url), "utf8");

    // o ID do aplicativo é só um número (o Discord o mostra a qualquer um, e o build aceita outro pela
    // variável de ambiente nos testes): nunca um segredo
    assert.match(config, /const DISCORD_CLIENT_ID: string = String\(import\.meta\.env\?\.PUBLIC_DISCORD_CLIENT_ID \?\? "\d{17,20}"\)/);
    assert.match(config, /clientId: DISCORD_CLIENT_ID/);
    assert.match(config, /turnstileSiteKey: "0x[A-Za-z0-9_-]+"/, "chave pública do Turnstile (começa com 0x)");

    assert.doesNotMatch(config, /DISCORD_BOT_TOKEN|TURNSTILE_SECRET|OAUTH_CLIENT_SECRET|client_secret|sk_live|Bearer /i);
});

// ==========================================
// CLIENTE x API: O LOGIN COMPLETO
// ==========================================

test("o que o painel gera é aceito pela API: login com PKCE conferido de verdade", async () => {
    const http = await import("node:http");
    const { createWebApi } = await import("../services/web/web-api.mjs");
    const { guildIds } = await import("../services/platform/guild-registry.mjs");

    const SITE_ORIGIN = "https://site.exemplo.test";

    guildIds.add("g-e2e");

    // o painel monta o pedido de autorização e guarda o desafio
    const { verifier, challenge } = await lib.pkce();

    const redirect = lib.redirectUri({ origin: SITE_ORIGIN, pathname: "/account/index.html" });

    const authorize = new URL(lib.buildAuthorizeUrl({ clientId: "app-id", redirectUri: redirect, state: "s", challenge }));

    // Discord simulado: só troca o código se o verifier combinar com o desafio S256
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

        if (u.endsWith("/users/@me")) return reply(200, { id: "555", username: "e2e", global_name: "E2E", avatar: null });
        if (u.endsWith("/users/@me/guilds")) return reply(200, [{ id: "g-e2e", name: "Servidor E2E", icon: null }]);

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
