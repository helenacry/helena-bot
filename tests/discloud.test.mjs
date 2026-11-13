import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { crc32, inflateRawSync } from "node:zlib";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Implantação no Discloud. O que vale aqui foi conferido num app de teste de verdade:
// Node 24, SQLite em arquivo que sobrevive a commits, variáveis do painel (valem depois
// do rebuild), site na porta 8080 e o IP do visitante em CF-Connecting-IP.

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const SCRIPT = path.join(ROOT, "scripts", "make-discloud-zip.mjs");

const { listFiles, readIgnore, collectEntries, buildZip, validId, siteEntries, resolveCommit, hasUncommittedChanges } = await import("../scripts/make-discloud-zip.mjs");

const { readBuildInfo } = await import("../services/web/build-info.mjs");

const text = file => readFileSync(path.join(ROOT, file), "utf8");

const config = Object.fromEntries(
    text("discloud.config")
        .split("\n")
        .filter(Boolean)
        .map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])
);

// ==========================================
// discloud.config E .discloudignore
// ==========================================

test("discloud.config: site com a Helena inteira (bot e API juntos), no formato que o Discloud lê", () => {
    const raw = readFileSync(path.join(ROOT, "discloud.config"));

    assert.ok(!raw.includes(13), "só LF: um CR ficaria dentro do valor (VERSION=latest\\r)");
    assert.notEqual(raw[0], 0xef, "sem BOM, senão a primeira chave não é lida");

    assert.equal(config.TYPE, "site", "a API do painel exige TYPE=site (porta 8080)");
    assert.equal(config.MAIN, "helena.mjs");
    assert.ok(existsSync(path.join(ROOT, config.MAIN)), "o MAIN existe");
    assert.ok(Number(config.RAM) >= 512, "site precisa de pelo menos 512 MB");
    assert.equal(config.VERSION, "latest", "latest entrega o Node 24 (conferido); o bot precisa do node:sqlite");
    assert.equal(config.AUTORESTART, "true");
    assert.ok(validId(config.ID), `ID "${config.ID}" tem de ter 2 a 20 letras minúsculas, números e hífens`);
});

test("discloud.config: o comando de início não usa --env-file (as variáveis vêm do painel, não de um arquivo)", () => {
    assert.equal(config.START, "node helena.mjs");
    assert.doesNotMatch(config.START, /--env-file/);
});

test(".discloudignore: nomes exatos (sem curinga nem barra no fim), segredos e dados de fora, o que roda dentro", () => {
    const lines = text(".discloudignore").split("\n").map(line => line.trim()).filter(Boolean);

    for (const line of lines) {
        assert.ok(!/[*?\[\]]/.test(line), `${line}: o Discloud não aceita curinga`);
        assert.ok(!line.endsWith("/"), `${line}: sem barra no fim`);
    }

    assert.equal(new Set(lines).size, lines.length, "sem repetição");

    for (const must of [".env", ".env.test", "data", "generated", "node_modules", ".git", "tests", "site", "wiki"]) {
        assert.ok(lines.includes(must), `${must} tem de ficar fora do zip`);
    }

    for (const needed of ["assets", "commands", "config", "database", "services", "utils", "scripts", "helena.mjs", "command-registry.mjs", "package.json", "package-lock.json", "discloud.config"]) {
        assert.ok(!lines.includes(needed), `${needed} roda dentro do Discloud e não pode ser cortado`);
    }
});

// ==========================================
// O ZIP
// ==========================================

