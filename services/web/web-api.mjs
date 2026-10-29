
import http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

import { db } from "../../database/connection.mjs";

import { WEB_CONFIG } from "../../config/web.mjs";
import { GEM_BONUS } from "../../config/gems.mjs";
import { PRISON_BLOCKED_COMMANDS } from "../../config/crime.mjs";

import { claimDaily, getDailyStatus, calculateReward, DAILY_CONFIG } from "../economy/daily.mjs";
import { claimGemBonus, getGemBonusStatus } from "../economy/gem-bonus.mjs";
import { getPrison } from "../crime/prison.mjs";
import { knowsGuild } from "../platform/guild-registry.mjs";
import { blocked, isOwner, maintenance } from "../platform/developer.mjs";
import { discordApi } from "../discord/api.mjs";
import { createCloudflareMatcher, isLoopback, parseExtraRanges } from "./cloudflare.mjs";
import { createStaticSite } from "./static-site.mjs";
import { avatarUrl as discordAvatar } from "../discord/normalize.mjs";

// ==========================================
// API DO SITE
// ==========================================

// Painel do jogador: a pessoa entra com a conta do Discord, vê os servidores
// em que ela e a Helena estão e resgata o daily e o bônus de gemas pelo site.
//
// Fluxo de login (OAuth2 com PKCE, feito pelo site):
//   1. o site manda a pessoa para o Discord, com um "code_challenge";
//   2. o Discord devolve um "code" ao site;
//   3. o site entrega o "code" e o "code_verifier" a esta API (o navegador
//      não pode falar direto com o endpoint de troca: o Discord não libera
//      CORS para outros sites);
//   4. a API troca o código, lê quem é a pessoa e seus servidores, devolve o
//      token do Discord (não precisamos mais dele) e cria uma sessão própria.
//
// Só ligada quando HELENA_WEB_PORT está definida. Sem cookies: a sessão
// é um token no cabeçalho Authorization, e só o hash dele fica no banco.

const JSON_HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    // A resposta é só JSON: se algum navegador a abrisse como página, nada roda nem carrega
    // e ela não pode ser embutida em outro site.
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer"
};

// ==========================================
// CONFIGURAÇÃO (VARIÁVEIS DE AMBIENTE)
// ==========================================

