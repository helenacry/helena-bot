import { db, getPlayer } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// O reembolso das Caixas misteriosas que já estavam nos inventários (services/economy/box-refund.mjs):
// a caixa saiu da loja em 12/11/2026 e quem a tinha ficou com um item que não abre nem vende.

const { BOX_REFUND_CENTS, BOX_REFUND_FIX, refundLegacyBoxes } = await import("../services/economy/box-refund.mjs");
const { addItem, getItemQuantity } = await import("../services/economy/inventory.mjs");
const { tx } = await import("../services/combat/combat.mjs");
const { formatMoney } = await import("../database/economy.mjs");

const ME = "111111111111111111";
const OTHER = "222222222222222222";

const MAX_CENTS = 100_000_000_000_000;

let counter = 0;

const guild = () => `g-refund-${++counter}`;

// Cada teste começa com a correção "ainda não rodou" e sem caixa nenhuma nos inventários (o banco de teste é um só
// por arquivo, e a correção olha todos os inventários).
function reset() {
    db.prepare("DELETE FROM data_fixes WHERE name = ?").run(BOX_REFUND_FIX);
    db.prepare("DELETE FROM inventory WHERE item_id = 'mystery_box'").run();
}

const wallet = (g, user = ME) => db.prepare("SELECT wallet FROM players WHERE guild_id = ? AND user_id = ?").get(g, user).wallet;

const ledger = (g, user = ME) => db.prepare("SELECT type, amount FROM transactions WHERE guild_id = ? AND user_id = ? ORDER BY id").all(g, user).map(row => ({ ...row }));

const owns = (g, item, user = ME) => getItemQuantity(g, user, item);

function give(g, user, item, quantity) {
    getPlayer(g, user);

    tx(() => addItem(g, user, item, quantity));
}

test("o reembolso é o preço antigo da caixa: R$ 100", () => {
    assert.equal(BOX_REFUND_CENTS, 10_000);
    assert.equal(formatMoney(BOX_REFUND_CENTS).replace(/\s/g, " "), "R$ 100,00");
});

test("cada caixa vira R$ 100 na carteira de quem a tinha, no servidor onde estava, e some do inventário", () => {
    reset();

    const a = guild();
    const b = guild();

    give(a, ME, "mystery_box", 3);
    give(b, OTHER, "mystery_box", 1);

    const before = wallet(a);
    const beforeOther = wallet(b, OTHER);

    const result = refundLegacyBoxes();

    assert.deepEqual(result, { people: 2, boxes: 4, cents: 4 * BOX_REFUND_CENTS, kept: 0 });

    assert.equal(wallet(a) - before, 3 * BOX_REFUND_CENTS);
    assert.equal(wallet(b, OTHER) - beforeOther, BOX_REFUND_CENTS);

    assert.equal(owns(a, "mystery_box"), 0);
    assert.equal(owns(b, "mystery_box", OTHER), 0);

    assert.deepEqual(ledger(a), [{ type: "box_refund", amount: 3 * BOX_REFUND_CENTS }]);
    assert.deepEqual(ledger(b, OTHER), [{ type: "box_refund", amount: BOX_REFUND_CENTS }]);
});

test("devolve o total certo e conta pessoas, caixas e centavos", () => {
    reset();

    const g = guild();

    give(g, ME, "mystery_box", 2);
    give(g, OTHER, "mystery_box", 5);

    assert.deepEqual(refundLegacyBoxes(), { people: 2, boxes: 7, cents: 7 * BOX_REFUND_CENTS, kept: 0 });
});

test("roda uma vez só: caixa que aparecer depois (de graça) não é reembolsada na subida seguinte", () => {
    reset();

    const g = guild();

    give(g, ME, "mystery_box", 1);

    assert.notEqual(refundLegacyBoxes(), null);

    // um prêmio de graça, bem depois
    give(g, ME, "mystery_box", 2);

    const before = wallet(g);

    assert.equal(refundLegacyBoxes(), null, "já rodou");
    assert.equal(owns(g, "mystery_box"), 2, "a caixa nova continua com a pessoa");
    assert.equal(wallet(g), before);

    assert.deepEqual(ledger(g), [{ type: "box_refund", amount: BOX_REFUND_CENTS }]);
});

test("sem nenhuma caixa nos inventários, a correção também conta como feita", () => {
    reset();

    assert.deepEqual(refundLegacyBoxes(), { people: 0, boxes: 0, cents: 0, kept: 0 });

    // e uma caixa que chegar depois não é tocada
    const g = guild();

    give(g, ME, "mystery_box", 1);

    assert.equal(refundLegacyBoxes(), null);
    assert.equal(owns(g, "mystery_box"), 1);
});

test("outros itens e o dinheiro que já estava lá não são tocados", () => {
    reset();

    const g = guild();

    give(g, ME, "mystery_box", 1);
    give(g, ME, "supply_pack", 4);
    give(g, ME, "apple", 7);

    db.prepare("UPDATE players SET wallet = 12345 WHERE guild_id = ? AND user_id = ?").run(g, ME);

    refundLegacyBoxes();

    assert.equal(owns(g, "supply_pack"), 4);
    assert.equal(owns(g, "apple"), 7);
    assert.equal(wallet(g), 12345 + BOX_REFUND_CENTS);
});

test("carteira no teto: devolve só as caixas cujo dinheiro cabe, e as outras continuam com a pessoa", () => {
    reset();

    const g = guild();

    give(g, ME, "mystery_box", 5);

    // cabem 2 reembolsos (R$ 200) e sobram R$ 50
    db.prepare("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?").run(MAX_CENTS - 2 * BOX_REFUND_CENTS - 5_000, g, ME);

    assert.deepEqual(refundLegacyBoxes(), { people: 1, boxes: 2, cents: 2 * BOX_REFUND_CENTS, kept: 3 });

    assert.equal(wallet(g), MAX_CENTS - 5_000);
    assert.equal(owns(g, "mystery_box"), 3, "nada se perde: as que não couberam ficam");

    assert.deepEqual(ledger(g), [{ type: "box_refund", amount: 2 * BOX_REFUND_CENTS }]);
});

test("a carteira cheia de verdade: nenhuma caixa sai e nenhum dinheiro some", () => {
    reset();

    const g = guild();

    give(g, ME, "mystery_box", 2);

    db.prepare("UPDATE players SET wallet = ? WHERE guild_id = ? AND user_id = ?").run(MAX_CENTS, g, ME);

    refundLegacyBoxes();

    assert.equal(owns(g, "mystery_box"), 2);
    assert.equal(wallet(g), MAX_CENTS);
    assert.deepEqual(ledger(g), []);
});

test("o helena.mjs roda o reembolso na subida, depois de criar a tabela, sem derrubar o bot se falhar", () => {
    const source = readFileSync(new URL("../helena.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n");

    const table = source.indexOf("runDataFixesMigrations();");
    const refund = source.indexOf("refundLegacyBoxes();");

    assert.ok(table > 0 && refund > table, "cria a tabela antes de reembolsar");

    const block = source.slice(table, source.indexOf("importLegacyViews();"));

    assert.match(block, /try \{[\s\S]*refundLegacyBoxes\(\)[\s\S]*\} catch/, "uma falha só avisa");
});
