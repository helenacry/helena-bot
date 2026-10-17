// O dono é definido ANTES de qualquer módulo do bot carregar (developer.mjs lê
// a variável na hora do import), por isso os helpers entram por import dinâmico.
process.env.HELENA_OWNER_ID = "777000000000000001";

const { db } = await import("./helpers.mjs");

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Hospedar o bot na nuvem (Railway, Fly.io...). O bot sempre rodou no Windows do
// dono; num container Linux mudam o sistema de arquivos (maiúscula e minúscula
// importam), as fontes, o disco que sobrevive ao deploy e o IP que chega à API.
// Estes testes travam o que dá para conferir sem subir um servidor.

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const read = file => readFileSync(path.join(ROOT, file), "utf8");

// ==========================================
// IMAGEM (Dockerfile e .dockerignore)
// ==========================================

test("o Dockerfile: Node 24, instala só o necessário, não depende do .env e usa o volume", () => {
    // só as instruções: os comentários explicam, e citam o que a imagem NÃO faz
    const file = read("Dockerfile")
        .split("\n")
        .filter(line => !line.trim().startsWith("#"))
        .join("\n");

    assert.match(file, /^FROM node:24-/m, "o bot precisa do node:sqlite do Node 24");
    assert.match(file, /^RUN npm ci --omit=dev$/m);

    // as dependências antes do código, para o deploy reaproveitar o cache
    assert.ok(file.indexOf("COPY package.json package-lock.json") < file.indexOf("COPY . ."));

    // --env-file falha se o .env não existe, e na nuvem as variáveis vêm da hospedagem
    assert.match(file, /^CMD \["node", "helena\.mjs"\]$/m);
    assert.doesNotMatch(file, /--env-file/);
    assert.doesNotMatch(file, /\.env/, "o .env nunca entra na imagem");

    // o volume da hospedagem é montado em /data: banco e dados gerados ficam lá
    assert.match(file, /^ENV HELENA_DATABASE_PATH=\/data\/helena\.db$/m);
    assert.doesNotMatch(file, /HELENA_GENERATED_DIR/, "não há mais pasta de dados gerados: tudo fica no banco");

    // a API tem de aceitar conexões vindas de fora do container
    assert.match(file, /^ENV HELENA_WEB_HOST=0\.0\.0\.0$/m);
});

test("a imagem traz uma fonte que o cartão de perfil usa (senão o texto some no Linux)", () => {
    const file = read("Dockerfile");
    const font = read("services/profile-card.mjs").match(/const FONT = "([^"]+)"/)[1];

    // a lista de fontes do cartão começa em fontes do Windows; no Linux, o que vale é a DejaVu Sans
    assert.ok(font.split(",").map(name => name.trim()).includes("DejaVu Sans"), font);

    assert.match(file, /apt-get install[^\n]*\bfontconfig\b/);
    assert.match(file, /apt-get install[^\n]*\bfonts-dejavu-core\b/);
});

test(".dockerignore: segredos e banco ficam de fora, e nada que o bot executa é cortado", () => {
    const lines = read(".dockerignore")
        .split("\n")
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("#"));

    for (const must of [".env", ".env.*", "data", "generated", "node_modules", ".git"]) {
        assert.ok(lines.includes(must), `${must} precisa estar no .dockerignore`);
    }

    for (const needed of ["assets", "commands", "config", "database", "services", "utils", "helena.mjs", "command-registry.mjs", "package.json", "package-lock.json"]) {
        assert.ok(!lines.includes(needed), `${needed} é executado pelo bot e não pode ser cortado`);
    }
});

test("o que o bot executa nunca importa de pastas que a imagem deixa de fora", () => {
    const runtime = ["helena.mjs", "command-registry.mjs", "commands", "services", "config", "database", "utils"];
    const left = ["site", "wiki", "tests", "data", "generated", "public"];

    const problems = [];

    for (const file of walk(runtime)) {
        for (const spec of relativeImports(readFileSync(file, "utf8"))) {
            const target = path.relative(ROOT, path.resolve(path.dirname(file), spec));
            const top = target.split(path.sep)[0];

            if (left.includes(top)) problems.push(`${path.relative(ROOT, file)} importa ${spec}`);
        }
    }

    assert.deepEqual(problems, []);
});

test("package.json pede Node 24 e tem o comando de início da nuvem, sem .env", () => {
    const pkg = JSON.parse(read("package.json"));

    assert.equal(pkg.engines.node, ">=24");
    assert.ok(Number(process.versions.node.split(".")[0]) >= 24, "os testes rodam no Node que o bot exige");
    assert.equal(pkg.scripts["start:cloud"], "node helena.mjs");
});