const list = value => String(value ?? "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

// Como o IP do visitante chega atrás de um proxy (HELENA_WEB_TRUST_PROXY):
//   "cloudflare"       o IP vem em CF-Connecting-IP (Discloud e outras hospedagens
//                      atrás da Cloudflare)
//   "1", "true", "sim" o IP é o último valor de X-Forwarded-For (outros proxies)
//   vazio              sem proxy: vale o endereço da conexão
export function trustProxyMode(value) {
    const text = String(value ?? "").trim().toLowerCase();

    if (text === "cloudflare") {
        return "cloudflare";
    }

    return ["1", "true", "sim"].includes(text);
}

// Por qual endereço a pessoa chegou, "https" ou "http", segundo o proxy em que confiamos
// (HELENA_WEB_TRUST_PROXY). Sem proxy confiável, ou sem o cabeçalho esperado, devolve null:
// sem certeza, nada é redirecionado.
//   "cloudflare"  só vale o CF-Visitor ({"scheme":"https"}), que a Cloudflare escreve sozinha
//   "1", "true"   vale o último X-Forwarded-Proto (o do proxy mais próximo)
export function visitorScheme(headers, trustProxy) {
    if (!trustProxy) {
        return null;
    }

    let scheme = "";

    if (trustProxy === "cloudflare") {
        try {
            scheme = String(JSON.parse(String(headers["cf-visitor"] ?? ""))?.scheme ?? "");

        } catch {
            return null;
        }

    } else {
        const hops = String(headers["x-forwarded-proto"] ?? "").split(",");

        scheme = hops[hops.length - 1];
    }

    scheme = scheme.trim().toLowerCase();

    return scheme === "https" || scheme === "http" ? scheme : null;
}

// Devolve { enabled: false, reason } ou { enabled: true, ... }.
export function loadWebConfig(env = process.env) {
    const port = String(env.HELENA_WEB_PORT ?? "").trim();

    if (!port) {
        return { enabled: false, reason: "HELENA_WEB_PORT não definida" };
    }

    if (!/^\d{1,5}$/.test(port) || Number(port) > 65535) {
        return { enabled: false, reason: "HELENA_WEB_PORT inválida" };
    }

    const origins = list(env.HELENA_WEB_ORIGINS).map(origin => origin.replace(/\/+$/, ""));
    const redirects = list(env.HELENA_OAUTH_REDIRECTS);
    const clientId = String(env.HELENA_OAUTH_CLIENT_ID ?? "").trim();

    const extraRanges = parseExtraRanges(env.HELENA_WEB_CLOUDFLARE_IPS);

    const missing = [];

    if (!origins.length) missing.push("HELENA_WEB_ORIGINS");
    if (!redirects.length) missing.push("HELENA_OAUTH_REDIRECTS");
    if (!clientId) missing.push("HELENA_OAUTH_CLIENT_ID");

    if (missing.length) {
        return { enabled: false, reason: "faltam: " + missing.join(", ") };
    }

    return {
        enabled: true,
        port: Number(port),
        host: String(env.HELENA_WEB_HOST ?? "").trim() || "127.0.0.1",
        origins,
        redirects,
        clientId,
        clientSecret: String(env.HELENA_OAUTH_CLIENT_SECRET ?? "").trim() || null,
        turnstileSecret: String(env.HELENA_TURNSTILE_SECRET ?? "").trim() || null,
        trustProxy: trustProxyMode(env.HELENA_WEB_TRUST_PROXY),

        // No modo cloudflare, o CF-Connecting-IP só vale se o pedido veio de um endereço da Cloudflare
        // (config/cloudflare-ips.mjs). HELENA_WEB_CLOUDFLARE_IPS acrescenta faixas (separadas por vírgula,
        // como 203.0.113.0/24); HELENA_WEB_VERIFY_CLOUDFLARE=off desliga a conferência.
        verifyCloudflare: !["off", "0", "false", "no", "nao", "não"].includes(
            String(env.HELENA_WEB_VERIFY_CLOUDFLARE ?? "").trim().toLowerCase()
        ),
        cloudflareRanges: extraRanges.ranges,
        cloudflareInvalid: extraRanges.invalid,

        // Atrás de um proxy confiável, quem chega por http vai para https e as respostas https
        // levam HSTS. HELENA_WEB_FORCE_HTTPS=off desliga (se a hospedagem se confundir).
        forceHttps: !["off", "0", "false", "no", "nao", "não"].includes(
            String(env.HELENA_WEB_FORCE_HTTPS ?? "").trim().toLowerCase()
        ),

        debugIp: ["1", "true", "sim"].includes(
            String(env.HELENA_WEB_DEBUG_IP ?? "").trim().toLowerCase()
        )
    };
}

// ==========================================
// LIMITE DE REQUISIÇÕES (EM MEMÓRIA)
// ==========================================

// Teto de chaves guardadas ao mesmo tempo. A limpeza periódica (prune) tira o que venceu, mas
// uma enxurrada de IPs diferentes entre duas limpezas não pode encher a memória: passado o
// teto, a chave mais antiga sai para dar lugar à nova.
export const RATE_LIMIT_MAX_KEYS = 20_000;

export class RateLimiter {
    constructor(maxKeys = RATE_LIMIT_MAX_KEYS) {
        this.hits = new Map();
        this.maxKeys = maxKeys;
    }

    // Conta um pedido. Devolve { ok, retryAfter } (segundos).
    hit(key, { max, windowSeconds }, now) {
        const since = now - windowSeconds;

        const recent = (this.hits.get(key) ?? []).filter(time => time > since);

        if (recent.length >= max) {
            this.hits.set(key, recent);

            return { ok: false, retryAfter: recent[0] + windowSeconds - now };
        }

        recent.push(now);

        if (!this.hits.has(key) && this.hits.size >= this.maxKeys) {
            // o Map guarda a ordem de inserção: a primeira chave é a mais antiga
            this.hits.delete(this.hits.keys().next().value);
        }

        this.hits.set(key, recent);

        return { ok: true, retryAfter: 0 };
    }

    prune(now, windowSeconds) {
        for (const [key, times] of this.hits) {
            if (!times.some(time => time > now - windowSeconds)) {
                this.hits.delete(key);
            }
        }
    }
}

// ==========================================
// RESPOSTAS
// ==========================================

class HttpError extends Error {
    constructor(status, code, extra = {}) {
        super(code);

        this.status = status;
        this.code = code;
        this.extra = extra;
    }
}

const hashToken = token =>
    createHash("sha256").update(token).digest("hex");

const nowSeconds = () => Math.floor(Date.now() / 1000);

// ==========================================
// FÁBRICA DA API
// ==========================================

// "deps" existe para os testes: fetch, relógio e sorteio.
export function createWebApi(config, deps = {}) {
    const fetchImpl = deps.fetch ?? globalThis.fetch;
    const now = deps.now ?? nowSeconds;
    const random = deps.random ?? Math.random;
    const sleep = deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));

    // Quem a Helena conhece em um servidor (a leitura de um membro, com o token do bot).
    const memberOf = deps.member ?? ((guildId, userId) => discordApi().member(guildId, userId));

    const limiter = new RateLimiter();
    const origins = new Set(config.origins);
    const redirects = new Set(config.redirects);

    // O endereço que o pedido diz ter vindo da Cloudflare só vale se ela mesma o entregou (veja clientIp).
    const verifyCloudflare = config.verifyCloudflare !== false;
    const isCloudflare = createCloudflareMatcher(config.cloudflareRanges ?? []);

    // ----------------------------------
    // utilidades
    // ----------------------------------

    // O IP do visitante, conforme HELENA_WEB_TRUST_PROXY (veja trustProxyMode):
    //
    // "cloudflare": vale CF-Connecting-IP, MAS só se o pedido veio mesmo da Cloudflare. Conferido no
    // Discloud, que fica atrás dela: o X-Forwarded-For e o X-Real-IP chegam sobrescritos com o IP da
    // BORDA da Cloudflare (todos os visitantes pareceriam o mesmo), e forjar o CF-Connecting-IP é
    // barrado pela própria Cloudflare (403). Mas quem alcançasse o app por outro caminho, sem passar
    // por ela, escreveria o que quisesse nesse cabeçalho e trocaria de "IP" a cada pedido, escapando
    // dos limites. Por isso o cabeçalho só é lido quando QUEM FALOU COM O PROXY está nas faixas da
    // Cloudflare (config/cloudflare-ips.mjs): esse endereço o proxy da hospedagem escreve, o visitante
    // não. Veja cameThroughCloudflare.
    //
    // 1: o IP é o ÚLTIMO valor de X-Forwarded-For, o endereço que o proxy mais
    // próximo viu. O primeiro valor quem manda é o próprio visitante (com um IP novo
    // a cada pedido ele nunca chegaria ao limite).
    //
    // Sem o cabeçalho esperado, vale o endereço da conexão.

    // Quem falou com o proxy da hospedagem: o último valor do X-Forwarded-For (que o proxy
    // escreve) ou, sem ele, o endereço da própria conexão.
    function peerOf(req) {
        const hops = String(req.headers["x-forwarded-for"] ?? "").split(",").map(hop => hop.trim()).filter(Boolean);

        return hops.length
            ? { ip: hops[hops.length - 1].slice(0, 64), viaProxy: true }
            : { ip: req.socket.remoteAddress ?? "", viaProxy: false };
    }

    // O pedido passou pela Cloudflare? Sim se quem chegou ao proxy está nas faixas dela. Sem proxy
    // nenhum no meio, falando pelo próprio computador (o túnel do cloudflared), também: só algo
    // instalado na máquina chega por ali.
    function cameThroughCloudflare(req) {
        if (!verifyCloudflare) {
            return true;
        }

        const peer = peerOf(req);

        return isCloudflare(peer.ip) || (!peer.viaProxy && isLoopback(peer.ip));
    }

    // O aviso de um CF-Connecting-IP que não veio da Cloudflare: uma vez por endereço (no máximo 20),
    // para uma enxurrada não encher o log. Se for a própria Cloudflare com uma faixa nova, o aviso diz
    // onde cadastrar.
    const distrusted = new Set();

    function warnDistrusted(peerIp) {
        if (distrusted.has(peerIp) || distrusted.size >= 20) {
            return;
        }

        distrusted.add(peerIp);

        console.warn(
            `[WEB] CF-Connecting-IP ignorado: o pedido veio de ${peerIp || "?"}, que não está nas faixas da Cloudflare. ` +
            "Valeu o endereço de quem chegou. Se for a própria Cloudflare (faixa nova), acrescente a faixa em HELENA_WEB_CLOUDFLARE_IPS."
        );
    }

    function clientIp(req) {
        let ip = req.socket.remoteAddress ?? "";

        let attested = null;

        if (config.trustProxy === "cloudflare") {
            const real = String(req.headers["cf-connecting-ip"] ?? "").trim();

            attested = cameThroughCloudflare(req);

            if (attested) {
                // só algo com cara de IP (v4 ou v6)
                if (/^[0-9a-fA-F:.]{3,45}$/.test(real)) {
                    ip = real;
                }

            } else {
                // não veio da Cloudflare: o cabeçalho é de quem quiser, e vale quem chegou ao proxy
                const peer = peerOf(req);

                if (peer.ip) {
                    ip = peer.ip;
                }

                if (real) {
                    warnDistrusted(peer.ip);
                }
            }

        } else if (config.trustProxy) {
            const hops = String(req.headers["x-forwarded-for"] ?? "").split(",");
            const forwarded = hops[hops.length - 1].trim();

            if (forwarded) {
                ip = forwarded.slice(0, 64);
            }
        }

        debugIpOnce(req, ip, attested);

        return ip;
    }

    // HELENA_WEB_DEBUG_IP=1 mostra no log, uma vez por IP (no máximo 20), o que a
    // API enxergou: serve para conferir, na hospedagem, se o IP real está chegando.
    const seenIps = new Set();

    function debugIpOnce(req, ip, attested = null) {
        if (!config.debugIp || seenIps.has(ip) || seenIps.size >= 20) {
            return;
        }

        seenIps.add(ip);

        console.log(
            `[WEB] IP visto: ${ip} | conexão=${req.socket.remoteAddress ?? ""} | ` +
            `x-forwarded-for="${String(req.headers["x-forwarded-for"] ?? "").slice(0, 120)}" | ` +
            `x-real-ip="${String(req.headers["x-real-ip"] ?? "").slice(0, 64)}"` +
            (attested === null ? "" : ` | veio-da-cloudflare=${attested ? "sim" : "nao"}`)
        );
    }

    function limit(key, rule) {
        const result = limiter.hit(key, rule, now());

        if (!result.ok) {
            throw new HttpError(429, "too_many_requests", {
                retryAfter: result.retryAfter
            });
        }
    }

    async function upstream(url, init) {
        return fetchImpl(url, {
            ...init,
            signal: AbortSignal.timeout(WEB_CONFIG.upstreamTimeoutMs)
        });
    }

    // O nome do erro que o Discord devolve ({ "error": "invalid_grant" } nas rotas do
    // token, ou { "message": "...", "code": 0 } nas demais), só para o log. Nunca lança e só deixa passar letras e "_", então nada de
    // dentro da resposta vai parar no log.
    async function oauthError(response) {
        try {
            const body = await response.json();

            return [body?.error, body?.code].find(name => typeof name === "string" && /^[a-z_]{1,40}$/.test(name)) ?? "";
        } catch {
            return "";
        }
    }

    // O que o Discord disse sobre o acesso que emitiu, SEM o token, para o log de quando
    // a conta é recusada (validade e escopo mostram se o acesso já nasce vencido).
    function describeGrant(tokens) {
        const plain = value => String(value ?? "").replace(/[^\w .:,-]/g, "").slice(0, 60);

        return `tipo=${plain(tokens?.token_type)} validade=${plain(tokens?.expires_in)} escopo="${plain(tokens?.scope)}" renovação=${Boolean(tokens?.refresh_token)}`;
    }

    // Uma marca curta do código de login (não dá para recuperar o código a partir dela):
    // se a mesma marca aparecer duas vezes no log, o código foi usado duas vezes.
    const codeTag = code => createHash("sha256").update(code).digest("hex").slice(0, 8);

    function logClaim({ userId, kind, guildId = null, ok, detail = "", req }) {
        db.prepare(`
            INSERT INTO web_claim_log (
                user_id, kind, guild_id, ok, detail, ip, user_agent, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            userId,
            kind,
            guildId,
            ok ? 1 : 0,
            String(detail).slice(0, 200),
            clientIp(req),
            String(req.headers["user-agent"] ?? "").slice(0, 200),
            now()
        );
    }

    // ----------------------------------
    // corpo da requisição
    // ----------------------------------

    function readJson(req) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            let size = 0;

            let tooBig = false;

            req.on("data", chunk => {
                if (tooBig) {
                    return;
                }

                size += chunk.length;

                if (size > WEB_CONFIG.maxBodyBytes) {
                    // Para de guardar e responde 413. A conexão é fechada
                    // depois da resposta (veja send), não antes dela.
                    tooBig = true;
                    chunks.length = 0;

                    reject(new HttpError(413, "body_too_large"));

                    return;
                }

                chunks.push(chunk);
            });

            req.on("end", () => {
                if (size === 0) {
                    resolve({});

                    return;
                }

                try {
                    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));

                    if (!body || typeof body !== "object" || Array.isArray(body)) {
                        throw new Error("não é um objeto");
                    }

                    resolve(body);

                } catch {
                    reject(new HttpError(400, "invalid_json"));
                }
            });

            req.on("error", () => reject(new HttpError(400, "invalid_request")));
        });
    }

    // ----------------------------------
    // sessão
    // ----------------------------------

    function sessionFrom(req) {
        // Antes de olhar o banco: quem manda token falso em enxurrada também esbarra no limite
        // (cada pedido gasta um hash e uma consulta), sem precisar de uma sessão válida.
        limit("ip:auth:" + clientIp(req), WEB_CONFIG.limits.auth);

        const match = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(
            String(req.headers.authorization ?? "")
        );

        if (!match) {
            throw new HttpError(401, "unauthorized");
        }

        const tokenHash = hashToken(match[1]);

        const row = db.prepare(`
            SELECT *
            FROM web_sessions
            WHERE token_hash = ?
        `).get(tokenHash);

        if (!row) {
            throw new HttpError(401, "unauthorized");
        }

        if (row.expires_at <= now()) {
            db.prepare("DELETE FROM web_sessions WHERE token_hash = ?").run(tokenHash);

            throw new HttpError(401, "session_expired");
        }

        return {
            tokenHash,
            userId: row.user_id,
            username: row.username,
            displayName: row.display_name,
            avatarUrl: row.avatar_url,
            guilds: JSON.parse(row.guilds_json),
            expiresAt: row.expires_at
        };
    }

    // A mesma regra do bot (helena.mjs): manutenção e bloqueio valem no site também. O dono passa.
    // "entry" ({ kind, guildId, req }) registra a recusa no histórico de coletas; sem ele (a leitura
    // do painel, que se repete) só recusa.
    function ensureAllowed(userId, entry = null) {
        if (isOwner(userId)) {
            return;
        }

        const reason = maintenance() ? "maintenance" : blocked(userId) ? "blocked" : "";

        if (!reason) {
            return;
        }

        if (entry) {
            logClaim({ userId, kind: entry.kind, guildId: entry.guildId ?? null, ok: false, detail: reason, req: entry.req });
        }

        throw new HttpError(reason === "maintenance" ? 503 : 403, reason);
    }

    // A lista de servidores é a do login (vale até a sessão acabar). Quem saiu do servidor, ou foi
    // expulso, não coleta o daily dele: pergunta ao Discord na hora. Só um "não é membro" claro (404)
    // recusa; se o Discord não responder, vale o que já se sabia (a coleta tem recarga de 24 h de
    // qualquer jeito, e uma pane do Discord não deve travar todo mundo).
    async function stillMember(guildId, userId) {
        try {
            await memberOf(guildId, userId);

            return true;

        } catch (error) {
            if (error?.status === 404) {
                return false;
            }

            console.warn(`[WEB] Não consegui conferir se a pessoa ainda está no servidor ${guildId}: ${String(error?.message ?? error).slice(0, 120)}`);

            return true;
        }
    }

    function publicUser(session) {
        return {
            id: session.userId,
            username: session.username,
            displayName: session.displayName,
            avatarUrl: session.avatarUrl
        };
    }

    // ----------------------------------
    // anti-robô (Cloudflare Turnstile)
    // ----------------------------------

    async function checkCaptcha(body, req) {
        if (!config.turnstileSecret) {
            return;
        }

        const token = typeof body.turnstile === "string" ? body.turnstile : "";

        if (!token || token.length > 2048) {
            throw new HttpError(400, "captcha_required");
        }

        let verdict;

        try {
            const response = await upstream(WEB_CONFIG.turnstileVerifyUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    secret: config.turnstileSecret,
                    response: token,
                    remoteip: clientIp(req)
                })
            });

            verdict = await response.json();

        } catch (error) {
            console.warn("[WEB] Turnstile indisponível:", error.message);

            throw new HttpError(503, "captcha_unavailable");
        }

        if (!verdict?.success) {
            throw new HttpError(403, "captcha_failed");
        }
    }

    // ----------------------------------
    // POST /api/auth/login
    // ----------------------------------

    async function login(req) {
        limit("ip:login:" + clientIp(req), WEB_CONFIG.limits.login);

        const body = await readJson(req);

        const code = typeof body.code === "string" ? body.code : "";
        const verifier = typeof body.codeVerifier === "string" ? body.codeVerifier : "";
        const redirectUri = typeof body.redirectUri === "string" ? body.redirectUri : "";

        if (!code || code.length > 512) {
            throw new HttpError(400, "invalid_code");
        }

        // O "verifier" do PKCE tem de 43 a 128 caracteres desse conjunto.
        if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) {
            throw new HttpError(400, "invalid_verifier");
        }

        // Só aceitamos os endereços de retorno cadastrados, escritos igual.
        if (!redirects.has(redirectUri)) {
            throw new HttpError(400, "invalid_redirect");
        }

        // 1. troca do código
        const exchange = new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            client_id: config.clientId,
            code_verifier: verifier
        });

        if (config.clientSecret) {
            exchange.set("client_secret", config.clientSecret);
        }

        let tokens;

        try {
            const response = await upstream(`${WEB_CONFIG.discordApi}/oauth2/token`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: exchange
            });

            if (!response.ok) {
                const reason = await oauthError(response);
                const shown = reason || `HTTP ${response.status}`;

                // 429 e 5xx: o problema é do Discord, não da pessoa. Vale tentar depois.
                if (response.status === 429 || response.status >= 500) {
                    console.warn(`[WEB] Discord com problema na troca do código: ${shown} (marca ${codeTag(code)})`);

                    throw new HttpError(502, "discord_unavailable");
                }

                // invalid_grant é o normal (código vencido ou já usado: a pessoa entra de
                // novo). Qualquer outro nome é erro NOSSO e a pessoa não tem como resolver.
                console.warn(
                    `[WEB] Discord recusou a troca do código: ${shown} (marca ${codeTag(code)})` +
                    (reason && reason !== "invalid_grant"
                        ? " (confira HELENA_OAUTH_CLIENT_ID, HELENA_OAUTH_CLIENT_SECRET e HELENA_OAUTH_REDIRECTS)"
                        : "")
                );

                throw new HttpError(401, "login_failed", { detail: `troca:${reason || response.status}` });
            }

            tokens = await response.json();

        } catch (error) {
            if (error instanceof HttpError) throw error;

            console.warn("[WEB] Discord indisponível na troca do código:", error.message);

            throw new HttpError(502, "discord_unavailable");
        }

        const accessToken = typeof tokens?.access_token === "string" ? tokens.access_token : "";

        if (!accessToken) {
            console.warn(`[WEB] O Discord aceitou a troca do código, mas não devolveu o acesso (marca ${codeTag(code)}).`);

            throw new HttpError(401, "login_failed", { detail: "troca:sem_acesso" });
        }

        const auth = { Authorization: `Bearer ${accessToken}` };

        let user;
        let guilds = [];

        try {
            // 2. quem é a pessoa. Se o Discord responder 401 logo depois de emitir o acesso, espera um
            //    pouco e pergunta de novo antes de desistir.
            let identity = await upstream(`${WEB_CONFIG.discordApi}/users/@me`, { headers: auth });
            let attempts = 1;

            for (const pause of WEB_CONFIG.userinfoRetryMs) {
                if (identity.status !== 401) break;

                await sleep(pause);

                identity = await upstream(`${WEB_CONFIG.discordApi}/users/@me`, { headers: auth });
                attempts++;
            }

            if (!identity.ok) {
                const reason = await oauthError(identity);

                console.warn(
                    `[WEB] O Discord recusou ler a conta da pessoa: ${reason || `HTTP ${identity.status}`} ` +
                    `(${attempts} ${attempts === 1 ? "tentativa" : "tentativas"}; acesso emitido: ${describeGrant(tokens)}; marca ${codeTag(code)})`
                );

                throw new HttpError(401, "login_failed", { detail: `conta:${reason || identity.status}` });
            }

            if (attempts > 1) {
                console.warn(`[WEB] O Discord só liberou a conta na tentativa ${attempts} (marca ${codeTag(code)}).`);
            }

            user = await identity.json();

            // 3. servidores (sem o escopo "guilds" a lista vem vazia)
            const owned = await upstream(`${WEB_CONFIG.discordApi}/users/@me/guilds`, { headers: auth });

            if (owned.ok) {
                const data = await owned.json();

                guilds = Array.isArray(data) ? data : (data?.guilds ?? []);
            }

        } catch (error) {
            if (error instanceof HttpError) throw error;

            console.warn("[WEB] Discord indisponível ao ler a conta:", error.message);

            throw new HttpError(502, "discord_unavailable");

        } finally {
            // 4. não precisamos mais do acesso do Discord: devolvemos já.
            //    A sessão da Helena vale por conta própria. A revogação também
            //    exige o cliente (client_id e, se houver, client_secret), como a troca.
            for (const token of [accessToken, tokens?.refresh_token]) {
                if (typeof token === "string" && token) {
                    const revoke = new URLSearchParams({ token, client_id: config.clientId });

                    if (config.clientSecret) {
                        revoke.set("client_secret", config.clientSecret);
                    }

                    upstream(`${WEB_CONFIG.discordApi}/oauth2/token/revoke`, {
                        method: "POST",
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        body: revoke
                    })
                        .then(async response => {
                            if (!response.ok) {
                                console.warn(`[WEB] Discord não revogou o acesso: ${await oauthError(response) || `HTTP ${response.status}`}`);
                            }
                        })
                        .catch(() => {});
                }
            }
        }

        // O Discord devolve a conta como { id, username, global_name, avatar }: vira o formato da sessão.
        user = {
            id: user?.id,
            username: user?.username,
            displayName: user?.global_name ?? user?.username,
            avatarUrl: user?.id && user?.avatar ? discordAvatar(user) : null
        };

        const userId = String(user?.id ?? "");

        if (!/^[\w-]{1,64}$/.test(userId)) {
            console.warn("[WEB] O Discord devolveu uma conta sem identificador válido.");

            throw new HttpError(401, "login_failed", { detail: "conta:sem_id" });
        }

        // Bloqueado (ou em manutenção) nem entra: não cria sessão.
        ensureAllowed(userId, { kind: "login", req });

        // Só os servidores em que a Helena também está.
        const mutual = guilds
            .filter(guild => guild && guild.id !== undefined && knowsGuild(guild.id))
            .slice(0, WEB_CONFIG.maxGuilds)
            .map(guild => ({
                id: String(guild.id),
                name: String(guild.name ?? "").slice(0, 100),
                icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : null
            }));

        // 5. sessão da Helena
        const token = randomBytes(32).toString("base64url");
        const created = now();

        // Cada pessoa mantém poucas sessões: ao passar do limite, as mais
        // antigas saem (login repetido não acumula sessões à toa).
        db.prepare(`
            DELETE FROM web_sessions
            WHERE user_id = ?
              AND token_hash NOT IN (
                  SELECT token_hash
                  FROM web_sessions
                  WHERE user_id = ?
                  ORDER BY created_at DESC, rowid DESC
                  LIMIT ?
              )
        `).run(userId, userId, WEB_CONFIG.maxSessionsPerUser - 1);

        db.prepare(`
            INSERT INTO web_sessions (
                token_hash, user_id, username, display_name, avatar_url,
                guilds_json, created_at, expires_at, ip, user_agent
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            hashToken(token),
            userId,
            String(user.username ?? "").slice(0, 64),
            String(user.displayName ?? user.username ?? "").slice(0, 64),
            typeof user.avatarUrl === "string" ? user.avatarUrl.slice(0, 500) : null,
            JSON.stringify(mutual),
            created,
            created + WEB_CONFIG.sessionTtl,
            clientIp(req),
            String(req.headers["user-agent"] ?? "").slice(0, 200)
        );

        logClaim({ userId, kind: "login", ok: true, detail: `${mutual.length} servidores`, req });

        return {
            status: 200,
            body: {
                token,
                expiresAt: created + WEB_CONFIG.sessionTtl,
                user: {
                    id: userId,
                    username: String(user.username ?? ""),
                    displayName: String(user.displayName ?? user.username ?? ""),
                    avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : null
                }
            }
        };
    }

    // ----------------------------------
    // POST /api/auth/logout
    // ----------------------------------

    function logout(req) {
        const session = sessionFrom(req);

        db.prepare("DELETE FROM web_sessions WHERE token_hash = ?").run(session.tokenHash);

        logClaim({ userId: session.userId, kind: "logout", ok: true, req });

        return { status: 200, body: { ok: true } };
    }

    // ----------------------------------
    // GET /api/me
    // ----------------------------------

    function me(req) {
        const session = sessionFrom(req);

        ensureAllowed(session.userId);

        limit("user:read:" + session.userId, WEB_CONFIG.limits.read);

        const time = now();

        const guilds = session.guilds
            // se a Helena saiu do servidor desde o login, ele some da lista
            .filter(guild => knowsGuild(guild.id))
            .map(guild => {
                const player = db.prepare(`
                    SELECT wallet, bank, level
                    FROM players
                    WHERE guild_id = ?
                      AND user_id = ?
                `).get(guild.id, session.userId);

                const prison = PRISON_BLOCKED_COMMANDS.has("daily")
                    ? getPrison(guild.id, session.userId, time)
                    : null;

                return {
                    id: guild.id,
                    name: guild.name,
                    icon: guild.icon,
                    player: player ? { ...player } : null,
                    daily: getDailyStatus(guild.id, session.userId, time),
                    prison: prison ? { remaining: prison.remaining } : null
                };
            });

        const gems = getGemBonusStatus(session.userId, time);

        return {
            status: 200,
            body: {
                user: publicUser(session),
                expiresAt: session.expiresAt,
                captcha: Boolean(config.turnstileSecret),
                gems: {
                    balance: gems.gems,
                    available: gems.available,
                    remaining: gems.remaining,
                    min: GEM_BONUS.min,
                    max: GEM_BONUS.max,
                    cooldown: GEM_BONUS.cooldown
                },
                // A escada de 7 dias do daily (o prêmio de cada dia do ciclo, em centavos) e a
                // recarga, para o painel desenhar a sequência com os números reais do bot.
                daily: {
                    cooldown: DAILY_CONFIG.cooldown,
                    ladder: [1, 2, 3, 4, 5, 6, 7].map(day => calculateReward(day).total)
                },
                guilds
            }
        };
    }

    // ----------------------------------
    // POST /api/claim/daily
    // ----------------------------------

    async function claimDailyRoute(req) {
        const session = sessionFrom(req);

        limit("ip:claim:" + clientIp(req), WEB_CONFIG.limits.claim);
        limit("user:claim:" + session.userId, WEB_CONFIG.limits.claim);

        // depois dos limites: quem insiste bloqueado não enche o histórico
        ensureAllowed(session.userId, { kind: "daily", req });

        const body = await readJson(req);

        const guildId = typeof body.guildId === "string" ? body.guildId : "";

        // Só servidores vistos no login, em que a Helena ainda está.
        if (!session.guilds.some(guild => guild.id === guildId) || !knowsGuild(guildId)) {
            throw new HttpError(403, "guild_not_allowed");
        }

        await checkCaptcha(body, req);

        // A lista de servidores é a do login: quem saiu (ou foi expulso) desde então não coleta.
        if (!(await stillMember(guildId, session.userId))) {
            logClaim({ userId: session.userId, kind: "daily", guildId, ok: false, detail: "not_member", req });

            throw new HttpError(403, "guild_not_allowed");
        }

        const time = now();

        // Mesma regra do comando: preso não resgata.
        if (PRISON_BLOCKED_COMMANDS.has("daily")) {
            const prison = getPrison(guildId, session.userId, time);

            if (prison) {
                logClaim({ userId: session.userId, kind: "daily", guildId, ok: false, detail: "prison", req });

                throw new HttpError(409, "prison", { remaining: prison.remaining });
            }
        }

        const result = claimDaily(guildId, session.userId, time);

        if (result.status === "claimed") {
            logClaim({
                userId: session.userId,
                kind: "daily",
                guildId,
                ok: true,
                detail: `dia ${result.streak}, ${result.reward.total}`,
                req
            });

            return {
                status: 200,
                body: {
                    status: "claimed",
                    reward: result.reward,
                    streak: result.streak,
                    bestStreak: result.bestStreak,
                    wallet: result.wallet,
                    daily: getDailyStatus(guildId, session.userId, time)
                }
            };
        }

        logClaim({ userId: session.userId, kind: "daily", guildId, ok: false, detail: result.status, req });

        if (result.status === "cooldown") {
            throw new HttpError(409, "cooldown", {
                remaining: result.remaining,
                streak: result.streak,
                bestStreak: result.bestStreak
            });
        }

        throw new HttpError(409, result.status);
    }

    // ----------------------------------
    // POST /api/claim/gems
    // ----------------------------------

    async function claimGemsRoute(req) {
        const session = sessionFrom(req);

        limit("ip:claim:" + clientIp(req), WEB_CONFIG.limits.claim);
        limit("user:claim:" + session.userId, WEB_CONFIG.limits.claim);

        ensureAllowed(session.userId, { kind: "gems", req });

        const body = await readJson(req);

        await checkCaptcha(body, req);

        const result = claimGemBonus(session.userId, { now: now(), random });

        if (result.status === "claimed") {
            logClaim({ userId: session.userId, kind: "gems", ok: true, detail: `+${result.amount}`, req });

            return {
                status: 200,
                body: {
                    status: "claimed",
                    amount: result.amount,
                    balance: result.gems,
                    remaining: result.remaining
                }
            };
        }

        logClaim({ userId: session.userId, kind: "gems", ok: false, detail: "cooldown", req });

        throw new HttpError(409, "cooldown", {
            remaining: result.remaining,
            balance: result.gems
        });
    }

    // ----------------------------------
    // roteador
    // ----------------------------------

    const routes = {
        "GET /api/health": () => ({ status: 200, body: { ok: true } }),
        "POST /api/auth/login": login,
        "POST /api/auth/logout": logout,
        "GET /api/me": me,
        "POST /api/claim/daily": claimDailyRoute,
        "POST /api/claim/gems": claimGemsRoute
    };

    function corsHeaders(origin) {
        if (!origin || !origins.has(origin)) {
            return {};
        }

        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Headers": "authorization, content-type",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Max-Age": "600",
            Vary: "Origin"
        };
    }

    function send(res, status, body, extra = {}) {
        const headers = { ...JSON_HEADERS, ...extra };

        // Corpo grande demais: responde e fecha a conexão, sem ler o resto.
        if (status === 413) {
            headers.Connection = "close";

            res.once("finish", () => res.req.destroy());
        }

        res.writeHead(status, headers);
        res.end(JSON.stringify(body));
    }

    async function handle(req, res) {
        const origin = req.headers.origin;
        const cors = corsHeaders(origin);

        try {
            const path = new URL(req.url, "http://localhost").pathname;

            // Um site que não está na lista nunca consegue falar com a API
            // pelo navegador (sem Access-Control-Allow-Origin ele nem lê a resposta).
            // Aqui recusamos também, para não executar nada em nome dele.
            if (origin && !origins.has(origin)) {
                throw new HttpError(403, "origin_not_allowed");
            }

            if (req.method === "OPTIONS") {
                res.writeHead(204, { ...cors, "Cache-Control": "no-store" });
                res.end();

                return;
            }

            const route = routes[`${req.method} ${path}`];

            if (!route) {
                throw new HttpError(404, "not_found");
            }

            const result = await route(req);

            send(res, result.status, result.body, cors);

        } catch (error) {
            if (error instanceof HttpError) {
                const extra = { ...cors };

                if (error.status === 429) {
                    extra["Retry-After"] = String(error.extra.retryAfter ?? 60);
                }

                send(res, error.status, { error: error.code, ...error.extra }, extra);

                return;
            }

            console.error("[WEB]", error);

            send(res, 500, { error: "internal" }, cors);
        }
    }

    // Apaga as sessões vencidas, o registro de coletas antigo e os contadores.
    function cleanup() {
        const time = now();

        db.prepare("DELETE FROM web_sessions WHERE expires_at <= ?").run(time);

        db.prepare("DELETE FROM web_claim_log WHERE created_at <= ?")
            .run(time - WEB_CONFIG.claimLogDays * 24 * 60 * 60);

        const longest = Math.max(
            ...Object.values(WEB_CONFIG.limits).map(rule => rule.windowSeconds)
        );

        limiter.prune(time, longest);
    }

    return { handle, cleanup };
}

