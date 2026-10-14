import { db, getPlayer, get } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// npm run db:export: o banco inteiro em UM arquivo, para levar para a nuvem.

const SCRIPT = fileURLToPath(new URL("../scripts/export-db.mjs", import.meta.url));

const run = (target, env = {}) => spawnSync(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", SCRIPT, ...(target ? [target] : [])],
    { env: { ...process.env, ...env }, encoding: "utf8" }
);

test("exporta o banco para um arquivo só, completo e legível, sem sobrar -wal", () => {
    getPlayer("g-export", "u-export");

    db.prepare("UPDATE players SET wallet = 123456 WHERE guild_id = ? AND user_id = ?").run("g-export", "u-export");

    const dir = mkdtempSync(path.join(tmpdir(), "helena-export-"));
    const target = path.join(dir, "saida.db");

    const result = run(target);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Banco exportado/);
    assert.match(result.stdout, /jogadores: \d+/);

    // é um arquivo só: nada de -wal nem -shm ao lado
    assert.deepEqual(readdirSync(dir), ["saida.db"]);

    // e tem os dados, inclusive o que ainda estava no -wal do banco de origem
    const copy = new DatabaseSync(target);

    try {
        const row = copy.prepare("SELECT wallet FROM players WHERE guild_id = ? AND user_id = ?").get("g-export", "u-export");

        assert.equal(row.wallet, 123456);
    } finally {
        copy.close();
    }

    assert.ok(get("SELECT COUNT(*) c FROM players").c >= 1, "o banco de origem continua intacto");
});

test("não sobrescreve um arquivo que já existe e avisa quando não acha o banco", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "helena-export-"));
    const target = path.join(dir, "ja-existe.db");

    assert.equal(run(target).status, 0);

    const again = run(target);

    assert.equal(again.status, 1);
    assert.match(again.stderr, /já existe/);

    const missing = run(path.join(dir, "outro.db"), { HELENA_DATABASE_PATH: path.join(dir, "nao-existe.db") });

    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Não achei o banco/);
    assert.ok(!existsSync(path.join(dir, "outro.db")), "não cria nada quando falha");
});

test("o npm run db:export existe e o script vai dentro da imagem (dá para exportar de dentro da nuvem)", async () => {
    const { readFileSync } = await import("node:fs");

    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

    assert.match(pkg.scripts["db:export"], /scripts\/export-db\.mjs/);

    const ignore = readFileSync(new URL("../.dockerignore", import.meta.url), "utf8");

    assert.doesNotMatch(ignore, /^scripts\/?$/m);
    assert.ok(execFileSync);
});
