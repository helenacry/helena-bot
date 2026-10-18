
import sharp from "sharp";

import { API_URL } from "../../config/site.mjs";

// ==========================================
// IMAGEM DO AVATAR PARA EMBEDS (/img/avatar.png)
// ==========================================

// O app da VSync desenha a imagem grande de um embed num quadro de, no máximo, 520 px de
// largura com 300 px de altura e "object-fit: cover". Um avatar quadrado vira uma faixa
// cortada no meio (parece achatado). Aqui o avatar é posto INTEIRO e quadrado no centro de uma
// tela 1000x600 (a proporção do quadro), com o próprio avatar desfocado no fundo. A VSync mostra
// essa tela sem cortar nada.
//
// O endereço leva a URL do avatar (?u=). Só vale avatar da CDN da VSync, para a rota não
// virar um proxy de imagens da internet. Nada é gravado em disco: o resultado fica numa memória
// pequena e a Cloudflare (que fica na frente do Discloud) guarda o resto.

export const PREVIEW_PATH = "/img/avatar.png";

export const PREVIEW_SIZE = Object.freeze({ width: 1000, height: 600 });

// Lado do avatar dentro da tela (a altura toda) e o arredondamento dos cantos.
const FACE = PREVIEW_SIZE.height;
const CORNER = 56;

// Só estes endereços são aceitos como origem (a CDN dos avatares da VSync).
export const AVATAR_HOSTS = Object.freeze(["cdn.vsync.lat"]);

const MAX_SOURCE_BYTES = 8_000_000;
const DOWNLOAD_TIMEOUT_MS = 5_000;

const CACHE_MAX = 150;
const CACHE_SECONDS = 60 * 60;
const MAX_ACTIVE = 4;

export function isAvatarSource(value) {
    try {
        const url = new URL(String(value));

        return (
            url.protocol === "https:" &&
            AVATAR_HOSTS.includes(url.hostname) &&
            !url.username &&
            !url.password &&
            String(value).length <= 500
        );

    } catch {
        return false;
    }
}

// O endereço que o embed usa no lugar do avatar cru. null se o avatar não é da CDN da VSync
// (então o embed usa o avatar mesmo, sem a tela larga).
export function avatarPreviewUrl(avatarUrl, base = API_URL) {
    if (!isAvatarSource(avatarUrl) || !base) {
        return null;
    }

    return `${base}${PREVIEW_PATH}?u=${encodeURIComponent(avatarUrl)}`;
}

// A tela 1000x600: o avatar em PNG quadrado de 600 px, com cantos arredondados, no centro de
// uma cópia dele mesmo, ampliada, desfocada e escurecida.
export async function composeAvatar(input) {
    const { width, height } = PREVIEW_SIZE;

    const background = await sharp(input)
        .resize(width, height, { fit: "cover", position: "centre" })
        .blur(32)
        .modulate({ brightness: 0.55 })
        .toBuffer();

    const face = await sharp(input)
        .resize(FACE, FACE, { fit: "cover", position: "centre" })
        .png()
        .toBuffer();

    const mask = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${FACE}" height="${FACE}">` +
        `<rect width="${FACE}" height="${FACE}" rx="${CORNER}" ry="${CORNER}"/></svg>`
    );

    const rounded = await sharp(face)
        .composite([{ input: mask, blend: "dest-in" }])
        .png()
        .toBuffer();

    return sharp(background)
        .composite([{ input: rounded, left: Math.round((width - FACE) / 2), top: 0 }])
        .png()
        .toBuffer();
}

// ==========================================
// A ROTA
// ==========================================

// deps: fetch, now (relógio em segundos) e cacheMax, só para os testes.
export function createAvatarPreview(deps = {}) {
    const fetchImpl = deps.fetch ?? globalThis.fetch;
    const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
    const cacheMax = deps.cacheMax ?? CACHE_MAX;

    const cache = new Map();
    const pending = new Map();

    let active = 0;

    function remember(key, png) {
        cache.set(key, { png, at: now() });

        // sai o mais antigo quando passa do limite
        while (cache.size > cacheMax) {
            cache.delete(cache.keys().next().value);
        }
    }

    async function build(source) {
        const response = await fetchImpl(source, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });

        if (!response.ok) {
            const error = new Error("source_unavailable");

            error.status = 502;

            throw error;
        }

        const input = Buffer.from(await response.arrayBuffer());

        if (input.length === 0 || input.length > MAX_SOURCE_BYTES) {
            const error = new Error("source_too_large");

            error.status = 415;

            throw error;
        }

        return composeAvatar(input);
    }

    // Devolve { status, headers, body } (o corpo é o PNG ou um JSON de erro).
    async function render(source) {
        if (!isAvatarSource(source)) {
            return fail(400, "invalid_source");
        }

        const hit = cache.get(source);

        if (hit && now() - hit.at < CACHE_SECONDS) {
            return ok(hit.png);
        }

        if (active >= MAX_ACTIVE && !pending.has(source)) {
            return fail(503, "busy", { "Retry-After": "2" });
        }

        let job = pending.get(source);

        if (!job) {
            active += 1;

            job = build(source)
                .then(png => {
                    remember(source, png);

                    return png;
                })
                .finally(() => {
                    active -= 1;
                    pending.delete(source);
                });

            pending.set(source, job);
        }

        try {
            return ok(await job);

        } catch (error) {
            console.warn("[AVATAR] Não consegui montar a imagem:", error.message);

            return fail(error.status ?? 502, error.message === "source_too_large" ? "unsupported" : "source_unavailable");
        }
    }

    function ok(png) {
        return {
            status: 200,

            headers: {
                "Content-Type": "image/png",
                "Content-Length": String(png.length),
                // o endereço muda quando o avatar muda, então pode ficar guardado
                "Cache-Control": "public, max-age=86400",
                "X-Content-Type-Options": "nosniff"
            },

            body: png
        };
    }

    function fail(status, code, extra = {}) {
        const body = Buffer.from(JSON.stringify({ error: code }));

        return {
            status,

            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Content-Length": String(body.length),
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                ...extra
            },

            body
        };
    }

    // Atende GET e HEAD de /img/avatar.png?u=<avatar>.
    async function serve(req, res) {
        const source = new URL(req.url, "http://localhost").searchParams.get("u") ?? "";

        const result = await render(source);

        res.writeHead(result.status, result.headers);

        res.end(req.method === "HEAD" ? undefined : result.body);
    }

    return { serve, render, cache };
}