// ==========================================
// HTTPS OBRIGATÓRIO
// ==========================================

// Um ano. Sem includeSubDomains nem preload: vale só para este endereço.
export const HSTS = "max-age=31536000";

// Atrás de um proxy confiável: a resposta por https leva HSTS (o navegador passa a ir direto por https) e
// quem chega por http é mandado para https. Devolve true se já respondeu.
//
// O destino do redirecionamento só pode ser um nome que o dono cadastrou em HELENA_WEB_ORIGINS: o Host
// vem do visitante e nunca vira endereço sem conferir.
export function enforceHttps(req, res, config) {
    if (!config.forceHttps) {
        return false;
    }

    const scheme = visitorScheme(req.headers, config.trustProxy);

    if (scheme === "https") {
        res.setHeader("Strict-Transport-Security", HSTS);

        return false;
    }

    if (scheme !== "http") {
        return false;
    }

    const host = String(req.headers.host ?? "").trim().toLowerCase();

    if (!config.origins.some(origin => origin.toLowerCase() === `https://${host}`)) {
        return false;
    }

    // Quem manda dados por http já os expôs: não adianta redirecionar o pedido, só recusar.
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(403, JSON_HEADERS);
        res.end(JSON.stringify({ error: "https_required" }));

        return true;
    }

    const target = String(req.url ?? "").startsWith("/") ? req.url : "/";

    res.writeHead(301, { Location: `https://${host}${target}`, "Cache-Control": "public, max-age=3600" });
    res.end();

    return true;
}

