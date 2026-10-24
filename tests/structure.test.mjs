import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A organização das pastas é parte do projeto: docs/structure.md descreve, e este teste confere.

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const list = dir => readdirSync(path.join(ROOT, dir), { withFileTypes: true });

const readme = readFileSync(path.join(ROOT, "docs", "structure.md"), "utf8");

test("services/ é dividido por assunto: nenhum arquivo solto, e cada pasta aparece em docs/structure.md", () => {
    const entries = list("services");

    assert.deepEqual(
        entries.filter(entry => entry.isFile()).map(entry => entry.name),
        [],
        "serviço solto em services/: ponha na pasta do assunto dele"
    );

    const folders = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();

    assert.deepEqual(folders, ["combat", "crime", "discord", "economy", "panels", "platform", "progress", "social", "web"]);

    for (const folder of folders) {
        assert.match(readme, new RegExp(`^  ${folder}/ `, "m"), `docs/structure.md não descreve services/${folder}/`);

        assert.ok(list(path.join("services", folder)).some(entry => entry.isFile() && entry.name.endsWith(".mjs")), `services/${folder}/ está vazia`);
    }
});

test("site/ é um projeto Astro à parte (as próprias dependências); o bot não carrega nada dele", () => {
    const siteDir = entry => path.join(ROOT, "site", entry);

    for (const required of ["package.json", "astro.config.mjs", "tsconfig.json", "playwright.config.ts", "src/pages/index.astro", "src/styles/tokens.css", "src/content/wiki.json", "src/data/game.json"]) {
        assert.ok(existsSync(siteDir(required)), `site/${required} não existe`);
    }

    // as dependências do site (Astro, Preact, Playwright...) não podem vazar para o bot, que roda no Discloud
    const rootPackage = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const sitePackage = JSON.parse(readFileSync(siteDir("package.json"), "utf8"));

    const rootDeps = Object.keys({ ...rootPackage.dependencies, ...rootPackage.devDependencies });

    for (const heavy of ["astro", "preact", "@playwright/test", "pagefind", "typescript"]) {
        assert.ok(!rootDeps.includes(heavy), `${heavy} é do site, não do bot (package.json da raiz)`);
        assert.ok(heavy in { ...sitePackage.dependencies, ...sitePackage.devDependencies }, `${heavy} deveria estar em site/package.json`);
    }

    // o que a hospedagem do bot ignora: o site inteiro, com o node_modules dele
    const ignored = readFileSync(path.join(ROOT, ".discloudignore"), "utf8").split(/\r?\n/);

    assert.ok(ignored.includes("site"), ".discloudignore precisa ignorar site/");

    // saídas do build não vão para o Git
    const gitignore = readFileSync(path.join(ROOT, ".gitignore"), "utf8");

    for (const out of ["site/dist/", "site/.astro/", "node_modules/"]) {
        assert.ok(gitignore.includes(out), `.gitignore sem ${out}`);
    }

    // o conteúdo gerado do site tem lugar fixo; geradores ficam em scripts/site
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
