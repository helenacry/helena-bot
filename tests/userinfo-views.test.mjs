import { db } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// O "Visualizações: N" do /userinfo vive no banco do bot: uma instrução atômica por
// consulta, sem arquivo. O JSON antigo (generated/userinfo/views.json) é importado uma vez.

// Qualquer arquivo perdido vai para uma pasta temporária, nunca para o projeto.
const workDir = mkdtempSync(path.join(tmpdir(), "helena-views-"));

process.chdir(workDir);

const { incrementUserinfoViews, getUserinfoViews, importLegacyViews } = await import("../services/userinfo-views.mjs");

const rows = () => Object.fromEntries(db.prepare("SELECT user_id, views FROM userinfo_views ORDER BY user_id").all().map(r => [r.user_id, r.views]));

const quietly = fn => {
    const original = console.warn;

    console.warn = () => {};

    try { return fn(); } finally { console.warn = original; }
};

test("cada consulta soma 1 para a pessoa consultada, e cada pessoa tem a sua contagem", async () => {
    assert.equal(await getUserinfoViews("100000000000000001"), 0, "quem nunca foi consultado tem 0");

    assert.equal(await incrementUserinfoViews("100000000000000001"), 1);
    assert.equal(await incrementUserinfoViews("100000000000000001"), 2);
    assert.equal(await incrementUserinfoViews("100000000000000002"), 1);
    assert.equal(await incrementUserinfoViews("0615ce1b-db76-442b-b296-7358b97ff03c"), 1, "ID em formato UUID também");

    assert.equal(await getUserinfoViews("100000000000000001"), 2);
    assert.equal(await getUserinfoViews("100000000000000002"), 1);

    // espaços em volta do ID não criam outra pessoa
    assert.equal(await incrementUserinfoViews("  100000000000000002  "), 2);
});

test("consultas ao mesmo tempo não perdem contagem: 200 de uma vez dão exatamente 200", async () => {
    const results = await Promise.all(Array.from({ length: 200 }, () => incrementUserinfoViews("100000000000000003")));

    assert.equal(await getUserinfoViews("100000000000000003"), 200);
    assert.equal(new Set(results).size, 200, "cada consulta recebeu um número diferente");
    assert.equal(Math.max(...results), 200);
});

test("ID vazio ou grande demais é recusado, e a consulta de um ID assim dá 0", async () => {
    for (const bad of ["", "   ", null, undefined, "x".repeat(65)]) {
        await assert.rejects(incrementUserinfoViews(bad), /ID do usuário/, String(bad));
    }

    assert.equal(await getUserinfoViews(""), 0);
    assert.equal(await getUserinfoViews("x".repeat(65)), 0);
});

test("o contador não cria arquivo nenhum", async () => {
    await incrementUserinfoViews("100000000000000004");

    assert.deepEqual(readdirSync(workDir), [], "nada foi gravado em disco, só no banco");
});

// ==========================================
// IMPORTAR O JSON ANTIGO
// ==========================================

const legacyFile = name => {
    const dir = mkdtempSync(path.join(tmpdir(), "helena-legacy-"));

    return path.join(dir, name);
};

test("importa o JSON antigo para o banco e renomeia o arquivo, sem apagar nada", () => {
    db.exec("DELETE FROM userinfo_views");

    const file = legacyFile("views.json");

    writeFileSync(file, JSON.stringify({
        "200000000000000001": 41,
        "0615ce1b-db76-442b-b296-7358b97ff03c": 8,
        "200000000000000002": 13
    }));

    const result = importLegacyViews(file);

    assert.equal(result.imported, 3);

    assert.deepEqual(rows(), {
        "0615ce1b-db76-442b-b296-7358b97ff03c": 8,
        "200000000000000001": 41,
        "200000000000000002": 13
    });

    assert.ok(!existsSync(file), "o arquivo antigo saiu do lugar");
    assert.ok(existsSync(file + ".imported"), "mas foi guardado como .imported");
    assert.equal(JSON.parse(readFileSync(file + ".imported", "utf8"))["200000000000000001"], 41, "com o conteúdo intacto");
});

test("importar de novo não soma em dobro, e o banco com contagem maior não diminui", async () => {
    db.exec("DELETE FROM userinfo_views");

    const file = legacyFile("views.json");
    const content = JSON.stringify({ "300000000000000001": 10, "300000000000000002": 5 });

    // o banco já tem uma contagem maior (consultas feitas depois da primeira importação)
    db.prepare("INSERT INTO userinfo_views (user_id, views) VALUES (?, ?)").run("300000000000000001", 25);

    writeFileSync(file, content);
    importLegacyViews(file);

    assert.deepEqual(rows(), { "300000000000000001": 25, "300000000000000002": 5 }, "MAX: nunca diminui");

    // a mesma importação outra vez (arquivo restaurado à mão): continua igual
    writeFileSync(file, content);
    importLegacyViews(file);

    assert.deepEqual(rows(), { "300000000000000001": 25, "300000000000000002": 5 }, "nunca soma em dobro");

    assert.equal(await incrementUserinfoViews("300000000000000002"), 6, "e a contagem segue de onde estava");
});

test("sem arquivo antigo, não faz nada; arquivo ilegível ou estranho não derruba nem importa", () => {
    db.exec("DELETE FROM userinfo_views");

    assert.deepEqual(importLegacyViews(path.join(workDir, "nao-existe.json")), { skipped: "sem arquivo antigo" });

    const broken = legacyFile("views.json");

    writeFileSync(broken, "{ isto não é json");

    assert.deepEqual(quietly(() => importLegacyViews(broken)), { skipped: "arquivo ilegível" });
    assert.ok(existsSync(broken), "o arquivo ilegível fica onde está, para alguém olhar");

    const list = legacyFile("views.json");

    writeFileSync(list, "[1, 2, 3]");

    assert.deepEqual(importLegacyViews(list), { skipped: "formato inesperado" });

    assert.deepEqual(rows(), {}, "nada entrou no banco");
});

test("só entram IDs e contagens válidos: o resto do arquivo é ignorado", () => {
    db.exec("DELETE FROM userinfo_views");

    const file = legacyFile("views.json");

    writeFileSync(file, JSON.stringify({
        "400000000000000001": 7,
        "400000000000000002": -3,        // negativo
        "400000000000000003": "muitas",  // não é número
        "400000000000000004": 2.5,       // não é inteiro
        "400000000000000005": null,
        "": 9,                           // sem ID
        ["z".repeat(65)]: 4              // ID grande demais
    }));

    assert.equal(importLegacyViews(file).imported, 1);
    assert.deepEqual(rows(), { "400000000000000001": 7 });
});

test("o módulo não importa o JSON sozinho ao carregar: só quando o bot manda (os testes não consomem o arquivo de verdade)", () => {
    const source = readFileSync(new URL("../services/userinfo-views.mjs", import.meta.url), "utf8");

    // importLegacyViews só é chamada em helena.mjs, nunca no corpo do módulo
    assert.doesNotMatch(source, /^importLegacyViews\(/m);

    const helena = readFileSync(new URL("../helena.mjs", import.meta.url), "utf8");

    assert.match(helena, /importLegacyViews\(\)/);
});
