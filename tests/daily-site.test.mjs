import { set, get, getPlayer, createPrefixRunner } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";

const { carregarComandos } = await import("../command-registry.mjs");
const { dailyOnSite, DAILY_PANEL_URL } = await import("../commands/economy/daily.mjs");
const { claimDaily } = await import("../services/economy/daily.mjs");
const { SITE_URL } = await import("../config/site.mjs");
const { layoutProblems, toV2Data } = await import("../utils/components-v2.mjs");

const G = "900000000000000081";
const ME = { id: "111111111111111181", username: "eu", displayName: "Eu Mesmo" };

// o painel do site "ligado": a API sobe com estas variáveis
const PANEL = {
    HELENA_WEB_PORT: "8080",
    HELENA_WEB_ORIGINS: "https://site.exemplo.test",
    HELENA_OAUTH_REDIRECTS: "https://site.exemplo.test/account/",
    HELENA_OAUTH_CLIENT_ID: "1559308576537714710"
};

async function withPanel(fn, extra = {}) {
    const before = {};

    for (const [key, value] of Object.entries({ ...PANEL, ...extra })) {
        before[key] = process.env[key];
        process.env[key] = value;
    }

    try {
        return await fn();

    } finally {
        for (const [key, value] of Object.entries(before)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
}

function reset() {
    set("DELETE FROM players WHERE guild_id = ?", G);
    set("DELETE FROM daily_streaks WHERE guild_id = ?", G);

    getPlayer(G, ME.id);
}

test.beforeEach(() => reset());

const wallet = () => get("SELECT wallet FROM players WHERE guild_id = ? AND user_id = ?", G, ME.id).wallet;
const lastDaily = () => get("SELECT last_daily FROM players WHERE guild_id = ? AND user_id = ?", G, ME.id).last_daily;

const daily = async () => (await carregarComandos()).get("daily");

const run = interaction => daily().then(command => command.execute({ guildId: G, user: ME, data: { options: {} }, ...interaction }));

// ==========================================
// QUANDO O DAILY É SÓ NO SITE
// ==========================================

test("dailyOnSite: só com o painel do site completo; HELENA_DAILY_ON_SITE=off devolve o pagamento ao comando", () => {
    assert.equal(dailyOnSite({}), false, "sem painel o comando paga");
    assert.equal(dailyOnSite({ HELENA_WEB_PORT: "8080" }), false, "painel incompleto não conta");
    assert.equal(dailyOnSite(PANEL), true);
    assert.equal(dailyOnSite({ ...PANEL, HELENA_DAILY_ON_SITE: "off" }), false);
    assert.equal(dailyOnSite({ ...PANEL, HELENA_DAILY_ON_SITE: " OFF " }), false);
    assert.equal(dailyOnSite({ ...PANEL, HELENA_DAILY_ON_SITE: "on" }), true);
});

test("com o painel ligado, /daily não paga: mostra que está disponível e leva ao site", async () => {
    await withPanel(async () => {
        const before = wallet();

        const result = await run();

        assert.equal(result.type, "message");

        const embed = result.data.embeds[0];

        assert.equal(embed.title, "🎁 Bônus diário");
        assert.match(embed.description, /^-# ✅ Disponível agora neste servidor\n/);
        assert.match(embed.description, /O daily agora é coletado no site da Helena/);
        assert.match(embed.description, /cada servidor tem a própria recarga de 24 horas/);

        // sem autor, miniatura nem rodapé
        assert.equal(embed.author, undefined);
        assert.equal(embed.thumbnail, undefined);
        assert.equal(embed.footer.text, "");

        const [button] = result.data.components[0].components;

        assert.deepEqual(
            { style: button.style, label: button.label, url: button.url },
            { style: "link", label: "Coletar no site", url: `${SITE_URL}account/` }
        );
        assert.equal(DAILY_PANEL_URL, `${SITE_URL}account/`);

        // nada foi pago nem gasto
        assert.equal(wallet(), before);
        assert.equal(lastDaily(), 0);
        assert.equal(get("SELECT COUNT(*) n FROM daily_streaks WHERE guild_id = ?", G).n, 0);
    });
});

test("depois de coletar (no site), o /daily mostra quando libera, com o relógio do Discord", async () => {
    await withPanel(async () => {
        const claimed = claimDaily(G, ME.id);

        assert.equal(claimed.status, "claimed");

        const paid = wallet();

        const embed = (await run()).data.embeds[0];

        assert.match(embed.description, /^-# ⏳ Libera <t:\d+:R> neste servidor\n/);
        assert.equal(embed.color, "#7684b1", "a cor de espera");

        assert.equal(wallet(), paid, "o comando não paga de novo");
    });
});

test("o prefixo (hdaily) também leva ao site, e em V2 o cartão converte com o botão de link", async () => {
    await withPanel(async () => {
        const runPrefix = await createPrefixRunner({ guildId: G, author: ME });

        const sent = (await runPrefix("hdaily")).sent[0];

        assert.equal(sent.embeds[0].title, "🎁 Bônus diário");
        assert.equal(sent.components[0].components[0].url, `${SITE_URL}account/`);
    });
});

test("o primeiro /daily de quem chega abre a conta (sem pagar nada)", async () => {
    await withPanel(async () => {
        set("DELETE FROM players WHERE guild_id = ?", G);

        assert.equal(get("SELECT COUNT(*) n FROM players WHERE guild_id = ?", G).n, 0);

        await run();

        assert.equal(get("SELECT COUNT(*) n FROM players WHERE guild_id = ?", G).n, 1);
        assert.equal(wallet(), 0);
    });
});

// ==========================================
// SEM O PAINEL, O COMANDO SEGUE PAGANDO
// ==========================================

test("sem o painel (ou com HELENA_DAILY_ON_SITE=off), o /daily paga como antes", async () => {
    const result = await run();

    assert.match(result.data.embeds[0].title, /Recompensa do dia/);
    assert.ok(wallet() > 0);

    reset();

    await withPanel(async () => {
        const forced = await run();

        assert.match(forced.data.embeds[0].title, /Recompensa do dia/);
        assert.ok(wallet() > 0);
    }, { HELENA_DAILY_ON_SITE: "off" });
});

test("o layout V2 do cartão não tem problemas (o embed converte sozinho)", async () => {
    await withPanel(async () => {
        const result = await run();

        const v2 = toV2Data(result.data, { clear: true });

        assert.equal(v2.components[0].type, "container");
        assert.deepEqual(layoutProblems(v2.components), []);
    });
});
