import { db, createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { firstTimeSeen, sweep, KEEP_SECONDS } = await import("../services/platform/interaction-dedup.mjs");

const count = () => db.prepare("SELECT COUNT(*) AS n FROM processed_interactions").get().n;

const G = "g-dedup";
const ANA = { id: "100000000000000051", username: "ana", displayName: "Ana" };

// ==========================================
// O REGISTRO
// ==========================================

test("a primeira vez passa, a repetida é descartada, e cada identificador vale por si", () => {
    db.exec("DELETE FROM processed_interactions");

    assert.equal(firstTimeSeen("1001"), true);
    assert.equal(firstTimeSeen("1001"), false, "o mesmo evento de novo");
    assert.equal(firstTimeSeen("1001"), false, "e de novo");
    assert.equal(firstTimeSeen("1002"), true, "outro evento");
    assert.equal(firstTimeSeen("m:1001"), true, "mensagem e interação não se confundem");
    assert.equal(firstTimeSeen("m:1001"), false);

    assert.equal(count(), 3);
});

test("sem identificador não há como saber: o evento segue como sempre, e nada é gravado", () => {
    db.exec("DELETE FROM processed_interactions");

    for (const id of [undefined, null, ""]) {
        assert.equal(firstTimeSeen(id), true);
        assert.equal(firstTimeSeen(id), true);
    }

    assert.equal(count(), 0);
});

test("o registro vence: só o que passou de uma hora é apagado", () => {
    db.exec("DELETE FROM processed_interactions");

    const now = 1_800_000_000;
    const insert = db.prepare("INSERT INTO processed_interactions (interaction_id, created_at) VALUES (?, ?)");

    insert.run("velho-1", now - KEEP_SECONDS - 1);
    insert.run("velho-2", now - KEEP_SECONDS);
    insert.run("novo-1", now - KEEP_SECONDS + 1);
    insert.run("novo-2", now);

    assert.equal(sweep(now), 2);
    assert.deepEqual(
        db.prepare("SELECT interaction_id FROM processed_interactions ORDER BY interaction_id").all().map(row => row.interaction_id),
        ["novo-1", "novo-2"]
    );

    // um evento apagado volta a ser "novo", como se nunca tivesse existido
    assert.equal(firstTimeSeen("velho-1"), true);
});

test("a limpeza roda sozinha, a cada tantos eventos novos, e não a cada um", () => {
    db.exec("DELETE FROM processed_interactions");

    db.prepare("INSERT INTO processed_interactions (interaction_id, created_at) VALUES (?, ?)").run("antigo", 1);

    // 500 eventos novos (o contador do módulo anda também nos testes acima: confere pelo efeito)
    for (let i = 0; i < 500; i++) {
        firstTimeSeen(`lote-${i}`);
    }

    const left = db.prepare("SELECT interaction_id FROM processed_interactions WHERE interaction_id = 'antigo'").get();

    assert.equal(left, undefined, "a limpeza automática levou o registro antigo");
    assert.ok(count() >= 500, "e deixou os eventos de agora");
});

// ==========================================
// NO PREFIXO
// ==========================================

test("pelo prefixo: a mesma mensagem entregue duas vezes roda uma só", async () => {
    db.exec("DELETE FROM processed_interactions");

    const run = await createPrefixRunner({
        guildId: G,
        author: ANA,
        firstTime: firstTimeSeen,
        messageId: () => "mensagem-repetida"
    });

    const first = await run("hsaldo");

    assert.equal(first.sent.length, 1);

    // o Discord entregou o mesmo evento de novo (mesmo id): nada responde, nada roda
    const again = await run("hsaldo");

    assert.equal(again.sent.length, 0);
});

test("pelo prefixo: mensagens diferentes rodam, e conversa que só começa com h não grava nada", async () => {
    db.exec("DELETE FROM processed_interactions");

    let n = 0;

    const run = await createPrefixRunner({
        guildId: G,
        author: ANA,
        firstTime: firstTimeSeen,
        messageId: () => `mensagem-${++n}`
    });

    assert.equal((await run("hsaldo")).sent.length, 1);
    assert.equal((await run("hsaldo")).sent.length, 1, "outra mensagem, outro id");

    const before = count();

    assert.equal((await run("hoje foi um dia legal")).sent.length, 0);
    assert.equal((await run("hxyzabc")).sent.length, 0);

    assert.equal(count(), before, "só comando de verdade é registrado: o bate-papo comum não enche o banco");
});

// ==========================================
// NO BOT (helena.mjs não roda em teste: confere a ordem no código)
// ==========================================

test("o bot descarta a interação repetida antes de qualquer outra coisa, e passa a conferência ao prefixo", () => {
    const source = readFileSync(new URL("../helena.mjs", import.meta.url), "utf8");

    const find = (text, from = 0) => {
        const at = source.indexOf(text, from);

        assert.ok(at >= 0, `não achei «${text}» em helena.mjs`);

        return at;
    };

    const start = find("async function tratarInteracao(interaction)");
    const dedup = find("firstTimeSeen(interaction.id)", start);
    const protection = find("PROTEÇÃO DO DESENVOLVEDOR", start);
    const log = find("[INTERAÇÃO]", start);

    assert.ok(dedup < protection, "a repetida é descartada antes de qualquer resposta");
    assert.ok(dedup < log);

    // o prefixo recebe a função de verdade (por padrão nada é descartado, para os testes)
    assert.match(source.slice(find("await processarPrefixo({"), find("[ERRO PREFIXO]")), /firstTime:\s*firstTimeSeen/);
});

test("quem está bloqueado ou em manutenção não tem nome nem histórico gravados nos comandos de barra", () => {
    const source = readFileSync(new URL("../helena.mjs", import.meta.url), "utf8");

    const start = source.indexOf("async function tratarInteracao(interaction)");

    const protection = source.indexOf("PROTEÇÃO DO DESENVOLVEDOR", start);
    const refuse = source.indexOf("mensagemErro(reason)", protection);
    const saveName = source.indexOf("savePlayerName(", start);
    const history = source.indexOf("observeUserinfoHistory(", start);
    const component = source.indexOf("interaction.type === \"component\"", start);

    assert.ok(protection > 0 && refuse > protection && saveName > 0 && history > 0);

    assert.ok(saveName > refuse, "o nome só é gravado depois de passar pela recusa");
    assert.ok(history > refuse, "o histórico também");
    assert.ok(saveName < component && history < component, "e antes de rodar qualquer comando, botão ou formulário");
});
