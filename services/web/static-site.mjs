import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";

// ==========================================
// O SITE, SERVIDO PELO PRÓPRIO BOT
// ==========================================

// O site (a pasta site/dist, já montada pelo Astro) vai no zip do Discloud como site-dist/ e o servidor
// HTTP do bot o entrega na raiz do endereço (https://helena.discloud.dev/), ao lado da API (/api/...).
// Só lê arquivos de uma pasta, só aceita GET e HEAD, nunca sai dela e não lista pastas. Sem a pasta
// (o bot de teste, ou quem roda sem o site) nada muda: o servidor responde só a API, como antes.

const TYPES = Object.freeze({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".wasm": "application/wasm",
    ".map": "application/json; charset=utf-8",

    // a busca da wiki (Pagefind): o índice e os pedaços são binários
    ".pagefind": "application/octet-stream",
    ".pf_meta": "application/octet-stream",
    ".pf_index": "application/octet-stream",
    ".pf_fragment": "application/octet-stream"
});

const BASE_HEADERS = Object.freeze({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY"
});

// O que o navegador pode guardar: o HTML sempre confere de novo; os arquivos com código no nome
// (assets/…) nunca mudam; o resto vale uma hora.
function cacheControl(pathname, type) {
    if (type.startsWith("text/html")) return "no-cache";
    if (pathname.startsWith("/assets/")) return "public, max-age=31536000, immutable";

    return "public, max-age=3600";
}

// "/wiki/start/jobs/" -> "wiki/start/jobs". Devolve null se o endereço for inválido ou tentar sair da pasta.
function safeRelative(rawPath) {
    let decoded;

    try {
        decoded = decodeURIComponent(rawPath);

    } catch {
        return null;
    }

    if (decoded.includes("\0") || decoded.includes("\\")) {
        return null;
    }

    const parts = decoded.split("/").filter(Boolean);

    // ".." sobe de pasta e arquivo escondido (.env, .git) nunca sai; só o .well-known é público
    for (const part of parts) {
        if (part === ".." || part === ".") return null;
        if (part.startsWith(".") && part !== ".well-known") return null;
    }

    return parts.join("/");
}

async function statFile(file) {
    try {
        const info = await stat(file);

        return info.isFile() ? info : null;

    } catch {
        return null;
    }
}

async function isDirectory(dir) {
    try {
        return (await stat(dir)).isDirectory();

    } catch {
        return false;
    }
}

/**
 * Cria o servidor de arquivos do site.
 *
 *   root   a pasta com o site montado (index.html, wiki/, assets/ ...)
 *
 * Devolve { enabled, serve(req, res) }. serve devolve true se respondeu (um arquivo, o redirecionamento
 * para a barra do fim, a página 404 ou o 405) e false se não é com ele (o servidor segue para a API).
 */
export async function createStaticSite({ root } = {}) {
    const base = root ? path.resolve(root) : null;

    if (!base || !(await isDirectory(base))) {
        return { enabled: false, root: null, serve: async () => false };
    }

    async function send(req, res, status, file, info, pathname) {
        const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";

        const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;

        const headers = {
            ...BASE_HEADERS,
            "Content-Type": type,
            "Cache-Control": status === 404 ? "no-cache" : cacheControl(pathname, type),
            ETag: etag,
            "Last-Modified": info.mtime.toUTCString()
        };

        if (status === 200 && req.headers["if-none-match"] === etag) {
            res.writeHead(304, headers);
            res.end();

            return;
        }

        res.writeHead(status, { ...headers, "Content-Length": info.size });

        if (req.method === "HEAD") {
            res.end();

            return;
        }

        try {
            await pipeline(createReadStream(file), res);

        } catch {
            // o navegador desistiu no meio (aba fechada): não é erro do bot
            res.destroy();
        }
    }

    async function notFound(req, res) {
        const file = path.join(base, "404.html");

        const info = await statFile(file);

        if (info) {
            await send(req, res, 404, file, info, "/404.html");

            return;
        }

        const body = "Página não encontrada.";

        res.writeHead(404, { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
        res.end(req.method === "HEAD" ? undefined : body);
    }

    async function serve(req, res) {
        const url = new URL(req.url, "http://localhost");

        // a API é com o outro roteador
        if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
            return false;
        }

        if (req.method !== "GET" && req.method !== "HEAD") {
            // OPTIONS e POST sem rota vão para o roteador da API (que recusa com o erro de sempre)
            return false;
        }

        const relative = safeRelative(url.pathname);

        if (relative === null) {
            res.writeHead(400, { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8" });
            res.end("Endereço inválido.");

            return true;
        }

        const wantsDirectory = url.pathname.endsWith("/") || relative === "";

        const target = path.join(base, relative);

        // nunca sai da pasta do site, mesmo que algo escape do filtro acima
        if (target !== base && !target.startsWith(base + path.sep)) {
            res.writeHead(400, { ...BASE_HEADERS, "Content-Type": "text/plain; charset=utf-8" });
            res.end("Endereço inválido.");

            return true;
        }

        // 1) o arquivo exato (assets/app.js, favicon.svg)
        if (!wantsDirectory) {
            const info = await statFile(target);

            if (info) {
                await send(req, res, 200, target, info, `/${relative}`);

                return true;
            }

            // 2) uma página sem a barra do fim (/wiki/start): leva para a com barra, como o Astro gera
            if (await statFile(path.join(target, "index.html"))) {
                res.writeHead(301, { ...BASE_HEADERS, Location: `${url.pathname}/${url.search}`, "Cache-Control": "public, max-age=3600" });
                res.end();

                return true;
            }

            await notFound(req, res);

            return true;
        }

        // 3) a página de uma pasta (/, /wiki/)
        const page = path.join(target, "index.html");

        const info = await statFile(page);

        if (info) {
            await send(req, res, 200, page, info, `/${relative}${relative ? "/" : ""}index.html`);

            return true;
        }

        await notFound(req, res);

        return true;
    }

    return { enabled: true, root: base, serve };
}