// ==========================================
// SERVIDOR HTTP
// ==========================================

let running = null;

// Liga a API, se estiver configurada. Devolve { port, close } ou null.
export async function startWebApi(env = process.env, deps = {}) {
    const config = loadWebConfig(env);

    if (!config.enabled) {
        console.log(`[WEB] API do site desligada (${config.reason}).`);

        return null;
    }

    if (!config.turnstileSecret) {
        console.warn(
            "[WEB] Sem HELENA_TURNSTILE_SECRET: as coletas ficam SEM verificação anti-robô."
        );
    }

    if (config.cloudflareInvalid.length) {
        console.warn(
            `[WEB] HELENA_WEB_CLOUDFLARE_IPS: ignorei o que não é uma faixa válida (use algo como 203.0.113.0/24): ${config.cloudflareInvalid.join(", ")}`
        );
    }

    if (config.trustProxy === "cloudflare" && !config.verifyCloudflare) {
        console.warn(
            "[WEB] HELENA_WEB_VERIFY_CLOUDFLARE=off: o CF-Connecting-IP vale sem conferir de onde o pedido veio. " +
            "Só é seguro se o app for alcançável SOMENTE pela Cloudflare."
        );
    }

    const api = createWebApi(config, deps);

    // O site (site-dist/, que vai no zip do Discloud) é servido pelo mesmo servidor, na raiz; a API fica
    // em /api. Sem a pasta, só a API responde, como antes.
    const site = await createStaticSite({
        root: deps.siteDir ?? env.HELENA_SITE_DIR ?? fileURLToPath(new URL("../../site-dist/", import.meta.url))
    });

    console.log(site.enabled
        ? `[WEB] Site servido de ${site.root}`
        : "[WEB] Sem a pasta do site (site-dist): só a API responde.");

    const server = http.createServer(async (req, res) => {
        if (enforceHttps(req, res, config)) {
            return;
        }

        try {
            if (await site.serve(req, res)) {
                return;
            }

        } catch (error) {
            console.error("[WEB] Erro ao servir o site:", error);

            if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
            }

            res.end();

            return;
        }

        api.handle(req, res);
    });

    // Conexões lentas não seguram a API.
    server.headersTimeout = 10_000;
    server.requestTimeout = 15_000;

    try {
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(config.port, config.host, resolve);
        });

    } catch (error) {
        console.error(`[WEB] Não foi possível ouvir em ${config.host}:${config.port}:`, error.message);

        return null;
    }

    const timer = setInterval(api.cleanup, WEB_CONFIG.cleanupSeconds * 1000);

    timer.unref();

    const address = server.address();

    console.log(`[WEB] API do site ouvindo em http://${config.host}:${address.port}`);

    running = {
        port: address.port,

        close: () => new Promise(resolve => {
            clearInterval(timer);
            server.close(() => resolve());
            server.closeAllConnections?.();
        })
    };

    return running;
}

export async function stopWebApi() {
    if (running) {
        await running.close();
        running = null;
    }
}
