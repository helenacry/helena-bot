process.env.HELENA_OWNER_ID = "777000000000000001";

import { createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const {
    embedToLayout, toV2Data, layoutProblems, countComponents, V2_LIMITS
} = await import("../utils/components-v2.mjs");

const {
    v2Mode, v2Enabled, v2Payload, deliverCallback, deliverMessage
} = await import("../services/v2-delivery.mjs");

const { createEmbed, embedResponse } = await import("../utils/embed.mjs");

const OWNER = "777000000000000001";
const OTHER = "888000000000000002";

const quiet = { warn() {} };

// Liga o V2 só durante o teste.
async function withMode(mode, fn) {
    const before = process.env.HELENA_V2;

    if (mode === undefined) delete process.env.HELENA_V2;
    else process.env.HELENA_V2 = mode;

    try {
        return await fn();
    } finally {
        if (before === undefined) delete process.env.HELENA_V2;
        else process.env.HELENA_V2 = before;
    }
}

const EMBED = createEmbed({
    title: "💰 Seu saldo",
    description: "Tudo certo por aqui.",
    color: "#22C55E",
    fields: [
        { name: "Carteira", value: "R$ 10,00", inline: true },
        { name: "Banco", value: "R$ 20,00", inline: true },
        { name: "​", value: "​" }
    ]
});

const ROW = {
    type: "row",
    components: [
        { type: "button", customId: "banco:dep:1", label: "Depositar", style: "success" },
        { type: "button", customId: "banco:sac:1", label: "Sacar", style: "primary" }
    ]
};

const kinds = layout => JSON.stringify(layout.map(c => c.type));

// ==========================================
// EMBED -> LAYOUT
// ==========================================

test("embed vira um container com a cor, o título, a descrição, os campos e o rodapé fora dele", () => {
    const layout = embedToLayout(EMBED);

    assert.deepEqual(layoutProblems(layout), []);

    const [container, footer] = layout;

    assert.equal(container.type, "container");
    assert.equal(container.accentColor, "#22C55E");

    const texts = container.components.filter(c => c.type === "text").map(c => c.content);

    assert.equal(texts[0], "## 💰 Seu saldo");
    assert.equal(texts[1], "Tudo certo por aqui.");
    assert.match(texts[2], /\*\*Carteira\*\*\nR\$ 10,00\n\n\*\*Banco\*\*\nR\$ 20,00/);

    assert.ok(container.components.some(c => c.type === "separator"), "separa a descrição dos campos");

    // o campo vazio que o embed usa para pular linha não vira texto
    assert.ok(!texts.some(text => /^\s*$/.test(text)));

    assert.equal(footer.type, "text");
    assert.match(footer.content, /^-# Helena/);
});

test("com miniatura, os primeiros textos viram uma seção com a miniatura ao lado (userinfo)", () => {
    const layout = embedToLayout({
        author: { name: "Maria Silva (mariasilva)", iconUrl: "https://cdn.exemplo.test/a.png" },
        color: "#8755DA",
        thumbnail: { url: "https://cdn.exemplo.test/a.png" },
        fields: [
            { name: "👤 Menção", value: "<@1>" },
            { name: "🏷️ Tag", value: "mariasilva", inline: true }
        ],
        footer: { text: "Comando executado por: Eu" }
    });

    assert.deepEqual(layoutProblems(layout), []);

    const section = layout[0].components[0];

    assert.equal(section.type, "section");
    assert.equal(section.accessory.type, "thumbnail");
    assert.equal(section.accessory.url, "https://cdn.exemplo.test/a.png");
    assert.match(section.texts[0], /^## Maria Silva \(mariasilva\)$/);
    assert.ok(section.texts.length >= 1 && section.texts.length <= 3);

    // miniatura que não é https não entra
    const insecure = embedToLayout({ title: "x", thumbnail: { url: "http://inseguro.test/a.png" } });

    assert.equal(kinds(insecure[0].components), JSON.stringify(["text"]));
});

test("as linhas de botões e menus vão dentro do container, depois de um separador", () => {
    const menu = {
        type: "row",
        components: [{
            type: "select", customId: "ajuda:cat:1", placeholder: "Escolha",
            options: [{ label: "A", value: "a" }]
        }]
    };

    const layout = embedToLayout(EMBED, [menu, ROW]);

    assert.deepEqual(layoutProblems(layout), []);

    const inside = layout[0].components;

    assert.deepEqual(inside.slice(-3).map(c => c.type), ["separator", "row", "row"]);
    assert.equal(inside.at(-2), menu);
});

test("texto comprido é partido em pedaços de até 4000 caracteres e continua válido", () => {
    const layout = embedToLayout({ title: "Longo", description: ("linha de texto\n").repeat(600) });

    assert.deepEqual(layoutProblems(layout), []);

    const texts = layout[0].components.filter(c => c.type === "text");

    assert.ok(texts.length >= 3, "título + dois pedaços");
    assert.ok(texts.every(c => c.content.length <= V2_LIMITS.textLength));
});

test("25 campos não estouram o limite de 40 componentes: viram poucos textos", () => {
    const fields = Array.from({ length: 25 }, (_, index) => ({ name: `Campo ${index}`, value: "valor ".repeat(40) }));

    const layout = embedToLayout({ title: "Muitos campos", fields });

    assert.deepEqual(layoutProblems(layout), []);
    assert.ok(countComponents(layout) <= V2_LIMITS.components);
});

test("o que o V2 não cobre fica no clássico (null): imagem, body, anexo, vários embeds, nada", () => {
    const base = embedResponse(EMBED).data;

    assert.ok(toV2Data(base), "o caso comum converte");

    assert.equal(toV2Data({ ...base, embeds: [{ ...EMBED, image: { url: "https://x.test/i.png" } }] }), null);
    assert.equal(toV2Data({ ...base, body: "Informações de <@1>" }), null, "o body é quem notifica");
    assert.equal(toV2Data({ ...base, attachments: ["ref"] }), null);
    assert.equal(toV2Data({ ...base, embeds: [EMBED, EMBED] }), null);
    assert.equal(toV2Data({ body: "só texto" }), null);
    assert.equal(toV2Data(null), null);
    assert.equal(toV2Data({ ...base, embeds: [{}] }), null, "embed vazio");
});

test("update esvazia o body e os embeds antigos; a resposta privada é mantida", () => {
    const update = toV2Data({ ...embedResponse(EMBED).data, ephemeral: true }, { clear: true });

    assert.equal(update.body, "");
    assert.deepEqual(update.embeds, []);
    assert.equal(update.ephemeral, true);
    assert.equal(update.components[0].type, "container");

    const first = toV2Data(embedResponse(EMBED).data);

    assert.ok(!("body" in first) && !("embeds" in first), "na primeira mensagem não manda body nem embeds");
});

// ==========================================
// REGRAS DA DOCUMENTAÇÃO
// ==========================================

test("layoutProblems aponta o que a API recusaria", () => {
    const text = content => ({ type: "text", content });
    const container = (...components) => ({ type: "container", components });
    const button = customId => ({ type: "button", customId, label: "x", style: "primary" });

    assert.deepEqual(layoutProblems([container(text("ok"))]), []);

    const has = (components, pattern) => layoutProblems(components).some(problem => pattern.test(problem));

    assert.ok(has([], /sem componentes/));
    assert.ok(has([container(container(text("a")))], /container não aceita/));
    assert.ok(has([container()], /container vazio/));
    assert.ok(has([text("")], /1 a 4000/));
    assert.ok(has([text("x".repeat(4001))], /1 a 4000/));
    assert.ok(has([{ type: "container", accentColor: "roxo", components: [text("a")] }], /accentColor/));
    assert.ok(has([{ type: "thumbnail", url: "https://x.test/a.png" }], /só como acessório/));
    assert.ok(has([{ type: "section", texts: ["a"], accessory: { type: "thumbnail", url: "http://x.test/a.png" } }], /https/));
    assert.ok(has([{ type: "section", texts: ["a", "b", "c", "d"], accessory: { type: "thumbnail", url: "https://x.test/a.png" } }], /1 a 3 textos/));
    assert.ok(has([{ type: "section", texts: ["a"] }], /acessório/));
    assert.ok(has([{ type: "row", components: [] }], /1 a 5/));
    assert.ok(has([{ type: "row", components: [button("a"), button("a")] }], /customId repetido/));
    assert.ok(has([{ type: "mistério" }], /tipo desconhecido/));

    const rows = Array.from({ length: 6 }, (_, index) => ({ type: "row", components: [button("b" + index)] }));

    assert.ok(has(rows, /6 linhas/));

    const many = Array.from({ length: 41 }, () => text("a"));

    assert.ok(has(many, /41 componentes/));
});

test("countComponents conta como a VSync: container, textos, seção com acessório, linha e botões", () => {
    const layout = [{
        type: "container",
        components: [
            { type: "text", content: "a" },
            { type: "section", texts: ["b", "c"], accessory: { type: "thumbnail", url: "https://x.test/a.png" } },
            { type: "row", components: [{ type: "button", customId: "1" }, { type: "button", customId: "2" }] }
        ]
    }, { type: "text", content: "d" }];

    // container 1 + texto 1 + seção 1 + 2 textos + acessório 1 + linha 1 + 2 botões + texto fora 1
    assert.equal(countComponents(layout), 10);
});

// ==========================================
// MODO E ENTREGA
// ==========================================

test("HELENA_V2: desligado por padrão; owner só para o dono; on para todos", async () => {
    assert.equal(v2Mode({}), "off");
    assert.equal(v2Mode({ HELENA_V2: "tanto faz" }), "off");
    assert.equal(v2Mode({ HELENA_V2: "ON" }), "on");
    assert.equal(v2Mode({ HELENA_V2: " dono " }), "owner");

    await withMode(undefined, () => {
        assert.equal(v2Enabled(OWNER), false);
        assert.equal(v2Payload(embedResponse(EMBED).data, OWNER), null);
    });

    await withMode("owner", () => {
        assert.equal(v2Enabled(OWNER), true);
        assert.equal(v2Enabled(OTHER), false);
        assert.ok(v2Payload(embedResponse(EMBED).data, OWNER));
        assert.equal(v2Payload(embedResponse(EMBED).data, OTHER), null);
    });

    await withMode("on", () => {
        assert.equal(v2Enabled(OTHER), true);
    });
});

const okResponse = { ok: true, status: 200, text: async () => "" };
const refused = { ok: false, status: 400, text: async () => '{"error":"Componentes inválidos: teste"}' };

test("callback: V2 desligado manda o clássico uma vez só", async () => {
    await withMode(undefined, async () => {
        const posts = [];

        const payload = embedResponse(EMBED);

        const response = await deliverCallback({ payload, userId: OWNER, post: async body => { posts.push(body); return okResponse; } });

        assert.equal(response, okResponse);
        assert.deepEqual(posts, [payload]);
    });
});

test("callback: V2 ligado manda o layout; aceito, não manda de novo", async () => {
    await withMode("on", async () => {
        const posts = [];

        await deliverCallback({ payload: embedResponse(EMBED), userId: OTHER, post: async body => { posts.push(body); return okResponse; } });

        assert.equal(posts.length, 1);
        assert.equal(posts[0].type, "message");
        assert.equal(posts[0].data.components[0].type, "container");
        assert.ok(!posts[0].data.embeds);
    });
});

test("callback: se a VSync recusar o V2, a mesma resposta sai como clássico e o motivo vai para o log", async () => {
    await withMode("on", async () => {
        const posts = [];
        const warnings = [];

        const payload = embedResponse(EMBED);

        const response = await deliverCallback({
            payload,
            userId: OTHER,
            log: { warn: line => warnings.push(line) },
            post: async body => { posts.push(body); return posts.length === 1 ? refused : okResponse; }
        });

        assert.equal(response, okResponse);
        assert.equal(posts.length, 2);
        assert.equal(posts[0].data.components[0].type, "container");
        assert.deepEqual(posts[1], payload, "o clássico original, sem mudar nada");

        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /\[V2\].*HTTP 400.*Componentes inválidos: teste.*clássico/);
    });
});

test("callback: update esvazia o que havia; modal, skip, body e anexo ficam no clássico", async () => {
    await withMode("on", async () => {
        const send = async payload => {
            const posts = [];

            await deliverCallback({ ...payload, userId: OTHER, post: async body => { posts.push(body); return okResponse; } });

            return posts;
        };

        const update = await send({ payload: { type: "update", data: embedResponse(EMBED).data } });

        assert.equal(update[0].type, "update");
        assert.equal(update[0].data.body, "");
        assert.deepEqual(update[0].data.embeds, []);

        const classic = embedResponse(EMBED);

        for (const payload of [
            { type: "modal", data: { customId: "m", title: "t", fields: [] } },
            { type: "message", data: { ...classic.data, body: "Informações de <@1>" } },
            { type: "message", data: { ...classic.data, attachments: ["ref"] } }
        ]) {
            assert.deepEqual(await send({ payload }), [payload], payload.type);
        }

        // live: a contagem da prisão edita a mesma mensagem com embeds
        assert.deepEqual(await send({ payload: classic, skip: true }), [classic]);
    });
});

test("mensagem de canal: V2 aceito, recusado volta ao clássico, live fica no clássico", async () => {
    await withMode("on", async () => {
        const data = embedResponse(EMBED).data;

        const sent = [];

        await deliverMessage({ data, userId: OTHER, send: async payload => { sent.push(payload); return { message: { id: "1" } }; } });

        assert.equal(sent.length, 1);
        assert.equal(sent[0].components[0].type, "container");

        const warnings = [];
        const attempts = [];

        const result = await deliverMessage({
            data,
            userId: OTHER,
            log: { warn: line => warnings.push(line) },
            send: async payload => {
                attempts.push(payload);

                if (attempts.length === 1) throw new Error("[MENSAGEM CANAL] HTTP 400: layout");

                return { message: { id: "2" } };
            }
        });

        assert.equal(result.message.id, "2");
        assert.equal(attempts.length, 2);
        assert.deepEqual(attempts[1], data);
        assert.match(warnings[0], /\[V2\].*HTTP 400.*clássico/);

        const live = [];

        await deliverMessage({ data, userId: OTHER, skip: true, send: async payload => { live.push(payload); return {}; } });

        assert.deepEqual(live, [data]);
    });
});

// ==========================================
// PELO PREFIXO (hping etc.)
// ==========================================

test("pelo prefixo: com o V2 ligado o embed sai como layout; desligado, como sempre", async () => {
    const G = "900000000000000001";
    const user = { id: OTHER, username: "teste", displayName: "Teste" };

    const run = await createPrefixRunner({ guildId: G, author: user });

    const off = await withMode(undefined, () => run("hping"));

    assert.ok(off.sent[0].embeds?.length === 1, "clássico");
    assert.ok(!off.sent[0].components);

    const on = await withMode("on", () => run("hping"));

    assert.equal(on.sent.length, 1);
    assert.ok(!on.sent[0].embeds, "sem embed");
    assert.equal(on.sent[0].components[0].type, "container");
    assert.deepEqual(layoutProblems(on.sent[0].components), []);
    assert.equal(on.body, "");
});

test("pelo prefixo: se a VSync recusar o layout, o mesmo comando sai como embed", async () => {
    const G = "900000000000000001";
    const user = { id: OTHER, username: "teste", displayName: "Teste" };

    const attempts = [];

    const run = await createPrefixRunner({
        guildId: G,
        author: user,
        send: async (_message, payload) => {
            attempts.push(payload);

            if (payload.components?.[0]?.type === "container") {
                throw new Error("[MENSAGEM CANAL] HTTP 400: Componentes inválidos");
            }

            return { message: { id: "x" } };
        }
    });

    const warn = console.warn;
    const warnings = [];

    console.warn = line => warnings.push(String(line));

    try {
        await withMode("on", () => run("hping"));
    } finally {
        console.warn = warn;
    }

    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].components[0].type, "container");
    assert.equal(attempts[1].embeds.length, 1, "o clássico");
    assert.ok(warnings.some(line => /\[V2\]/.test(line)));
});