// Lê o zip de volta (diretório central), confere o CRC de cada arquivo e devolve { nome: Buffer }.
function readZip(buffer) {
    let end = buffer.length - 22;

    while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--;

    assert.ok(end >= 0, "achou o fim do zip");

    const count = buffer.readUInt16LE(end + 10);
    let at = buffer.readUInt32LE(end + 16);

    const files = {};

    for (let i = 0; i < count; i++) {
        assert.equal(buffer.readUInt32LE(at), 0x02014b50, "entrada do diretório central");

        const method = buffer.readUInt16LE(at + 10);
        const crc = buffer.readUInt32LE(at + 16);
        const packedSize = buffer.readUInt32LE(at + 20);
        const size = buffer.readUInt32LE(at + 24);
        const nameLength = buffer.readUInt16LE(at + 28);
        const extraLength = buffer.readUInt16LE(at + 30);
        const commentLength = buffer.readUInt16LE(at + 32);
        const localAt = buffer.readUInt32LE(at + 42);
        const name = buffer.toString("utf8", at + 46, at + 46 + nameLength);

        assert.equal(buffer.readUInt32LE(localAt), 0x04034b50, `${name}: cabeçalho local`);

        const dataAt = localAt + 30 + buffer.readUInt16LE(localAt + 26) + buffer.readUInt16LE(localAt + 28);
        const packed = buffer.subarray(dataAt, dataAt + packedSize);
        const data = method === 8 ? inflateRawSync(packed) : packed;

        assert.equal(data.length, size, `${name}: tamanho`);
        assert.equal(crc32(data), crc, `${name}: CRC`);

        files[name] = data;

        at += 46 + nameLength + extraLength + commentLength;
    }

    return files;
}

