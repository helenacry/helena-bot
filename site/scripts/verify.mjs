// Portões de qualidade que dispensam navegador. Rode depois do build:
//
//   npm --prefix site run build && npm --prefix site run verify
//
// 1. contraste de cor dos tokens (scripts/contrast.mjs)
// 2. cada página do dist/: título, descrição, canonical, og:image, um h1, lang, imagens com alt
// 3. todo link e âncora interno aponta para algo que existe
// 4. nenhum pedido a terceiros no HTML (fontes, scripts, CSS) além dos que a política cita
// 5. orçamento de peso: JS e CSS (gzip) da home, fontes pré-carregadas, imagens
// 6. sitemap, robots.txt e índice de busca existem
//
// O teste de acessibilidade (axe) e de rolagem lateral roda no navegador: npm --prefix site run test:e2e

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SITE = fileURLToPath(new URL("../", import.meta.url));
const DIST = path.join(SITE, "dist");

if (!existsSync(DIST)) {
  console.error("Falta o build: rode `npm --prefix site run build` antes.");
  process.exit(1);
}

const failures = [];
const fail = message => failures.push(message);
const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`;

// ------------------------------------------------------------ 1. contraste
execFileSync(process.execPath, [path.join(SITE, "scripts", "contrast.mjs")], { stdio: "inherit" });

// ------------------------------------------------------------ páginas
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});

const all = walk(DIST);
const pages = all.filter(file => file.endsWith(".html"));

const astroConfig = readFileSync(path.join(SITE, "astro.config.mjs"), "utf8");
void astroConfig;

const { SITE_URL } = await import(new URL("../../config/site.mjs", import.meta.url));
const site = new URL(SITE_URL);
const base = site.pathname.replace(/\/+$/, "");

const pathOf = file => `/${path.relative(DIST, file).replace(/\\/g, "/")}`.replace(/index\.html$/, "");
const read = file => readFileSync(file, "utf8");

const idsOf = html => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));

const pageIds = new Map(pages.map(file => [pathOf(file), idsOf(read(file))]));

// o que o Astro ou o site pode referenciar fora do HTML
const exists = target => {
  const clean = target.replace(/[?#].*$/, "").replace(base, "") || "/";
  const file = path.join(DIST, clean);

  if (clean.endsWith("/")) return existsSync(path.join(file, "index.html"));
  return existsSync(file) && statSync(file).isFile();
};

// ------------------------------------------------------------ 2 a 4. cada página
const ALLOWED_HOSTS = new Set([
  "vsync.lat", "github.com", "challenges.cloudflare.com", "helena.discloud.dev", site.hostname, "schema.org", "www.w3.org"
]);

let linksChecked = 0;

for (const file of pages) {
  const html = read(file);
  const route = pathOf(file);
  const name = route === "/" ? "/" : route;

  const meta = (attribute, value) => html.match(new RegExp(`<meta[^>]+${attribute}="${value}"[^>]+content="([^"]*)"`))?.[1] ?? html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+${attribute}="${value}"`))?.[1];

  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = meta("name", "description");
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];

  if (!/<html lang="pt-BR"/.test(html)) fail(`${name}: falta lang="pt-BR"`);
  if (!title || title.length > 70) fail(`${name}: título ausente ou longo demais (${title?.length ?? 0})`);
  if (!description || description.length < 40 || description.length > 200) fail(`${name}: descrição ausente ou fora de 40 a 200 caracteres (${description?.length ?? 0})`);
  if (!canonical?.startsWith(site.origin)) fail(`${name}: canonical ausente ou fora do domínio`);
  if (!meta("property", "og:image")) fail(`${name}: falta og:image`);
  if ((html.match(/<h1[ >]/g) ?? []).length !== 1) fail(`${name}: precisa de exatamente um h1`);

  const noindex = /<meta name="robots" content="noindex"/.test(html);
  const mustHide = route === "/account/" || route === "/404.html" || route === "/404/";

  if (mustHide !== noindex) fail(`${name}: noindex ${noindex ? "inesperado" : "ausente"}`);

  for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    // alt vazio (decorativa) é válido e o Preact o escreve como `alt` sozinho
    if (!/\salt(?:=|\s|\/|>)/.test(tag)) fail(`${name}: imagem sem alt: ${tag.slice(0, 80)}`);
    if (!/\swidth=/.test(tag) || !/\sheight=/.test(tag)) fail(`${name}: imagem sem width/height (salto de layout): ${tag.slice(0, 80)}`);
  }

  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(json); } catch { fail(`${name}: JSON-LD inválido`); }
  }

  // links e âncoras. Link de texto (<a>) para fora é escolha de quem clica e vale para qualquer
  // endereço (ex.: a licença do Twemoji); o que o navegador busca sozinho (src, <link>) só pode ir
  // para os domínios que a política de privacidade cita.
  for (const [, tag, attr, value] of html.matchAll(/<(\w+)\b[^>]*?\s(href|src)="([^"]+)"/g)) {
    const userClick = tag === "a";

    if (/^(mailto:|tel:|data:|javascript:)/.test(value)) fail(`${name}: ${attr}="${value.slice(0, 40)}" não deveria existir`);

    if (/^https?:\/\//.test(value)) {
      const host = new URL(value).hostname;

      if (!userClick && !ALLOWED_HOSTS.has(host)) fail(`${name}: <${tag}> busca ${value} em ${host}, que a política não cita`);
      if (host === site.hostname && !value.startsWith(site.origin + base) ) fail(`${name}: link do próprio site sem o subcaminho: ${value}`);
      continue;
    }

    if (value.startsWith("#")) {
      linksChecked++;
      if (value.length > 1 && !idsOf(html).has(decodeURIComponent(value.slice(1)))) fail(`${name}: âncora ${value} não existe na página`);
      continue;
    }

    if (value.startsWith("/")) {
      linksChecked++;
      const [target, anchor] = value.split("#");

      if (base && !target.startsWith(`${base}/`) && target !== base) {
        fail(`${name}: ${attr}="${value}" não passa pelo subcaminho ${base}/`);
        continue;
      }

      if (!exists(target)) {
        fail(`${name}: ${attr}="${value}" aponta para algo que não existe`);
        continue;
      }

      if (anchor && attr === "href") {
        const stripped = target.replace(base, "") || "/";
        const ids = pageIds.get(stripped.endsWith("/") ? stripped : `${stripped}/`);

        if (ids && !ids.has(decodeURIComponent(anchor))) fail(`${name}: ${value}, a âncora não existe no destino`);
      }
    }
  }
}

