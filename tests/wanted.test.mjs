import { db, set } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { listWanted } = await import("../services/crime/wanted.mjs");
const { savePlayerName } = await import("../services/platform/player-names.mjs");
const { imprison } = await import("../services/crime/prison.mjs");
const { ensureCrimePlayer } = await import("../services/crime/crime-player.mjs");

const G = "g-wanted";
const T0 = 1_800_000_000;

function seed(count) {
    db.exec("DELETE FROM crime_players; DELETE FROM prison_players;");

    for (let i = 1; i <= count; i++) {
        const id = "user" + String(i).padStart(2, "0");

        savePlayerName({ id, displayName: "Jogador " + i });
        ensureCrimePlayer(G, id);

        // user01 tem a maior ficha, depois user02...
        set(
            "UPDATE crime_players SET criminal_record = ? WHERE guild_id=? AND user_id=?",
            count - i + 1,
            G,
            id
        );
    }
}

test("lista vazia quando ninguém tem ficha", () => {
    db.exec("DELETE FROM crime_players");

    const wanted = listWanted(G);

    assert.equal(wanted.total, 0);
    assert.equal(wanted.pages, 1);
    assert.deepEqual(wanted.entries, []);
});

test("quem tem ficha 0 não aparece", () => {
    seed(3);
    set("UPDATE crime_players SET criminal_record = 0 WHERE user_id = 'user03'");

    const wanted = listWanted(G);

    assert.equal(wanted.total, 2);
    assert.ok(wanted.entries.every(entry => entry.userId !== "user03"));
});

test("ordena pela maior ficha e pagina de 8 em 8", () => {
    seed(20);

    const first = listWanted(G, 1);

    assert.equal(first.total, 20);
    assert.equal(first.pages, 3);
    assert.equal(first.entries.length, 8);
    assert.equal(first.entries[0].userId, "user01");
    assert.equal(first.entries[0].record, 20);
    assert.equal(first.entries[0].position, 1);
    assert.equal(first.entries[0].name, "Jogador 1");

    const third = listWanted(G, 3);

    assert.equal(third.entries.length, 4);
    assert.equal(third.entries[0].position, 17);
});

test("a página pedida é limitada ao que existe", () => {
    seed(10);

    assert.equal(listWanted(G, 99).page, 2);
    assert.equal(listWanted(G, 0).page, 1);
    assert.equal(listWanted(G, -5).page, 1);
    assert.equal(listWanted(G, "abc").page, 1);
    assert.equal(listWanted(G, 2.9).page, 2);
});

test("mostra quem está preso agora", () => {
    seed(3);

    imprison(G, "user02", 1800, "teste", T0);

    const wanted = listWanted(G, 1, T0 + 10);

    const byId = Object.fromEntries(wanted.entries.map(e => [e.userId, e.jailed]));

    assert.deepEqual(byId, { user01: false, user02: true, user03: false });

    // depois da pena, não aparece mais como preso
    const later = listWanted(G, 1, T0 + 3600);

    assert.ok(later.entries.every(entry => entry.jailed === false));
});

test("cada servidor tem a sua lista", () => {
    seed(3);

    assert.equal(listWanted("outro-servidor").total, 0);
});

test("sem nome salvo, usa um nome genérico com o final do ID", () => {
    db.exec("DELETE FROM crime_players");

    ensureCrimePlayer(G, "semnome-9876");
    set("UPDATE crime_players SET criminal_record = 1 WHERE user_id = 'semnome-9876'");

    assert.equal(listWanted(G).entries[0].name, "Jogador 9876");
});