test("o zip lido de volta tem o bot inteiro, com CRC e tamanho certos, e nada que não deva", () => {
    const zip = readZip(buildZip(collectEntries()));
    const names = Object.keys(zip);

    for (const must of ["discloud.config", "helena.mjs", "package.json", "package-lock.json", "command-registry.mjs", "commands/economy/daily.mjs", "commands/economy/claim-gems.mjs", "services/web/web-api.mjs", "scripts/export-db.mjs"]) {
        assert.ok(names.includes(must), `${must} falta no zip`);
    }

    // as fontes do cartão de perfil
    const all = readdirSync(path.join(ROOT, "assets"), { recursive: true }).map(String).filter(name => statSync(path.join(ROOT, "assets", name)).isFile());

    // assets/brand (avatar, banners, ícones) é para o Portal, o GitHub, o README e o site: o bot não os lê, então ficam fora do zip
    const assets = all.filter(name => !/^brand[\\/]/.test(name));

    assert.ok(all.some(name => /^brand[\\/]helena-pfp\.png$/.test(name)), "a foto da Helena mora em assets/brand");
    assert.ok(assets.filter(name => name.endsWith(".ttf")).length >= 5, "as fontes Poppins");

    for (const asset of assets) {
        assert.ok(names.includes("assets/" + asset.replaceAll("\\", "/")), `assets/${asset} falta no zip`);
    }

    assert.deepEqual(names.filter(name => name.startsWith("assets/brand/")), [], "as imagens de marca não vão para o Discloud");

    // nada de segredos, banco, testes, site, wiki, git nem node_modules
    for (const name of names) {
        assert.ok(!/(^|\/)\.env(\..*)?$/.test(name) || name.endsWith(".example"), `${name} não pode ir`);
        assert.ok(!/^(data|generated|public|tests|site|wiki|node_modules|\.git|\.github|\.claude)\//.test(name), `${name} não pode ir`);
        assert.ok(!name.includes("\\"), `${name}: o zip usa "/" nos caminhos`);
    }

    assert.ok(!names.includes(".env"));
    assert.ok(names.every(name => !name.endsWith(".db")), "nenhum banco vai sem ser pedido");
});

test("o zip leva tudo que o código do bot importa (nenhum import fica sem arquivo lá dentro)", () => {
    const names = new Set(Object.keys(readZip(buildZip(collectEntries()))));

    const problems = [];

    for (const name of names) {
        if (!/^(helena|command-registry)\.mjs$|^(commands|services|config|database|utils)\/.*\.mjs$/.test(name)) continue;

        const source = readFileSync(path.join(ROOT, name), "utf8");

        for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), match[1].replace(/[?#].*$/, "")));

            if (!names.has(target)) problems.push(`${name} importa ${match[1]}, que não está no zip`);
        }
    }

    assert.deepEqual(problems, []);
});

test("--id troca só o subdomínio dentro do zip e recusa um ID inválido", () => {
    const zip = readZip(buildZip(collectEntries({ id: "outro-nome" })));
    const inside = zip["discloud.config"].toString("utf8");

    assert.match(inside, /^ID=outro-nome$/m);
    assert.match(text("discloud.config"), new RegExp(`^ID=${config.ID}$`, "m"), "o arquivo do projeto não muda");

    for (const bad of ["", "Maiuscula", "com_underline", "tem espaço", "a", "x".repeat(21), "ponto.com"]) {
        assert.throws(() => collectEntries({ id: bad }), /ID inválido/, JSON.stringify(bad));
    }

    assert.ok(validId("helena-bot") && validId("ab") && validId("a".repeat(20)));
});

test("o config vai no zip sempre com LF, mesmo que o arquivo do projeto esteja com CRLF (o Git no Windows pode converter)", () => {
    const root = mkdtempSync(path.join(tmpdir(), "helena-crlf-"));

    writeFileSync(path.join(root, ".discloudignore"), ".git\r\n");
    writeFileSync(path.join(root, "helena.mjs"), "// bot\n");
    writeFileSync(path.join(root, "discloud.config"), "NAME=Helena\r\nTYPE=site\r\nMAIN=helena.mjs\r\nRAM=512\r\nVERSION=latest\r\nID=helena-bot\r\nSTART=node helena.mjs\r\nAUTORESTART=true\r\n");

    const inside = readZip(buildZip(collectEntries({ root })))["discloud.config"];

    assert.ok(!inside.includes(13), "nenhum CR dentro do config do zip");
    assert.match(inside.toString("utf8"), /^VERSION=latest$/m);
    assert.match(inside.toString("utf8"), /^AUTORESTART=true$/m);

    // e o .gitattributes fixa LF nos dois arquivos do projeto
    const attributes = text(".gitattributes");

    assert.match(attributes, /^discloud\.config text eol=lf$/m);
    assert.match(attributes, /^\.discloudignore text eol=lf$/m);
});

test("--first sobe sem reinício automático (o bot cai uma vez sem token, quieto); o zip normal liga de volta", () => {
    const first = readZip(buildZip(collectEntries({ first: true })))["discloud.config"].toString("utf8");
    const normal = readZip(buildZip(collectEntries()))["discloud.config"].toString("utf8");

    assert.match(first, /^AUTORESTART=false$/m);
    assert.match(normal, /^AUTORESTART=true$/m);

    // só essa linha muda: o resto do arquivo é igual
    const rest = value => value.split("\n").filter(line => !line.startsWith("AUTORESTART=")).join("\n");

    assert.equal(rest(first), rest(normal));

    // e continua valendo junto de --id
    const both = readZip(buildZip(collectEntries({ first: true, id: "outro-nome" })))["discloud.config"].toString("utf8");

    assert.match(both, /^ID=outro-nome$/m);
    assert.match(both, /^AUTORESTART=false$/m);

    // o arquivo do projeto não muda
    assert.match(text("discloud.config"), /^AUTORESTART=true$/m);

    const cli = spawnSync(process.execPath, [SCRIPT, `--out=${path.join(mkdtempSync(path.join(tmpdir(), "helena-first-")), "x.zip")}`, "--first", "--no-site"], { encoding: "utf8" });

    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /primeira subida: SIM/);
});

