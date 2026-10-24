import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// O cliente da API REST do Discord (services/discord/api.mjs) contra um fetch de mentira.

const { createDiscordApi, DiscordApiError } = await import("../services/discord/api.mjs");

// Responde na ordem combinada e guarda cada pedido para o teste conferir.
function fakeFetch(...answers) {
    const requests = [];

    const fetchImpl = async (url, init) => {
        requests.push({ url, ...init });

        const answer = answers.shift() ?? { status: 200, body: {} };

        return {
            status: answer.status ?? 200,
            ok: (answer.status ?? 200) < 300,
            text: async () => (answer.body === undefined ? "" : typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body)),
            headers: { get: name => answer.headers?.[name.toLowerCase()] ?? null }
        };
    };

    return { fetchImpl, requests };
}

const make = (answers = [], extra = {}) => {
    const { fetchImpl, requests } = fakeFetch(...answers);
    const waits = [];

    const api = createDiscordApi({ token: "segredo", fetchImpl, sleep: async ms => { waits.push(ms); }, ...extra });

    return { api, requests, waits };
};

test("pedido com JSON: endereço da v10, token do bot, User-Agent e corpo", async () => {
    const { api, requests } = make([{ body: { id: "1" } }]);

    const out = await api.send("123", { json: { content: "oi" } });

    assert.deepEqual(out, { id: "1" });

    const [request] = requests;

    assert.equal(request.url, "https://discord.com/api/v10/channels/123/messages");
    assert.equal(request.method, "POST");
    assert.equal(request.headers.Authorization, "Bot segredo");
    assert.match(request.headers["User-Agent"], /^DiscordBot \(https:\/\/github\.com\/helenacry\/helena-bot, /);
    assert.equal(request.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(request.body), { content: "oi" });
});

test("sem token no ambiente, o pedido com autorização avisa antes de ir à rede", async () => {
    const { api, requests } = make([], { token: "" });

    await assert.rejects(() => api.me(), /DISCORD_BOT_TOKEN/);

    assert.equal(requests.length, 0);
});

test("rotas de interação usam o token da interação, sem o cabeçalho de autorização do bot", async () => {
    const { api, requests } = make([{ status: 204 }, { body: { id: "m" } }]);

    assert.equal(await api.respond("77", "tok", { json: { type: 4, data: { content: "oi" } } }), null);

    await api.editOriginal("55", "tok", { json: { content: "novo" } });

    assert.equal(requests[0].url, "https://discord.com/api/v10/interactions/77/tok/callback");
    assert.equal("Authorization" in requests[0].headers, false);

    assert.equal(requests[1].url, "https://discord.com/api/v10/webhooks/55/tok/messages/@original");
    assert.equal(requests[1].method, "PATCH");
    assert.equal("Authorization" in requests[1].headers, false);
});

test("com arquivo: vai em multipart, o JSON em payload_json e sem Content-Type (o fetch põe o limite)", async () => {
    const { api, requests } = make([{ body: {} }]);

    await api.send("9", {
        json: { content: "Perfil", attachments: [{ id: 0, filename: "p.png" }] },
        files: [{ name: "p.png", bytes: Buffer.from([1, 2, 3, 4]), contentType: "image/png" }]
    });

    const [{ body, headers }] = requests;

    assert.ok(body instanceof FormData);
    assert.equal("Content-Type" in headers, false);
    assert.equal(JSON.parse(body.get("payload_json")).content, "Perfil");
    assert.equal(body.get("files[0]").size, 4);
});

test("consulta na URL e IDs codificados", async () => {
    const { api, requests } = make([{ body: [] }, { body: {} }]);

    await api.searchMembers("1", "maria silva", 5);
    await api.member("1", "a/b");

    assert.equal(requests[0].url, "https://discord.com/api/v10/guilds/1/members/search?query=maria+silva&limit=5");
    assert.equal(requests[1].url, "https://discord.com/api/v10/guilds/1/members/a%2Fb");
});

test("os comandos de barra são registrados em lote, e os emojis do aplicativo em base64", async () => {
    const { api, requests } = make([{ body: [] }, { body: { id: "e" } }]);

    await api.registerCommands("500", [{ name: "daily" }]);

    assert.equal(requests[0].method, "PUT");
    assert.equal(requests[0].url, "https://discord.com/api/v10/applications/500/commands");

    await api.createAppEmoji("500", "auto_admin", Buffer.from("abc"));

    assert.deepEqual(JSON.parse(requests[1].body), { name: "auto_admin", image: "data:image/png;base64,YWJj" });
});

test("429: espera o tempo que o Discord pediu e tenta uma vez mais", async () => {
    const { api, requests, waits } = make([
        { status: 429, body: { message: "You are being rate limited.", retry_after: 1.5 } },
        { body: { ok: true } }
    ]);

    assert.deepEqual(await api.me(), { ok: true });
    assert.deepEqual(waits, [1500]);
    assert.equal(requests.length, 2);
});

test("429 que pede espera longa demais, ou que repete: vira erro com o tempo pedido", async () => {
    const long = make([{ status: 429, body: { retry_after: 600 } }]);

    await assert.rejects(() => long.api.me(), error => {
        assert.ok(error instanceof DiscordApiError);
        assert.equal(error.status, 429);
        assert.equal(error.retryAfterMs, 600_000);

        return true;
    });

    const twice = make([{ status: 429, body: { retry_after: 1 } }, { status: 429, body: { retry_after: 1 } }]);

    await assert.rejects(() => twice.api.me(), /Limite de pedidos/);
});

test("a resposta de interação nunca é repetida (o tempo dela é curto)", async () => {
    const { api, requests } = make([{ status: 429, body: { retry_after: 1 } }]);

    await assert.rejects(() => api.respond("1", "t", { json: { type: 4 } }), /Limite de pedidos/);

    assert.equal(requests.length, 1);
});

test("erro da API: o motivo do Discord vai na mensagem, com o status e a rota", async () => {
    const { api } = make([{ status: 403, body: { code: 50013, message: "Missing Permissions" } }]);

    await assert.rejects(() => api.send("1", { json: {} }), error => {
        assert.ok(error instanceof DiscordApiError);
        assert.equal(error.status, 403);
        assert.equal(error.route, "POST /channels/1/messages");
        assert.match(error.message, /HTTP 403.*Missing Permissions/);
        assert.equal(error.body.code, 50013);

        return true;
    });
});

test("resposta que não é JSON não quebra o tratamento do erro", async () => {
    const { api } = make([{ status: 502, body: "<html>Bad Gateway</html>" }]);

    await assert.rejects(() => api.me(), /HTTP 502.*Bad Gateway/);
});