// ==========================================
// LINUX: MAIÚSCULA E MINÚSCULA NOS NOMES
// ==========================================

// No Windows "./Foo.mjs" abre "foo.mjs"; no Linux, não. Um import com a caixa
// errada só quebraria depois do deploy: aqui cada caminho precisa bater exato.

function* walk(entries) {
    for (const entry of entries) {
        const full = path.join(ROOT, entry);

        if (!existsSync(full)) continue;

        if (statSync(full).isDirectory()) {
            yield* walk(readdirSync(full).filter(name => name !== "node_modules").map(name => path.join(entry, name)));
        } else if (/\.(mjs|js)$/.test(full)) {
            yield full;
        }
    }
}

function relativeImports(source) {
    return [...source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)]
        .map(match => match[1].replace(/[?#].*$/, ""));
}

// existe com a caixa exata? (confere cada parte do caminho contra a listagem da pasta)
function existsExactly(file) {
    let current = ROOT;

    for (const part of path.relative(ROOT, file).split(path.sep)) {
        if (!readdirSync(current).includes(part)) return false;

        current = path.join(current, part);
    }

    return true;
}

test("todo import do bot, do site e dos testes existe com a caixa exata do nome do arquivo", () => {
    const top = readdirSync(ROOT).filter(name => !["node_modules", ".git", "data", "generated"].includes(name));

    const problems = [];
    let checked = 0;

    for (const file of walk(top)) {
        for (const spec of relativeImports(readFileSync(file, "utf8"))) {
            const target = path.resolve(path.dirname(file), spec);

            checked++;

            if (!existsSync(target)) problems.push(`${path.relative(ROOT, file)}: «${spec}» não existe`);
            else if (!existsExactly(target)) problems.push(`${path.relative(ROOT, file)}: «${spec}» só existe com outra caixa`);
        }
    }

    assert.ok(checked > 500, `conferiu ${checked} imports`);
    assert.deepEqual(problems, []);
});

// ==========================================
// DADOS: O QUE TEM DE SOBREVIVER AO DEPLOY
// ==========================================

test("o /devbackup grava ao lado do banco (na nuvem, no volume) e só o dono usa", async () => {
    const { DATABASE_PATH } = await import("../database/connection.mjs");
    const command = (await import("../commands/dev/dev-backup.mjs")).default;

    const dir = path.join(path.dirname(DATABASE_PATH), "backups");

    assert.ok(!existsSync(dir) || readdirSync(dir).length === 0, "começa sem backups");

    const denied = await command.execute({ user: { id: "1" } });

    assert.match(JSON.stringify(denied), /Acesso restrito/);
    assert.ok(!existsSync(dir) || readdirSync(dir).length === 0, "quem não é dono não gera backup");

    const reply = await command.execute({ user: { id: process.env.HELENA_OWNER_ID } });

    const files = readdirSync(dir).filter(name => name.endsWith(".db"));

    assert.equal(files.length, 1);
    assert.match(JSON.stringify(reply), new RegExp(files[0].replace(/\./g, "\\.")), "o aviso diz onde ficou");
    assert.ok(JSON.stringify(reply).includes(dir.replace(/\\/g, "\\\\")) || JSON.stringify(reply).includes(dir), "o aviso mostra o caminho de verdade");

    // é um banco inteiro e legível, com as tabelas do bot
    const copy = new DatabaseSync(path.join(dir, files[0]));

    try {
        assert.equal(typeof copy.prepare("SELECT COUNT(*) c FROM players").get().c, "number");
    } finally {
        copy.close();
    }

    assert.ok(db);
});

test("o bot não grava dados em arquivos soltos: o que precisa durar vive no banco (o único arquivo que se faz backup)", () => {
    // a pasta generated/ só aparece em services/userinfo-views.mjs, e só para LER o JSON antigo
    const mentions = [];

    for (const file of walk(["helena.mjs", "command-registry.mjs", "commands", "services", "config", "database", "utils"])) {
        if (/generated/.test(readFileSync(file, "utf8"))) mentions.push(path.relative(ROOT, file).replaceAll("\\", "/"));
    }

    assert.deepEqual(mentions, ["services/userinfo-views.mjs"]);

    const views = read("services/userinfo-views.mjs");

    assert.doesNotMatch(views, /writeFile|mkdir|appendFile/, "o contador não escreve arquivo");
    assert.match(views, /CREATE TABLE IF NOT EXISTS userinfo_views/);
});
