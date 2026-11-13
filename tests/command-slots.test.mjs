import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// As vagas de comando de barra: o Discord aceita no máximo 100 por lista. Os comandos do dono (pastas admin e dev)
// vão só para o servidor de suporte, e a lista global fica para os jogadores (command-registry.mjs).

const { carregarComandos, comandosCarregados, registrarComandos } = await import("../command-registry.mjs");
const { HIDDEN_FOLDERS } = await import("../config/command-categories.mjs");

const quietly = async fn => {
    const log = console.log;
    console.log = () => {};

    try { return await fn(); } finally { console.log = log; }
};

const comandos = await quietly(() => carregarComandos());

const { origem } = comandosCarregados();

const SUPPORT = "123456789012345678";

const folderOf = command => String(origem.get(command.name) ?? "").split("/")[0];

// quem é do dono (e os aliases deles), pelos nomes
const owner = Object.freeze([...comandos.values()].filter(command => HIDDEN_FOLDERS.has(folderOf(command))));

const ownerNames = new Set(owner.flatMap(command => [command.name, ...(command.aliases ?? [])]));

// Registra com um Discord de mentira. Devolve as chamadas (método, caminho, corpo) e o que foi escrito no aviso.
async function register(supportGuildId, { guildStatus = 200 } = {}) {
    const calls = [];
    const warnings = [];

    const fetchBefore = globalThis.fetch;
    const warnBefore = console.warn;

    globalThis.fetch = async (url, init) => {
        const path = new URL(url).pathname.replace(/^\/api\/v\d+/, "");

        calls.push({ method: init.method, path, body: JSON.parse(init.body) });

        const forGuild = path.includes("/guilds/");

        return forGuild && guildStatus !== 200
            ? { ok: false, status: guildStatus, text: async () => JSON.stringify({ message: "Missing Access" }) }
            : { ok: true, status: 200, text: async () => "[]" };
    };

    console.warn = (...args) => warnings.push(args.join(" "));

    try {
        await quietly(() => registrarComandos("APP", comandos, { supportGuildId }));

    } finally {
        globalThis.fetch = fetchBefore;
        console.warn = warnBefore;
    }

    return { calls, warnings };
}

test("há comandos do dono para tirar da lista global (admin e dev)", () => {
    assert.ok(owner.length >= 15, `são ${owner.length}`);
    assert.deepEqual([...new Set(owner.map(folderOf))].sort(), ["admin", "dev"]);
});

test("com servidor de suporte: a lista global leva só os jogadores e o servidor de suporte leva os do dono", async () => {
    const { calls, warnings } = await register(SUPPORT);

    assert.deepEqual(warnings, []);
    assert.deepEqual(calls.map(call => `${call.method} ${call.path}`), [
        "PUT /applications/APP/commands",
        `PUT /applications/APP/guilds/${SUPPORT}/commands`
    ]);

    const [global, guild] = calls.map(call => call.body);

    // nada do dono na lista global, nem pelo alias
    assert.deepEqual(global.filter(command => ownerNames.has(command.name)), []);

    // o servidor de suporte leva todos os do dono e nada mais
    assert.deepEqual(new Set(guild.map(command => command.name)), ownerNames);

    // nenhum comando some: global + suporte = tudo
    const total = comandos.size + [...comandos.values()].reduce((sum, command) => sum + (command.aliases?.length ?? 0), 0);

    assert.equal(global.length + guild.length, total);

    // os novos comandos entram na lista dos jogadores
    assert.ok(global.some(command => command.name === "abrir"), "/abrir está na lista global");
});

test("sobram vagas na lista global para os próximos comandos (pesca, mochila, drops)", async () => {
    const { calls } = await register(SUPPORT);

    const used = calls[0].body.length;

    assert.ok(used <= 100, `${used} comandos globais`);
    assert.ok(100 - used >= 10, `só ${100 - used} vagas livres: confira os aliases antes de criar mais comandos`);
});

test("os comandos do dono mantêm a descrição só em português no servidor de suporte (ninguém mais os vê)", async () => {
    const { calls } = await register(SUPPORT);

    for (const command of calls[1].body) {
        assert.equal(command.description_localizations, undefined, command.name);
    }
});

test("se o registro no servidor de suporte falhar, o bot sobe: só avisa, e a lista global já foi", async () => {
    const { calls, warnings } = await register(SUPPORT, { guildStatus: 403 });

    assert.equal(calls.length, 2);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Não consegui registrar os comandos do dono no servidor de suporte/);
    assert.match(warnings[0], /prefixo h/);
});

const totalOf = () => comandos.size + [...comandos.values()].reduce((sum, command) => sum + (command.aliases?.length ?? 0), 0);

// comandos de mentira para a lista dos jogadores passar do teto (a contagem do projeto muda a cada comando novo)
function withFillers(count, fn) {
    const names = Array.from({ length: count }, (_, index) => `enchimento${index}`);

    for (const name of names) {
        comandos.set(name, { name, description: "x", execute() {} });
    }

    return Promise.resolve(fn()).finally(() => names.forEach(name => comandos.delete(name)));
}

test("sem servidor de suporte (ou com um ID inválido) e sem folga, os do dono ficam só pelo prefixo h e o log avisa", async () => {
    // com tudo junto passa de 100 (os dos jogadores, sozinhos, ainda cabem)
    await withFillers(Math.max(1, 101 - totalOf()), async () => {
        assert.ok(totalOf() > 100, "o total passa do teto");
        assert.ok(totalOf() - owner.length <= 100, "mas a lista dos jogadores sozinha cabe");

        for (const bad of [undefined, "", "abc", "123", "12345678901234567890123"]) {
            const { calls, warnings } = await register(bad);

            assert.equal(calls.length, 1, `${bad}: só a lista global`);
            assert.equal(calls[0].path, "/applications/APP/commands");
            assert.deepEqual(calls[0].body.filter(command => ownerNames.has(command.name)), [], `${bad}: sem os do dono`);
            assert.ok(calls[0].body.length <= 100);

            assert.equal(warnings.length, 1, String(bad));
            assert.match(warnings[0], /Sem HELENA_SUPPORT_GUILD_ID/);
            assert.match(warnings[0], /prefixo h/);
        }
    });
});

test("sem servidor de suporte mas com folga, os do dono ficam na lista global como antes", async () => {
    assert.ok(totalOf() <= 100, "o projeto cabe no teto com tudo junto");

    const { calls, warnings } = await register(undefined);

    assert.equal(calls.length, 1);
    assert.deepEqual(warnings, []);
    assert.ok(calls[0].body.length <= 100);

    for (const name of ownerNames) {
        assert.ok(calls[0].body.some(command => command.name === name), `${name} ficou na lista global`);
    }
});

test("a lista global dos jogadores sozinha acima do teto é recusada, com ou sem servidor de suporte", async () => {
    await withFillers(Math.max(1, 101 - (totalOf() - owner.length)), async () => {
        let called = false;

        const before = globalThis.fetch;

        globalThis.fetch = async () => { called = true; return { ok: true, status: 200, text: async () => "[]" }; };

        try {
            await assert.rejects(() => quietly(() => registrarComandos("APP", comandos, { supportGuildId: SUPPORT })), /limite de 100/);

        } finally {
            globalThis.fetch = before;
        }

        assert.equal(called, false, "nem chegou a chamar a API");
    });
});
