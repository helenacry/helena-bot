import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A organização das pastas é parte do projeto: o README descreve, e este teste confere.

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const list = dir => readdirSync(path.join(ROOT, dir), { withFileTypes: true });

const readme = readFileSync(path.join(ROOT, "README.md"), "utf8");

test("services/ é dividido por assunto: nenhum arquivo solto, e cada pasta aparece no README", () => {
    const entries = list("services");

    assert.deepEqual(
        entries.filter(entry => entry.isFile()).map(entry => entry.name),
        [],
        "serviço solto em services/: ponha na pasta do assunto dele"
    );

    const folders = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();

    assert.deepEqual(folders, ["combat", "crime", "economy", "panels", "platform", "progress", "social", "web"]);

    for (const folder of folders) {
        assert.match(readme, new RegExp(`^  ${folder}/ `, "m"), `o README não descreve services/${folder}/`);

        assert.ok(list(path.join("services", folder)).some(entry => entry.isFile() && entry.name.endsWith(".mjs")), `services/${folder}/ está vazia`);
    }
});

test("site/ só tem o que vai ao ar: nenhum script .mjs (os geradores ficam em scripts/site)", () => {
    const stray = [];

    const walk = dir => {
        for (const entry of list(dir)) {
            const full = path.join(dir, entry.name);

            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith(".mjs")) stray.push(full.split(path.sep).join("/"));
        }
    };

    walk("site");

    assert.deepEqual(stray, [], "gerador dentro de site/: ele iria para a página");

    assert.deepEqual(
        list(path.join("scripts", "site")).map(entry => entry.name).sort(),
        ["build-card.mjs", "build-data.mjs", "build-wiki.mjs", "data-source.mjs", "wiki-generate.mjs", "wiki-markdown.mjs", "wiki-pages.mjs", "wiki-values.mjs"]
    );
});

test("todo script do package.json aponta para um arquivo que existe", () => {
    const { scripts } = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));

    let checked = 0;

    for (const [name, command] of Object.entries(scripts)) {
        // o "test" usa um padrão (tests/*.test.mjs), não um arquivo
        if (command.includes("*")) continue;

        for (const file of command.match(/[\w./-]+\.mjs/g) ?? []) {
            checked += 1;

            assert.ok(existsSync(path.join(ROOT, file)) && statSync(path.join(ROOT, file)).isFile(), `npm run ${name}: ${file} não existe`);
        }
    }

    assert.ok(checked >= 6, `conferiu ${checked} arquivos`);
});
