// Atualiza os números, a lista de comandos e as regras do jogo que o site
// mostra com o que o bot realmente tem hoje. Rode depois de criar, renomear ou remover comandos,
// empregos, itens ou conquistas:
//
//   npm run site:data
//
// Grava site/src/data/game.json (o Astro lê esse arquivo no build).

import { writeFile } from "node:fs/promises";

// Usa um banco temporário (e roda as migrações) para importar os
// comandos sem encostar em data/. É o mesmo preparo dos testes.
await import("../../tests/helpers.mjs");

const { collectSiteData, renderSiteDataFile } = await import("./data-source.mjs");

const data = await collectSiteData();

await writeFile(
    new URL("../../site/src/data/game.json", import.meta.url),
    renderSiteDataFile(data)
);

console.log(
    `site/src/data/game.json atualizado: ${data.stats.commands} comandos ` +
    `(${data.stats.aliases} aliases), ${data.stats.jobs} empregos, ` +
    `${data.stats.shopItems} itens na loja, ` +
    `${data.stats.achievements} conquistas.`
);