test("--seed-db leva o banco em data/helena.db, mas só um SQLite de verdade", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "helena-seed-"));

    const real = path.join(dir, "banco.db");
    const fake = path.join(dir, "falso.db");

    // um SQLite mínimo de verdade (o mesmo script de exportação usa o cabeçalho "SQLite format 3")
    execFileSync(process.execPath, ["--disable-warning=ExperimentalWarning", "-e", `
        const { DatabaseSync } = require("node:sqlite");
        const db = new DatabaseSync(${JSON.stringify(real)});
        db.exec("CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1)");
        db.close();
    `]);

    writeFileSync(fake, "isto não é um banco");

    const withDb = readZip(buildZip(collectEntries({ seedDb: real })));

    assert.ok(withDb["data/helena.db"], "o banco foi no zip");
    assert.equal(withDb["data/helena.db"].subarray(0, 15).toString("latin1"), "SQLite format 3");

    assert.throws(() => collectEntries({ seedDb: fake }), /não é um banco SQLite/);
    assert.throws(() => collectEntries({ seedDb: path.join(dir, "nao-existe.db") }), /não achei o banco/);

    // sem --seed-db, nunca vai banco
    assert.ok(!readZip(buildZip(collectEntries()))["data/helena.db"]);
});

test("npm run discloud:zip grava o zip, avisa o que levou e não sobrescreve sem --force", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "helena-zip-"));
    const out = path.join(dir, "saida.zip");

    const first = spawnSync(process.execPath, [SCRIPT, `--out=${out}`, "--id=teste-zip", "--no-site"], { encoding: "utf8" });

    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Zip pronto/);
    assert.match(first.stdout, /subdomínio \(ID\): teste-zip/);
    assert.match(first.stdout, /banco de partida: não/);

    assert.match(readZip(readFileSync(out))["discloud.config"].toString("utf8"), /^ID=teste-zip$/m);

    const again = spawnSync(process.execPath, [SCRIPT, `--out=${out}`], { encoding: "utf8" });

    assert.equal(again.status, 1);
    assert.match(again.stderr, /já existe/);

    assert.equal(spawnSync(process.execPath, [SCRIPT, `--out=${out}`, "--force", "--no-site"], { encoding: "utf8" }).status, 0);

    const unknown = spawnSync(process.execPath, [SCRIPT, "--nada"], { encoding: "utf8" });

    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /opção desconhecida/);

    assert.ok(readIgnore().has(".env") && listFiles().includes("discloud.config"));
});

test("package.json tem o comando discloud:zip", () => {
    assert.equal(JSON.parse(text("package.json")).scripts["discloud:zip"], "node scripts/make-discloud-zip.mjs");
});

test("package.json tem o comando discloud:deploy (a publicação pelo GitHub)", () => {
    assert.equal(JSON.parse(text("package.json")).scripts["discloud:deploy"], "node scripts/ci/discloud-deploy.mjs");
});

// ==========================================
// O COMMIT VAI NO ZIP (build-info.json), E O BOT SABE LER
// ==========================================

const SHA_A = "0123456789abcdef0123456789abcdef01234567";
const SHA_B = "fedcba9876543210fedcba9876543210fedcba98";

test("com commit, o zip leva o build-info.json; sem commit, não leva nada (o zip padrão continua igual)", () => {
    const withCommit = readZip(buildZip(collectEntries({ root: fakeProject(), commit: SHA_A })));

    assert.deepEqual(JSON.parse(withCommit["build-info.json"].toString("utf8")), { commit: SHA_A });
    assert.ok(withCommit["build-info.json"].toString("utf8").endsWith("\n"));

    assert.ok(!("build-info.json" in readZip(buildZip(collectEntries({ root: fakeProject() })))));
});

test("um build-info.json esquecido na pasta nunca vai no zip: ele diria um commit velho", () => {
    const project = fakeProject();

    writeFileSync(path.join(project, "build-info.json"), JSON.stringify({ commit: SHA_B }));

    const without = collectEntries({ root: project });

    assert.ok(!without.some(entry => entry.name === "build-info.json"), "sem commit, nada de build-info.json");

    const withCommit = collectEntries({ root: project, commit: SHA_A });

    assert.equal(withCommit.filter(entry => entry.name === "build-info.json").length, 1, "um só, sem duplicar");
    assert.deepEqual(JSON.parse(readZip(buildZip(withCommit))["build-info.json"].toString("utf8")), { commit: SHA_A });
});

