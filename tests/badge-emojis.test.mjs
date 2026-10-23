import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

// Os ícones oficiais das insígnias (um PNG por insígnia, vira emoji de servidor): a Helena lê o
// nome e o ID da lista do servidor e usa no /userinfo. Se não achar, cai no emoji fixo e, sem ele,
// no nome. services/social/badge-emojis.mjs.

const {
    loadBadgeEmojis, badgeEmojis, emojiNamed, pulseEmoji, resetBadgeEmojis
} = await import("../services/social/badge-emojis.mjs");

const { getUserBadges, BADGE_ICON_NAMES } = await import("../services/social/userinfo-badges.mjs");
const { buildUserinfoEmbed } = await import("../services/social/userinfo-view.mjs");
const { PULSE_EMOJIS } = await import("../services/social/userinfo-format.mjs");

// Os 31 nomes do pacote de emojis (LEIA-ME.md do pacote de ícones).
const PACK = [
    "auto_admin", "auto_early_supporter", "auto_verified", "auto_verified_bot_developer", "auto_partner", "auto_staff",
    "auto_gifting_patron", "auto_gifting_champion", "auto_gifting_luminary", "auto_gifting_hero",
    ...[1, 2, 3, 6, 9, 12, 15, 18, 24].map(month => `auto_pulse_${month}`),
    "auto_prisma", "auto_prisma_plus",
    ...["1h", "5h", "20h", "75h", "150h", "300h", "500h", "1kh", "2kh", "5khplus"].map(tier => `auto_stream_${tier}`)
];

const GUILD = "235793472378261504";

const silently = async fn => {
    const warn = console.warn;
    const warnings = [];

    console.warn = (...args) => warnings.push(args.join(" "));

    try { return { result: await fn(), warnings }; } finally { console.warn = warn; }
};

// A API simulada: conta os pedidos e devolve o que o teste combinou para cada rota.
function api(routes) {
    const calls = [];

    globalThis.fetch = async url => {
        const path = String(url).replace("https://api.vsync.lat", "");

        calls.push(path);

        const route = routes[path];

        if (route === undefined) return { ok: false, status: 404, json: async () => ({}) };
        if (route instanceof Error) throw route;
        if (typeof route === "number") return { ok: false, status: route, json: async () => ({}) };

        return { ok: true, status: 200, json: async () => route };
    };

    return calls;
}

const emojisOf = names => ({ emojis: names.map((name, index) => ({ id: String(1000 + index), name })), limit: 50 });

const realFetch = globalThis.fetch;

test.beforeEach(() => {
    resetBadgeEmojis();
    delete process.env.HELENA_BADGE_GUILD_ID;
    delete process.env.HELENA_SUPPORT_GUILD_ID;
});

test.after(() => {
    globalThis.fetch = realFetch;
});

// ==========================================
// O CATÁLOGO
// ==========================================

test("o catálogo pede exatamente os 31 nomes do pacote de ícones, sem repetir", () => {
    assert.equal(new Set(BADGE_ICON_NAMES).size, BADGE_ICON_NAMES.length, "nome repetido");
    assert.deepEqual([...BADGE_ICON_NAMES].sort(), [...PACK].sort());
});

test("sem o pacote no servidor, nada muda: emoji fixo onde existe, nome onde não existe", () => {
    const admin = getUserBadges({ flags: ["ADMIN"] })[0];

    assert.equal(admin.emoji, "<:badge_admin:235402174009856000>");

    const basic = getUserBadges({ prismaActive: true, prismaPlan: "prisma" })[0];

    assert.equal(basic.name, "Prisma");
    assert.equal(basic.emoji, "");
});

// ==========================================
// A LEITURA
// ==========================================

test("lê o servidor de suporte: monta <:nome:id>, ignora emojis de outros nomes e respeita o animado", async () => {
    process.env.HELENA_SUPPORT_GUILD_ID = GUILD;

    const calls = api({
        [`/guilds/${GUILD}/emojis`]: {
            emojis: [
                { id: "1001", name: "auto_admin" },
                { id: "1002", name: "carinha" },
                { id: "1003", name: "auto_pulse_12", animated: true },
                { id: "x y", name: "auto_staff" },
                { name: "auto_partner" }
            ],
            limit: 50
        }
    });

    const map = await loadBadgeEmojis({ now: 1_000_000 });

    assert.deepEqual(map, {
        auto_admin: "<:auto_admin:1001>",
        auto_pulse_12: "<a:auto_pulse_12:1003>"
    });

    assert.deepEqual(calls, [`/guilds/${GUILD}/emojis`], "servidor escolhido: não varre os outros");
    assert.equal(emojiNamed("auto_admin", "fixo"), "<:auto_admin:1001>");
    assert.equal(emojiNamed("auto_staff", "fixo"), "fixo");
});

