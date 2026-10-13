import { createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { carregarComandos, resolverComando, registrarComandos } =
    await import("../command-registry.mjs");

const silently = async fn => {
    const log = console.log;
    console.log = () => {};

    try {
        return await fn();
    } finally {
        console.log = log;
    }
};

const comandos = await silently(() => carregarComandos());

const run = await createPrefixRunner({
    guildId: "222222222222222222",
    author: { id: "111111111111111111", username: "t", displayName: "T" }
});

test("os aliases apontam para o comando certo", () => {
    const expected = {
        bal: "saldo", carteira: "saldo", inv: "inventario", dep: "depositar",
        work: "trabalhar", top: "ranking", rank: "ranking", diario: "daily",
        missao: "missoes", profile: "perfil", pagar: "transferir", ui: "userinfo",
        cd: "cooldowns", help: "ajuda", comandos: "ajuda", lav: "lavagem",
        lavar: "lavagem", lavstatus: "lavageminfo", cadeia: "prisao",
        assaltar: "roubar", wanted: "procurados"
    };

    for (const [alias, name] of Object.entries(expected)) {
        assert.equal(resolverComando(comandos, alias)?.name, name, alias);
        assert.equal(comandos.has(alias), false, `${alias} não é comando próprio`);
    }

    assert.equal(resolverComando(comandos, "naoexiste"), undefined);
});

test("pelo prefixo, o alias responde igual ao comando", async () => {
    const pairs = [
        ["hsaldo", "hbal"],
        ["hcooldowns", "hcd"],
        ["hajuda", "hhelp"],
        ["hprisao", "hcadeia"],
        ["hlavagem", "hlav"],
        ["hlavageminfo", "hlavstatus"]
    ];

    for (const [command, alias] of pairs) {
        const a = await run(command);
        const b = await run(alias);

        assert.ok(a.title, command);
        assert.equal(b.title, a.title, `${alias} = ${command}`);
    }
});

test("comando inexistente continua ignorado", async () => {
    const r = await run("hnaoexiste");

    assert.equal(r.sent.length, 0);
});

test("o registro na VSync inclui cada alias com a mesma descrição e opções", async () => {
    let body = null;

    const original = globalThis.fetch;

    globalThis.fetch = async (url, init) => {
        body = JSON.parse(init.body);

        return { ok: true, status: 200, text: async () => "" };
    };

    try {
        await silently(() => registrarComandos("APP", comandos));
    } finally {
        globalThis.fetch = original;
    }

    const byName = new Map(body.map(c => [c.name, c]));

    assert.equal(byName.size, body.length, "nenhum nome repetido");
    assert.ok(body.length <= 100, "dentro do limite da VSync");
    assert.ok(body.every(c => /^[a-z0-9_-]{1,32}$/.test(c.name)), "nomes válidos");
    assert.ok(body.every(c => c.description.length >= 1 && c.description.length <= 100));

    for (const [alias, name] of [["help", "ajuda"], ["lav", "lavagem"], ["profile", "perfil"], ["assaltar", "roubar"]]) {
        const a = byName.get(alias);
        const c = byName.get(name);

        assert.ok(a, `/${alias} registrado`);
        assert.equal(a.description, c.description);
        assert.deepEqual(a.options, c.options);
    }
});

test("recusa registrar mais de 100 comandos", async () => {
    const tooMany = new Map(
        Array.from({ length: 101 }, (_, i) => [
            `c${i}`,
            { name: `c${i}`, description: "x", execute() {} }
        ])
    );

    let called = false;
    const original = globalThis.fetch;

    globalThis.fetch = async () => { called = true; return { ok: true }; };

    try {
        await assert.rejects(
            () => registrarComandos("APP", tooMany),
            /limite de 100/
        );
    } finally {
        globalThis.fetch = original;
    }

    assert.equal(called, false, "nem chegou a chamar a API");
});
