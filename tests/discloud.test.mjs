import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { crc32, inflateRawSync } from "node:zlib";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Implantação no Discloud. O que vale aqui foi conferido num app de teste de verdade:
// Node 24, SQLite em arquivo que sobrevive a commits, variáveis do painel (valem depois
// do rebuild), site na porta 8080 e o IP do visitante em CF-Connecting-IP.

const ROOT = fileURLToPath(new URL("../", import.meta.url));

const SCRIPT = path.join(ROOT, "scripts", "make-discloud-zip.mjs");

const { listFiles, readIgnore, collectEntries, buildZip, validId } = await import("../scripts/make-discloud-zip.mjs");

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

    for (const must of ["discloud.config", "helena.mjs", "package.json", "package-lock.json", "command-registry.mjs", "commands/economy/daily.mjs", "commands/economy/claim-gems.mjs", "services/web-api.mjs", "scripts/export-db.mjs"]) {
        assert.ok(names.includes(must), `${must} falta no zip`);
    }

    // as imagens do cartão de perfil e das insígnias
    const assets = readdirSync(path.join(ROOT, "assets"), { recursive: true }).map(String).filter(name => statSync(path.join(ROOT, "assets", name)).isFile());

    assert.ok(assets.length > 10);

    for (const asset of assets) {
        assert.ok(names.includes("assets/" + asset.replaceAll("\\", "/")), `assets/${asset} falta no zip`);
    }

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

    const cli = spawnSync(process.execPath, [SCRIPT, `--out=${path.join(mkdtempSync(path.join(tmpdir(), "helena-first-")), "x.zip")}`, "--first"], { encoding: "utf8" });

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

    const first = spawnSync(process.execPath, [SCRIPT, `--out=${out}`, "--id=teste-zip"], { encoding: "utf8" });

    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Zip pronto/);
    assert.match(first.stdout, /subdomínio \(ID\): teste-zip/);
    assert.match(first.stdout, /banco de partida: não/);

    assert.match(readZip(readFileSync(out))["discloud.config"].toString("utf8"), /^ID=teste-zip$/m);

    const again = spawnSync(process.execPath, [SCRIPT, `--out=${out}`], { encoding: "utf8" });

    assert.equal(again.status, 1);
    assert.match(again.stderr, /já existe/);

    assert.equal(spawnSync(process.execPath, [SCRIPT, `--out=${out}`, "--force"], { encoding: "utf8" }).status, 0);

    const unknown = spawnSync(process.execPath, [SCRIPT, "--nada"], { encoding: "utf8" });

    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /opção desconhecida/);

    assert.ok(readIgnore().has(".env") && listFiles().includes("discloud.config"));
});

test("package.json tem o comando discloud:zip", () => {
    assert.equal(JSON.parse(text("package.json")).scripts["discloud:zip"], "node scripts/make-discloud-zip.mjs");
});