test("HELENA_BADGE_GUILD_ID vale mais que o servidor de suporte e aceita vários, sem repetir", async () => {
    process.env.HELENA_BADGE_GUILD_ID = "111, 222";
    process.env.HELENA_SUPPORT_GUILD_ID = "111";

    const calls = api({
        "/guilds/111/emojis": emojisOf(["auto_admin"]),
        "/guilds/222/emojis": emojisOf(["auto_staff", "auto_admin"])
    });

    const map = await loadBadgeEmojis({ now: 1 });

    assert.deepEqual(calls, ["/guilds/111/emojis", "/guilds/222/emojis"]);
    assert.equal(map.auto_admin, "<:auto_admin:1000>", "o primeiro servidor ganha");
    assert.equal(map.auto_staff, "<:auto_staff:1000>");
});

test("sem servidor configurado, procura nos primeiros servidores e para no que tem o pacote", async () => {
    const calls = api({
        "/bot/guilds": { guilds: [{ id: "aaa" }, { id: "bbb" }, { id: "ccc" }] },
        "/guilds/aaa/emojis": 403,
        "/guilds/bbb/emojis": emojisOf(["auto_partner"]),
        "/guilds/ccc/emojis": emojisOf(["auto_staff"])
    });

    const map = await loadBadgeEmojis({ now: 1 });

    assert.deepEqual(calls, ["/bot/guilds", "/guilds/aaa/emojis", "/guilds/bbb/emojis"], "o terceiro nem é perguntado");
    assert.deepEqual(map, { auto_partner: "<:auto_partner:1000>" });
});

test("a busca às cegas olha no máximo 10 servidores", async () => {
    const ids = Array.from({ length: 15 }, (_unused, index) => `g${index}`);

    const calls = api({
        "/bot/guilds": { guilds: ids.map(id => ({ id })) },
        ...Object.fromEntries(ids.map(id => [`/guilds/${id}/emojis`, emojisOf(["outro"])]))
    });

    await loadBadgeEmojis({ now: 1 });

    assert.equal(calls.length, 1 + 10);
});

// ==========================================
// CACHE E FALHAS
// ==========================================

test("a lista vale 1 minuto; depois lê de novo e atualiza", async () => {
    process.env.HELENA_SUPPORT_GUILD_ID = GUILD;

    const route = `/guilds/${GUILD}/emojis`;
    const calls = api({ [route]: emojisOf(["auto_admin"]) });

    await loadBadgeEmojis({ now: 10_000 });
    await loadBadgeEmojis({ now: 10_000 + 59_000 });

    assert.equal(calls.length, 1, "dentro do minuto, nada novo");

    api({ [route]: emojisOf(["auto_staff"]) });

    const map = await loadBadgeEmojis({ now: 10_000 + 60_000 });

    assert.deepEqual(Object.keys(map), ["auto_staff"], "o servidor mudou e a Helena acompanhou");
});

test("sem permissão (403) ou servidor fora do ar: não lança, guarda o que já tinha e avisa uma vez só", async () => {
    process.env.HELENA_SUPPORT_GUILD_ID = GUILD;

    const route = `/guilds/${GUILD}/emojis`;

    api({ [route]: emojisOf(["auto_admin"]) });

    await loadBadgeEmojis({ now: 0 });

    // sem permissão: lembra e não pergunta de novo por uma hora
    const denied = api({ [route]: 403 });

    await loadBadgeEmojis({ now: 60_000 });
    await loadBadgeEmojis({ now: 120_000 });

    assert.equal(denied.length, 1, "o servidor que recusou fica de fora por um tempo");
    assert.equal(emojiNamed("auto_admin"), "<:auto_admin:1000>", "o que foi lido antes continua valendo");

    // erro do servidor da API: avisa uma vez, mesmo tentando de novo
    resetBadgeEmojis();

    api({ [route]: 500 });

    const { warnings } = await silently(async () => {
        await loadBadgeEmojis({ now: 0 });
        await loadBadgeEmojis({ now: 60_000 });
    });

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /HTTP 500/);

    // sem rede
    resetBadgeEmojis();

    api({ [route]: new Error("sem rede") });

    const offline = await silently(() => loadBadgeEmojis({ now: 0 }));

    assert.deepEqual(offline.result, {});
});

