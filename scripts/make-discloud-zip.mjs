// Monta o .zip que vai para o Discloud (painel, "+ Upload", Upload ZIP).
//
//   npm run discloud:zip                          zip padrão, com o ID do discloud.config
//   npm run discloud:zip -- --id=meuapp           troca o subdomínio (ID) só dentro do zip
//   npm run discloud:zip -- --seed-db=banco.db    leva o banco (feito com npm run db:export)
//                                                 em data/helena.db: SÓ na primeira vez
//   npm run discloud:zip -- --first               primeira subida: sem reinício automático (veja adjustConfig)
//   npm run discloud:zip -- --out=C:/pasta/x.zip  onde gravar (padrão: ao lado da pasta do projeto)
//   npm run discloud:zip -- --force               sobrescreve um zip que já exista
//
// O que entra é tudo menos o que está em .discloudignore (nomes exatos, sem curinga,
// em qualquer nível), que é a mesma lista que o Discloud usa nos outros tipos de envio.
// Segredos (.env) e o banco local nunca entram sozinhos: as variáveis vão pelo painel
// e o banco já vive no Discloud (os commits não apagam data/, conferido num app de teste).

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { crc32, deflateRawSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ==========================================
// O QUE ENTRA
// ==========================================

export function readIgnore(root = ROOT) {
    return new Set(
        readFileSync(path.join(root, ".discloudignore"), "utf8")
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith("#"))
    );
}

// Caminhos relativos, com "/", em ordem alfabética (o zip sai sempre igual).
export function listFiles(root = ROOT, ignored = readIgnore(root)) {
    const files = [];

    const walk = dir => {
        for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
            if (ignored.has(entry.name)) continue;

            const relative = dir ? `${dir}/${entry.name}` : entry.name;

            if (entry.isDirectory()) walk(relative);
            else if (entry.isFile()) files.push(relative);
        }
    };

    walk("");

    return files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// O subdomínio do Discloud: 2 a 20 letras minúsculas, números e hífens.
export function validId(id) {
    return /^[a-z0-9-]{2,20}$/.test(String(id));
}

// Ajustes feitos só dentro do zip (o discloud.config do projeto não muda):
//   id     troca o subdomínio
//   first  primeira subida: o app nasce ANTES de dar para cadastrar as variáveis no
//          painel, então sem o token o bot cai. Sem reinício automático ele cai uma
//          vez, quieto, em vez de ficar reiniciando; o zip normal (sem --first) que
//          vem depois liga o AUTORESTART de volta e já ativa as variáveis.
function adjustConfig(config, { id, first } = {}) {
    let result = config;

    if (id !== undefined) {
        if (!validId(id)) {
            throw new Error(`ID inválido "${id}": use 2 a 20 letras minúsculas, números e hífens.`);
        }

        if (!/^ID=.*$/m.test(result)) {
            throw new Error("o discloud.config não tem a linha ID=.");
        }

        result = result.replace(/^ID=.*$/m, `ID=${id}`);
    }

    if (first) {
        if (!/^AUTORESTART=.*$/m.test(result)) {
            throw new Error("o discloud.config não tem a linha AUTORESTART=.");
        }

        result = result.replace(/^AUTORESTART=.*$/m, "AUTORESTART=false");
    }

    return result;
}

const SQLITE_HEADER = "SQLite format 3\0";

