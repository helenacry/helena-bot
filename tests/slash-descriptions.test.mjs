import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { carregarComandos, comandosCarregados, registrarComandos } = await import("../command-registry.mjs");
const { COMMAND_CATEGORIES, categoryOf, slashTag, slashDescription } = await import("../config/command-categories.mjs");

// ==========================================
// A ETIQUETA
// ==========================================

test("slashTag: a categoria entre colchetes, com o emoji dela, e uma etiqueta própria para admin e dev", () => {
    assert.equal(slashTag("daily", "economy"), "[💰 Economia] ");
    assert.equal(slashTag("crime", "crime"), "[🕵️ Crime] ");
    assert.equal(slashTag("atacar", "social"), "[⚔️ Combate] ", "os duelos moram em social/, mas são combate");
    assert.equal(slashTag("conquistas", "progress"), "[🏆 Progresso] ");
    assert.equal(slashTag("casar", "social"), "[💍 Social] ");
    assert.equal(slashTag("ping", "utility"), "[⚙️ Utilidades] ");

    assert.equal(slashTag("adminsaldo", "admin"), "[🔧 Admin] ");
    assert.equal(slashTag("devreset", "dev"), "[🧪 Dev] ");

    // comando sem pasta conhecida cai em utilidades
    assert.equal(slashTag("qualquer", "pasta-nova"), "[⚙️ Utilidades] ");
});

test("slashDescription: etiqueta + descrição, cortada com … para caber nos 100 caracteres do Discord", () => {
    assert.equal(slashDescription("daily", "economy", "Veja o seu daily"), "[💰 Economia] Veja o seu daily");

    // espaços e quebras das pontas não entram
    assert.equal(slashDescription("daily", "economy", "  Veja  "), "[💰 Economia] Veja");

    const long = slashDescription("daily", "economy", "palavra ".repeat(40));

    assert.equal(long.length, 100, "usa o espaço todo");
    assert.ok(long.endsWith("…"));
    assert.ok(long.startsWith("[💰 Economia] palavra"));

    // o emoji de dois pedaços (⚔️ = 2 unidades) também cabe
    const combat = slashDescription("atacar", "social", "x".repeat(200));

    assert.ok(combat.length <= 100);

    // descrição ausente não quebra
    assert.equal(slashDescription("daily", "economy", undefined), "[💰 Economia] ");
});

// ==========================================
// O REGISTRO NO DISCORD
// ==========================================

test("todo comando e todo alias registrados levam a etiqueta da categoria na descrição, dentro dos 100 caracteres", async () => {
    const comandos = await carregarComandos();

    let body = null;

    const original = globalThis.fetch;
    const log = console.log;

    globalThis.fetch = async (url, init) => {
        body = JSON.parse(init.body);

        return { ok: true, status: 200, text: async () => "" };
    };

    console.log = () => {};

    try {
        await registrarComandos("APP", comandos);

    } finally {
        globalThis.fetch = original;
        console.log = log;
    }

    const { origem } = comandosCarregados();

    const byName = new Map(body.map(command => [command.name, command]));

    assert.ok(body.length > 0);

    for (const command of body) {
        assert.match(command.description, /^\[\S+ [^\]]+\] \S/u, `/${command.name}: ${command.description}`);
        assert.ok(command.description.length <= 100, `/${command.name} (${command.description.length})`);
    }

    // a etiqueta é a da categoria de verdade do comando
    for (const [name, command] of comandos) {
        const folder = String(origem.get(name)).split("/")[0];

        assert.ok(
            byName.get(name).description.startsWith(slashTag(name, folder)),
            `/${name} (${categoryOf(name, folder)})`
        );

        // e o resto é a descrição do próprio comando
        assert.ok(byName.get(name).description.includes(command.description.slice(0, 20)), `/${name}`);
    }

    // o alias leva a mesma descrição (e a mesma etiqueta) do comando
    assert.equal(byName.get("help").description, byName.get("ajuda").description);
    assert.equal(byName.get("top").description, byName.get("ranking").description);

    // a lista só tem as categorias conhecidas, mais Admin e Dev
    const allowed = new Set([...COMMAND_CATEGORIES.map(category => category.label), "Admin", "Dev"]);

    for (const command of body) {
        const label = command.description.match(/^\[\S+ ([^\]]+)\]/u)[1];

        assert.ok(allowed.has(label), `/${command.name}: categoria "${label}"`);
    }
});

test("a etiqueta fica só no registro: a ajuda, o site e a wiki seguem com a descrição pura", async () => {
    const comandos = await carregarComandos();

    for (const command of comandos.values()) {
        assert.doesNotMatch(command.description, /^\[/, `/${command.name}`);
    }
});