test("o commit do zip vem de --commit, depois de GITHUB_SHA, depois do git; inválido é recusado", () => {
    assert.equal(resolveCommit({ commit: SHA_A, env: { GITHUB_SHA: SHA_B } }), SHA_A);
    assert.equal(resolveCommit({ env: { GITHUB_SHA: SHA_B } }), SHA_B);

    for (const bad of ["abc123", "", "G".repeat(40), SHA_A.toUpperCase(), SHA_A + "0", " " + SHA_A]) {
        assert.throws(() => resolveCommit({ commit: bad }), /commit inválido/, JSON.stringify(bad));
        assert.throws(() => resolveCommit({ env: { GITHUB_SHA: bad } }), /commit inválido/, JSON.stringify(bad));
    }

    // sem nada e fora de um repositório: sem commit, sem erro (o zip continua valendo)
    assert.equal(resolveCommit({ env: {}, root: mkdtempSync(path.join(tmpdir(), "helena-nogit-")) }), null);

    // dentro do repositório de verdade: o HEAD
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();

    assert.equal(resolveCommit({ env: {} }), head);
});

test("hasUncommittedChanges: limpo é falso, arquivo versionado alterado é verdadeiro, fora de um repositório é falso", () => {
    const repo = mkdtempSync(path.join(tmpdir(), "helena-repo-"));

    const git = (...args) => execFileSync("git", ["-c", "user.name=teste", "-c", "user.email=teste@exemplo.test", "-c", "commit.gpgsign=false", ...args], { cwd: repo, stdio: "ignore" });

    git("init", "-q");
    writeFileSync(path.join(repo, "a.txt"), "um\n");
    git("add", "a.txt");
    git("commit", "-q", "-m", "primeiro");

    assert.equal(hasUncommittedChanges(repo), false);

    writeFileSync(path.join(repo, "solto.txt"), "arquivo que o Git não conhece\n");

    assert.equal(hasUncommittedChanges(repo), false, "arquivo novo não versionado não conta");

    writeFileSync(path.join(repo, "a.txt"), "dois\n");

    assert.equal(hasUncommittedChanges(repo), true);

    assert.equal(hasUncommittedChanges(mkdtempSync(path.join(tmpdir(), "helena-nogit-"))), false);
});

test("npm run discloud:zip --commit= grava o commit no zip e avisa; commit inválido é recusado", () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), "helena-zip-")), "com-commit.zip");

    const made = spawnSync(process.execPath, [SCRIPT, `--out=${out}`, `--commit=${SHA_A}`, "--no-site"], { encoding: "utf8" });

    assert.equal(made.status, 0, made.stderr);
    assert.match(made.stdout, /commit: 0123456\b/);

    assert.deepEqual(JSON.parse(readZip(readFileSync(out))["build-info.json"].toString("utf8")), { commit: SHA_A });

    const refused = spawnSync(process.execPath, [SCRIPT, `--out=${out}`, "--force", "--commit=xyz", "--no-site"], { encoding: "utf8" });

    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /commit inválido/);
});