// Junta tudo que vai no zip: [{ name, data }].
export function collectEntries({ root = ROOT, id, seedDb, first = false } = {}) {
    const files = listFiles(root);

    if (!files.includes("discloud.config")) {
        throw new Error("não achei o discloud.config na raiz do projeto.");
    }

    const entries = files.map(name => ({
        name,
        data: name === "discloud.config"
            ? Buffer.from(adjustConfig(readFileSync(path.join(root, name), "utf8"), { id, first }), "utf8")
            : readFileSync(path.join(root, name))
    }));

    if (seedDb) {
        if (!existsSync(seedDb)) throw new Error(`não achei o banco ${seedDb}.`);

        const data = readFileSync(seedDb);

        if (data.subarray(0, 16).toString("latin1") !== SQLITE_HEADER) {
            throw new Error(`${seedDb} não é um banco SQLite. Gere com: npm run db:export -- helena-export.db`);
        }

        entries.push({ name: "data/helena.db", data });
    }

    // trava final: o que nunca pode ir no zip por engano
    for (const { name } of entries) {
        if (/(^|\/)\.env(\..*)?$/.test(name) && !name.endsWith(".example")) {
            throw new Error(`${name} não pode ir no zip (segredos vão pelo painel, em Variáveis).`);
        }

        if (name.startsWith("data/") && name !== "data/helena.db") {
            throw new Error(`${name}: só o banco de partida (data/helena.db) pode ir em data/.`);
        }
    }

    return entries;
}

// ==========================================
// O ZIP (sem dependências: deflate do Node + CRC32)
// ==========================================

const DOS_DATE = 0x0021;   // 01/01/1980: zip sempre igual para o mesmo conteúdo
const DOS_TIME = 0;

export function buildZip(entries) {
    const locals = [];
    const centrals = [];
    let offset = 0;

    for (const { name, data } of entries) {
        const nameBytes = Buffer.from(name, "utf8");
        const packed = deflateRawSync(data, { level: 9 });
        const crc = crc32(data);

        const local = Buffer.alloc(30);

        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);          // nomes em UTF-8
        local.writeUInt16LE(8, 8);               // deflate
        local.writeUInt16LE(DOS_TIME, 10);
        local.writeUInt16LE(DOS_DATE, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(packed.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        local.writeUInt16LE(0, 28);

        const central = Buffer.alloc(46);

        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(0x0314, 4);        // criado em Unix
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(8, 10);
        central.writeUInt16LE(DOS_TIME, 12);
        central.writeUInt16LE(DOS_DATE, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(packed.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt32LE((0o100644 << 16) >>> 0, 38);   // arquivo comum, rw-r--r--
        central.writeUInt32LE(offset, 42);

        locals.push(local, nameBytes, packed);
        centrals.push(central, nameBytes);

        offset += local.length + nameBytes.length + packed.length;
    }

    const directory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);

    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...locals, directory, end]);
}

// ==========================================
// LINHA DE COMANDO
// ==========================================

function parseArgs(argv) {
    const options = { force: false };

    for (const arg of argv) {
        if (arg === "--force") options.force = true;
        else if (arg === "--first") options.first = true;
        else if (arg.startsWith("--id=")) options.id = arg.slice(5);
        else if (arg.startsWith("--seed-db=")) options.seedDb = path.resolve(arg.slice(10));
        else if (arg.startsWith("--out=")) options.out = path.resolve(arg.slice(6));
        else throw new Error(`opção desconhecida: ${arg}`);
    }

    return options;
}

function main() {
    const options = parseArgs(process.argv.slice(2));

    const out = options.out ?? path.join(path.dirname(ROOT), "helena-discloud.zip");

    if (existsSync(out) && !options.force) {
        throw new Error(`${out} já existe. Use --force para sobrescrever ou --out= para outro nome.`);
    }

    const entries = collectEntries({ id: options.id, seedDb: options.seedDb, first: options.first });
    const zip = buildZip(entries);

    writeFileSync(out, zip);

    const config = entries.find(entry => entry.name === "discloud.config").data.toString("utf8");
    const id = /^ID=(.*)$/m.exec(config)?.[1];

    console.log(`✅ Zip pronto: ${out}`);
    console.log(`   ${entries.length} arquivos, ${(zip.length / 1024).toFixed(0)} KB | subdomínio (ID): ${id} | banco de partida: ${options.seedDb ? "SIM (data/helena.db)" : "não"} | primeira subida: ${options.first ? "SIM (sem reinício automático)" : "não"}`);

    if (!statSync(out).size) throw new Error("o zip saiu vazio.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        console.error("❌ " + error.message);

        process.exit(1);
    }
}