test("sem token, nada é pedido nem quebra", async () => {
    const token = process.env.VSYNC_BOT_TOKEN;

    delete process.env.VSYNC_BOT_TOKEN;
    process.env.HELENA_SUPPORT_GUILD_ID = GUILD;

    try {
        const calls = api({});
        const { result } = await silently(() => loadBadgeEmojis({ now: 0 }));

        assert.deepEqual(result, {});
        assert.deepEqual(calls, []);

    } finally {
        process.env.VSYNC_BOT_TOKEN = token;
    }
});

// ==========================================
// NO /USERINFO
// ==========================================

test("com o pacote, as insígnias que não tinham emoji ganham o ícone, e as que tinham passam a usar o do pacote", async () => {
    process.env.HELENA_SUPPORT_GUILD_ID = GUILD;

    api({ [`/guilds/${GUILD}/emojis`]: emojisOf(PACK) });

    await loadBadgeEmojis({ now: 0 });

    assert.equal(Object.keys(badgeEmojis()).length, 31);

    const basic = getUserBadges({ prismaActive: true, prismaPlan: "prisma" })[0];
    const plus = getUserBadges({ prismaActive: true, prismaPlan: "prisma_plus" })[0];
    const admin = getUserBadges({ flags: ["ADMIN"] })[0];
    const gifting = getUserBadges({ flags: ["GIFTING_LUMINARY"] })[0];
    const stream = getUserBadges({ shareSeconds: 5000 * 3600 })[0];
    const stream5 = getUserBadges({ shareSeconds: 6 * 3600 })[0];

    assert.match(basic.emoji, /^<:auto_prisma:\d+>$/);
    assert.match(plus.emoji, /^<:auto_prisma_plus:\d+>$/);
    assert.match(admin.emoji, /^<:auto_admin:\d+>$/, "o do pacote vale mais que o fixo");
    assert.match(gifting.emoji, /^<:auto_gifting_luminary:\d+>$/);
    assert.match(stream.emoji, /^<:auto_stream_5khplus:\d+>$/);
    assert.match(stream5.emoji, /^<:auto_stream_5h:\d+>$/);
});

test("o cartão mostra o ícone no lugar do nome, e o Pulse usa o selo do pacote (com o fixo de reserva)", async () => {
    const user = {
        id: "1", username: "maria", displayName: "Maria", flags: [], hiddenBadges: [],
        prismaActive: true, prismaPlan: "prisma", pulsing: true, pulsingSince: Date.UTC(2025, 0, 1),
        pulseBadge: { months: 12 }, nextPulseBadge: { months: 15, at: Date.UTC(2026, 6, 1) }
    };

    const fieldOf = (embed, name) => embed.fields.find(field => field.name.includes(name))?.value;

    // sem o pacote: o plano básico aparece pelo nome, o Pulse pelo emoji fixo
    const before = buildUserinfoEmbed({ user, actorName: "eu", now: Date.UTC(2026, 3, 1) });

    assert.match(fieldOf(before, "Insígnias"), /\nPrisma$|^Prisma/m);
    assert.equal(pulseEmoji(12), PULSE_EMOJIS[12]);
    assert.ok(fieldOf(before, "Insígnia de Pulser atual").startsWith(PULSE_EMOJIS[12]));

    process.env.HELENA_SUPPORT_GUILD_ID = GUILD;

    api({ [`/guilds/${GUILD}/emojis`]: emojisOf(PACK) });

    await loadBadgeEmojis({ now: 0 });

    const after = buildUserinfoEmbed({ user, actorName: "eu", now: Date.UTC(2026, 3, 1) });
    const badges = fieldOf(after, "Insígnias");

    assert.match(badges, /<:auto_prisma:\d+>/);
    assert.match(badges, /<:auto_pulse_12:\d+>/);
    assert.doesNotMatch(badges, /\bPrisma\b(?!\+)/, "o nome sai quando o ícone aparece");

    assert.match(fieldOf(after, "Insígnia de Pulser atual"), /^<:auto_pulse_12:\d+>/);
    assert.match(fieldOf(after, "Próxima insígnia de Pulser"), /^<:auto_pulse_15:\d+>/);
});
