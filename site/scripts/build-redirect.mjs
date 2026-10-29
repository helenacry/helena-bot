// Monta o que o GitHub Pages passa a publicar: só um redirecionamento do endereço antigo
// (https://helenacry.github.io/helena-bot/…) para o do Discloud (config/site.mjs, SITE_URL).
//
//   node scripts/build-redirect.mjs [pasta]      (padrão: ../redirect)
//
// O site de verdade é servido pelo próprio bot (services/web/static-site.mjs) e vai no zip do Discloud.
// Os links antigos (README, mensagens, buscadores) continuam funcionando: a página inicial e o 404.html
// do Pages mandam o visitante ao mesmo caminho no endereço novo. O 404.html é o que pega os endereços
// de dentro do site (/helena-bot/wiki/start/jobs/ -> /wiki/start/jobs/).

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { SITE_URL } from "../../config/site.mjs";

import { SITE, OG_IMAGE_VERSION } from "../src/config.ts";

// O caminho antigo do Pages, que sai do endereço novo.
const OLD_BASE = "/helena-bot";

const target = new URL(SITE_URL);

const origin = target.origin;

export function redirectPage() {
    const script = `
    var rest = location.pathname.indexOf(${JSON.stringify(OLD_BASE)}) === 0 ? location.pathname.slice(${OLD_BASE.length}) : location.pathname;
    location.replace(${JSON.stringify(origin)} + (rest || "/") + location.search + location.hash);`;

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>A Helena mudou de endereço</title>
  <meta name="robots" content="noindex">
  <link rel="canonical" href="${SITE_URL}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${SITE.name} | Bot de economia e RPG para o Discord">
  <meta property="og:description" content="${SITE.description}">
  <meta property="og:url" content="${SITE_URL}">
  <meta property="og:image" content="${SITE_URL}og-default.png?v=${OG_IMAGE_VERSION}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta http-equiv="refresh" content="0; url=${SITE_URL}">
  <script>${script}
  </script>
</head>
<body>
  <p>A Helena mudou de endereço: <a href="${SITE_URL}">${SITE_URL}</a></p>
</body>
</html>
`;
}

async function main() {
    const out = process.argv[2] ?? fileURLToPath(new URL("../redirect/", import.meta.url));

    await mkdir(out, { recursive: true });

    const page = redirectPage();

    // a raiz e o 404 (qualquer endereço do site antigo que não é a raiz cai no 404.html do Pages)
    await writeFile(`${out}/index.html`, page);
    await writeFile(`${out}/404.html`, page);

    console.log(`Redirecionamento para ${SITE_URL} montado em ${out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    await main();
}
