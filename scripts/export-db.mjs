// Exporta o banco para UM arquivo limpo (sem o -wal ao lado): serve para levar o
// banco para a nuvem e para tirar backup, aqui ou lá dentro da hospedagem.
//
//   npm run db:export -- saida.db
//   railway ssh -- node scripts/export-db.mjs /data/backup.db
//
// Lê o banco de HELENA_DATABASE_PATH (padrão: data/helena.db) e NÃO sobrescreve
// um arquivo que já exista. Pare o bot antes de exportar para migrar: o que
// acontecer depois da cópia não vai junto.

import { DatabaseSync } from "node:sqlite";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const fail = message => {
    console.error("❌ " + message);

    process.exit(1);
};

const source = resolve(process.env.HELENA_DATABASE_PATH || "data/helena.db");
const target = resolve(process.argv[2] || "helena-export.db");

if (!existsSync(source)) {
    fail(`Não achei o banco em ${source}.`);
}

if (existsSync(target)) {
    fail(`${target} já existe. Escolha outro nome, para não sobrescrever nada.`);
}

const db = new DatabaseSync(source);

try {
    // junta o que ainda está no -wal e escreve tudo, de forma consistente, em um arquivo só
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
} finally {
    db.close();
}

// confere a cópia: abre o arquivo novo e conta o que o bot guarda de mais importante
const copy = new DatabaseSync(target);

try {
    const count = table => {
        try {
            return copy.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c;
        } catch {
            return "?";
        }
    };

    console.log(`✅ Banco exportado para ${target}`);
    console.log(`   ${(statSync(target).size / 1024).toFixed(1)} KB | jogadores: ${count("players")} | contas globais: ${count("global_users")} | transações: ${count("transactions")}`);
} finally {
    copy.close();
}
