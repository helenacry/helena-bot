// Gera as páginas da wiki (site/wiki/) a partir de wiki/*.md e dos números do
// bot. Rode depois de editar uma página, mudar o menu (wiki/nav.mjs) ou mudar
// uma regra do jogo que a wiki cita:
//
//   npm run wiki:build
//
// site/wiki/ é inteiro gerado: não edite nada lá à mão.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Usa um banco temporário (e roda as migrações) para importar os comandos sem
// encostar em data/. É o mesmo preparo dos testes.
await import("../tests/helpers.mjs");

const { generateWiki } = await import("./wiki-generate.mjs");

const OUTPUT = fileURLToPath(new URL("./wiki/", import.meta.url));

const files = await generateWiki();

// começa do zero, para página apagada ou renomeada não deixar arquivo velho
await rm(OUTPUT, { recursive: true, force: true });

for (const [file, content] of files) {
    const target = path.join(OUTPUT, file);

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
}

console.log(`site/wiki/ atualizado: ${files.size - 1} páginas e o índice da busca.`);
