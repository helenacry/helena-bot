// Gera o conteúdo da wiki (site/src/content/wiki.json) a partir de wiki/*.md e dos
// números do bot. Rode depois de editar uma página, mudar o menu (wiki/nav.mjs) ou
// mudar uma regra do jogo que a wiki cita:
//
//   npm run wiki:build
//
// O arquivo é inteiro gerado: não edite à mão. O site (Astro) o lê no build.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Usa um banco temporário (e roda as migrações) para importar os comandos sem
// encostar em data/. É o mesmo preparo dos testes.
await import("../../tests/helpers.mjs");

const { generateWiki, WIKI_OUTPUT } = await import("./wiki-generate.mjs");

const { pages, json } = await generateWiki();

await mkdir(path.dirname(WIKI_OUTPUT), { recursive: true });
await writeFile(WIKI_OUTPUT, json);

console.log(`site/src/content/wiki.json atualizado: ${pages.length} páginas.`);