test("readBuildInfo lê o commit do build-info.json do zip e nunca lança erro", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "helena-build-info-"));

    // o arquivo exatamente como o zip o grava
    const inZip = readZip(buildZip(collectEntries({ root: fakeProject(), commit: SHA_A })))["build-info.json"];

    writeFileSync(path.join(dir, "ok.json"), inZip);

    assert.deepEqual(readBuildInfo(path.join(dir, "ok.json")), { commit: SHA_A });

    const bad = {
        "vazio.json": "",
        "quebrado.json": "{commit:",
        "curto.json": JSON.stringify({ commit: "abc" }),
        "outro-tipo.json": JSON.stringify({ commit: 123 }),
        "sem-campo.json": JSON.stringify({}),
        "lista.json": "[]",
        "nulo.json": "null"
    };

    for (const [name, content] of Object.entries(bad)) {
        writeFileSync(path.join(dir, name), content);

        assert.deepEqual(readBuildInfo(path.join(dir, name)), { commit: null }, name);
    }

    assert.deepEqual(readBuildInfo(path.join(dir, "nao-existe.json")), { commit: null });

    // rodando da pasta do projeto (sem zip) não há build-info.json: commit nulo
    assert.deepEqual(readBuildInfo(), { commit: null });
});

// ==========================================
// O SITE VAI NO ZIP, MONTADO
// ==========================================

// Um projeto de mentira só com o que o zip precisa: o config, o ignore de verdade e o site montado.
function fakeProject({ built = true } = {}) {
    const dir = mkdtempSync(path.join(tmpdir(), "helena-zip-"));

    writeFileSync(path.join(dir, "discloud.config"), "NAME=Helena\nID=helena\nAUTORESTART=true\n");
    writeFileSync(path.join(dir, ".discloudignore"), readFileSync(new URL("../.discloudignore", import.meta.url)));
    writeFileSync(path.join(dir, "helena.mjs"), "console.log(1)");

    mkdirSync(path.join(dir, "site", "src"), { recursive: true });
    writeFileSync(path.join(dir, "site", "src", "pagina.astro"), "fonte do site, nunca vai");

    if (built) {
        mkdirSync(path.join(dir, "site", "dist", "wiki"), { recursive: true });
        mkdirSync(path.join(dir, "site", "dist", "assets"), { recursive: true });

        writeFileSync(path.join(dir, "site", "dist", "index.html"), "<h1>home</h1>");
        writeFileSync(path.join(dir, "site", "dist", "wiki", "index.html"), "<h1>wiki</h1>");
        writeFileSync(path.join(dir, "site", "dist", "assets", "app.js"), "export {}");
    }

    return dir;
}

test("o site montado (site/dist) vai no zip como site-dist/, e o código-fonte do site não", () => {
    const names = Object.keys(readZip(buildZip(collectEntries({ root: fakeProject() })))).sort();

    assert.deepEqual(names, [
        ".discloudignore",
        "discloud.config",
        "helena.mjs",
        "site-dist/assets/app.js",
        "site-dist/index.html",
        "site-dist/wiki/index.html"
    ]);

    assert.ok(!names.some(name => name.startsWith("site/")), "o fonte do site fica de fora");
});

test("sem o site montado, ou com site: false, o zip sai sem ele", () => {
    assert.ok(!Object.keys(readZip(buildZip(collectEntries({ root: fakeProject({ built: false }) })))).some(name => name.startsWith("site-dist/")));
    assert.ok(!Object.keys(readZip(buildZip(collectEntries({ root: fakeProject(), site: false })))).some(name => name.startsWith("site-dist/")));

    assert.equal(siteEntries(fakeProject({ built: false })).length, 0);
    assert.equal(siteEntries(fakeProject()).length, 3);
});

test("o comando recusa um zip sem o site montado (o endereço do Discloud ficaria sem página), a menos que seja --no-site", () => {
    // o projeto de verdade, sem site/dist montado neste teste: roda só se ele não existir
    if (siteEntries().length) return;

    const out = path.join(mkdtempSync(path.join(tmpdir(), "helena-zip-")), "sem-site.zip");

    const refused = spawnSync(process.execPath, [SCRIPT, `--out=${out}`], { encoding: "utf8" });

    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /site ainda não foi montado/);
    assert.match(refused.stderr, /npm run site:build/);

    assert.equal(spawnSync(process.execPath, [SCRIPT, `--out=${out}`, "--no-site"], { encoding: "utf8" }).status, 0);
});
