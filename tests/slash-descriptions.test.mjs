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

// ==========================================
// A LISTA DE COMANDOS EM INGLÊS
// ==========================================

// O Discord mostra a lista de comandos no idioma do aplicativo de quem digita "/": o registro leva a
// descrição em inglês (description_localizations), montada a partir do dicionário de inglês.
test("os comandos dos jogadores levam a descrição em inglês (com a etiqueta traduzida), no limite de 100 caracteres", async () => {
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

    // um exemplo conhecido de cada parte
    assert.deepEqual(byName.get("saldo").description_localizations, {
        "en-US": "[💰 Economy] Check your financial situation",
        "en-GB": "[💰 Economy] Check your financial situation"
    });

    assert.equal(byName.get("crime").description_localizations["en-US"], "[🕵️ Crime] Commit a crime in search of dirty money");
    assert.equal(byName.get("atacar").description_localizations["en-US"], "[⚔️ Combat] Challenge another player to a duel");

    // a opção e as escolhas dela também
    const tipo = byName.get("ranking").options.find(option => option.name === "tipo");

    assert.equal(tipo.description_localizations["en-US"], "Choose the ranking");
    assert.equal(tipo.choices.find(choice => choice.value === "money").name_localizations["en-US"], "Net worth");
    assert.equal(tipo.choices.find(choice => choice.value === "money").name, "Patrimônio", "o português continua sendo o padrão");

    // os aliases levam o mesmo
    assert.deepEqual(byName.get("help").description_localizations, byName.get("ajuda").description_localizations);

    for (const [name, command] of comandos) {
        const folder = String(origem.get(name)).split("/")[0];

        const registered = byName.get(name);

        if (folder === "admin" || folder === "dev") {
            // os comandos do dono ficam só em português
            assert.equal(registered.description_localizations, undefined, `/${name}`);

            continue;
        }

        if (name === "testembed") continue;

        const text = registered.description_localizations?.["en-US"];

        assert.ok(text, `/${name}: sem descrição em inglês`);
        assert.ok(text.length <= 100, `/${name}: ${text.length} caracteres`);
        assert.match(text, /^\[\S+ [^\]]+\] \S/u, `/${name}: ${text}`);
        assert.doesNotMatch(text, /Economia|Utilidades|Progresso|Combate/, `/${name}: a etiqueta continua em português`);

        for (const option of command.options ?? []) {
            const out = registered.options.find(item => item.name === option.name);

            assert.ok(out.description_localizations?.["en-US"], `/${name} ${option.name}: sem descrição em inglês`);
            assert.ok(out.description_localizations["en-US"].length <= 100, `/${name} ${option.name}`);

            for (const choice of out.choices ?? []) {
                assert.ok(choice.name_localizations?.["en-US"] || choice.name_localizations === undefined, `/${name} ${option.name}`);
            }
        }
    }
});
