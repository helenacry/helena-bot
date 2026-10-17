// Atualiza os números e a lista de comandos do site com o que o bot
// realmente tem hoje. Rode depois de criar, renomear ou remover comandos,
// empregos, itens ou conquistas:
//
//   npm run site:data
//
// Grava site/data/site-data.js.

import { writeFile } from "node:fs/promises";

// Usa um banco temporário (e roda as migrações) para importar os
// comandos sem encostar em data/. É o mesmo preparo dos testes.
await import("../../tests/helpers.mjs");

const { collectSiteData, renderSiteDataFile } = await import("./data-source.mjs");

const data = await collectSiteData();

await writeFile(
    new URL("../../site/data/site-data.js", import.meta.url),
    renderSiteDataFile(data)
);

console.log(
    `site/data/site-data.js atualizado: ${data.stats.commands} comandos ` +
    `(${data.stats.aliases} aliases), ${data.stats.jobs} empregos, ` +
    `${data.stats.shopItems} itens na loja, ` +
    `${data.stats.achievements} conquistas.`
);