// ------------------------------------------------------------ 5. peso da home
const gz = file => gzipSync(readFileSync(file)).length;
const distFile = url => path.join(DIST, url.replace(base, ""));

const homeFile = path.join(DIST, "index.html");
const home = read(homeFile);

const scripts = new Set([
  ...[...home.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map(match => match[1]),
  ...[...home.matchAll(/(?:component-url|renderer-url)="([^"]+\.js)"/g)].map(match => match[1])
]);

const styles = new Set([...home.matchAll(/<link rel="stylesheet" href="([^"]+\.css)"/g)].map(match => match[1]));

// as ilhas importam outros módulos: segue os imports estáticos (o gzip delas é o que o navegador baixa)
const queue = [...scripts];

while (queue.length) {
  const url = queue.pop();
  const file = distFile(url);

  if (!existsSync(file)) continue;

  const dir = path.posix.dirname(url);

  for (const [, spec] of read(file).matchAll(/(?:from|import)\s*["'](\.\/[^"']+\.js)["']/g)) {
    const next = path.posix.join(dir, spec);

    if (!scripts.has(next)) {
      scripts.add(next);
      queue.push(next);
    }
  }
}

const jsBytes = [...scripts].reduce((sum, url) => sum + (existsSync(distFile(url)) ? gz(distFile(url)) : 0), 0);
const cssBytes = [...styles].reduce((sum, url) => sum + (existsSync(distFile(url)) ? gz(distFile(url)) : 0), 0);
const preloaded = [...home.matchAll(/<link rel="preload"[^>]+as="font"/g)].length;

const BUDGET = { js: 60 * 1024, css: 30 * 1024, fonts: 2 };

console.log(`Home: JS ${kb(jsBytes)} gzip (limite ${kb(BUDGET.js)}), CSS ${kb(cssBytes)} gzip (limite ${kb(BUDGET.css)}), ${preloaded} fonte(s) pré-carregada(s).`);

if (jsBytes > BUDGET.js) fail(`home: JS de ${kb(jsBytes)} passa do orçamento de ${kb(BUDGET.js)}`);
if (cssBytes > BUDGET.css) fail(`home: CSS de ${kb(cssBytes)} passa do orçamento de ${kb(BUDGET.css)}`);
if (preloaded > BUDGET.fonts) fail(`home: ${preloaded} fontes pré-carregadas (máximo ${BUDGET.fonts})`);

for (const file of all.filter(item => /\.(png|jpe?g|webp|avif)$/.test(item))) {
  const size = statSync(file).size;

  if (size > 220 * 1024) fail(`imagem de ${kb(size)} em ${path.relative(DIST, file)} (máximo 220 KB)`);
}

// ------------------------------------------------------------ 6. arquivos de sistema
for (const required of ["sitemap-index.xml", "robots.txt", "favicon.svg", "apple-touch-icon.png", "og-default.png", "pagefind/pagefind.js", "404.html"]) {
  if (!existsSync(path.join(DIST, required))) fail(`falta ${required} no build`);
}

if (existsSync(path.join(DIST, "robots.txt"))) {
  const robots = read(path.join(DIST, "robots.txt"));

  if (!robots.includes(`Sitemap: ${site.origin}${base}/sitemap-index.xml`)) fail("robots.txt sem o endereço certo do sitemap");
}

const sitemap = all.filter(file => /sitemap-\d+\.xml$/.test(file)).map(read).join("\n");

if (sitemap.includes("/account/")) fail("o painel não deve estar no sitemap");
if (!sitemap.includes(`${site.origin}${base}/wiki/crime/robbery/`)) fail("sitemap sem as páginas da wiki");

// ------------------------------------------------------------ resultado
console.log(`${pages.length} páginas conferidas, ${linksChecked} links e âncoras internos.`);

if (failures.length) {
  console.error(`\n${failures.length} problema(s):`);
  for (const message of failures) console.error(` - ${message}`);
  process.exit(1);
}

console.log("Tudo certo.");
