process.env.HELENA_OWNER_ID = "777000000000000001";

import { db } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// O cartão de apresentação (config/about.mjs, services/platform/about.mjs): o que a Helena responde quando alguém
// a menciona sozinha, quando fica quieta e como o texto sai (emojis do aplicativo, sem prévia de link, em inglês).

const about = await import("../services/platform/about.mjs");
const { introText } = await import("../config/about.mjs");
const { REPO_URL, SITE_URL, SUPPORT_URL, WIKI_URL } = await import("../config/site.mjs");
const { greetMention } = await import("../services/platform/creators.mjs");
const { toDiscordMessage, FLAGS } = await import("../services/discord/format.mjs");
const { createTransport } = await import("../services/discord/transport.mjs");
const { setAppEmojis } = await import("../services/platform/app-emojis.mjs");
const { setLang, resetLangCache, localizeData } = await import("../services/platform/i18n.mjs");
const { normalizeMessage } = await import("../services/discord/normalize.mjs");
const { setBlocked, unblock, setSetting } = await import("../services/platform/developer.mjs");

const BOT = "999000000000000009";
const CRIADOR = "777000000000000001";
const ANA = "123456789012345678";
const BETO = "223456789012345678";
const CAIO = "323456789012345678";

const MENTION = `<@${BOT}>`;

function clock(start = 1_000_000) {
    let t = start;

    return { now: () => t, advance: ms => { t += ms; } };
}

const messageOf = (author, body, extra = {}) => ({
    id: "5550001",
    guildId: "g1",
    channelId: "c1",
    body,
    author: { id: author, bot: false },
    webhookId: null,
    ...extra
});

// sem consultar o banco: ninguém está calado
const introducerWith = (relogio = clock(), extra = {}) =>
    about.createIntroductions({ silent: () => false, now: relogio.now, ...extra });

// ==========================================
// SÓ A MENÇÃO SOZINHA
// ==========================================

test("isOnlyMention: só a menção ao bot, <@id> ou <@!id>, com ou sem espaço em volta", () => {
    for (const body of [MENTION, `<@!${BOT}>`, `  ${MENTION}  `, `${MENTION}\n`, `\t<@!${BOT}> `]) {
        assert.equal(about.isOnlyMention(body, BOT), true, JSON.stringify(body));
    }

    for (const body of [
        `${MENTION} oi`, `oi ${MENTION}`, `${MENTION} ${MENTION}`, `${MENTION}${MENTION}`,
        `<@${ANA}>`, `<@${BOT}0>`, "Helena", "", `<@&${BOT}>`, `<#${BOT}>`, `<@${BOT}`
    ]) {
        assert.equal(about.isOnlyMention(body, BOT), false, JSON.stringify(body));
    }

    assert.equal(about.isOnlyMention(undefined, BOT), false);
    assert.equal(about.isOnlyMention(MENTION, null), false, "sem ID do bot");
    assert.equal(about.isOnlyMention(MENTION, "abc"), false, "ID inválido");
});

test("o cartão: quem sou, o prefixo, a ajuda e os quatro links, cada um com o seu emoji", () => {
    const text = introText({ prefix: "h" });

    assert.deepEqual(text.split("\n"), [
        "🌸 Olá! Sou a **Helena**!",
        "✨ Meu prefixo é **h**, use **hajuda** para descobrir todos os meus comandos.",
        `💌 Suporte: ${SUPPORT_URL}`,
        `🌐 Site: ${SITE_URL}`,
        `📖 Wiki: ${WIKI_URL}`,
        `💻 Código: ${REPO_URL}`
    ]);

    assert.match(introText({ prefix: "x" }), /prefixo é \*\*x\*\*, use \*\*xajuda\*\*/);

    for (const url of [SUPPORT_URL, SITE_URL, WIKI_URL, REPO_URL]) {
        assert.match(url, /^https:\/\//);
    }

    assert.ok(text.length < 600, "curto o bastante para o chat");
});

test("os links do cartão são os do resto do projeto (o suporte e o repositório batem com o site)", () => {
    const config = readFileSync(new URL("../site/src/config.ts", import.meta.url), "utf8");

    assert.ok(config.includes(`supportUrl: "${SUPPORT_URL}"`), "o convite é o mesmo do site");
    assert.ok(REPO_URL.startsWith("https://github.com/helenacry/"), "o repositório é da organização");
    assert.ok(config.includes('orgUrl: "https://github.com/helenacry"'));
    assert.equal(WIKI_URL, `${SITE_URL}wiki/`);
});

// ==========================================
// QUANDO RESPONDE
// ==========================================

test("quem escreve só a menção recebe o cartão, ligado à mensagem e sem prévia de link", () => {
    const reply = introducerWith().reply(messageOf(ANA, MENTION), BOT, "h");

    assert.deepEqual(reply, {
        body: introText({ prefix: "h" }),
        replyTo: "5550001",
        suppressEmbeds: true
    });

    assert.match(introducerWith().reply(messageOf(ANA, `<@!${BOT}>`), BOT, "h").body, /Sou a \*\*Helena\*\*/);
});

test("não responde: bot, webhook, conversa (menção com mais texto), outra pessoa mencionada, sem servidor ou canal", () => {
    const introducer = introducerWith();

    const cases = [
        messageOf(ANA, MENTION, { author: { id: ANA, bot: true } }),
        messageOf(ANA, MENTION, { webhookId: "w1" }),
        messageOf(ANA, MENTION, { author: undefined }),
        messageOf(ANA, MENTION, { author: { bot: false } }),
        messageOf(ANA, `${MENTION} me dá dinheiro`),
        messageOf(ANA, `oi ${MENTION}`),
        messageOf(ANA, `<@${BETO}>`),
        messageOf(ANA, "Helena"),
        // responder a uma mensagem da Helena: o Discord põe o bot nas menções, mas o texto não tem a menção
        messageOf(ANA, "obrigada!", { mentions: [{ id: BOT }] }),
        messageOf(ANA, MENTION, { guildId: null }),
        messageOf(ANA, MENTION, { channelId: null })
    ];

    for (const [index, message] of cases.entries()) {
        assert.equal(introducer.reply(message, BOT, "h"), null, `caso ${index}`);
    }

    assert.equal(introducer.reply(null, BOT, "h"), null);
    assert.equal(introducer.reply(messageOf(ANA, MENTION), null, "h"), null, "sem o ID do bot");
});

test("a espera: um canal responde a cada 20 s e uma pessoa a cada 60 s; passado o tempo, responde de novo", () => {
    const relogio = clock();

    const introducer = introducerWith(relogio);

    assert.ok(introducer.reply(messageOf(ANA, MENTION), BOT, "h"), "primeira vez");

    // outra pessoa no mesmo canal logo depois: o canal ainda espera
    assert.equal(introducer.reply(messageOf(BETO, MENTION), BOT, "h"), null, "mesmo canal");

    // a mesma pessoa em outro canal: ela ainda espera
    assert.equal(introducer.reply(messageOf(ANA, MENTION, { channelId: "c2" }), BOT, "h"), null, "mesma pessoa");

    // outra pessoa, outro canal: responde
    assert.ok(introducer.reply(messageOf(CAIO, MENTION, { channelId: "c3" }), BOT, "h"), "canal e pessoa novos");

    relogio.advance(21_000);

    assert.ok(introducer.reply(messageOf(BETO, MENTION), BOT, "h"), "o canal já esperou 20 s");
    assert.equal(introducer.reply(messageOf(ANA, MENTION, { channelId: "c2" }), BOT, "h"), null, "a pessoa só esperou 21 s");

    relogio.advance(40_000);

    assert.ok(introducer.reply(messageOf(ANA, MENTION, { channelId: "c2" }), BOT, "h"), "a pessoa já esperou 60 s");
});

test("a espera só começa quando ela responde: quem está calado ou foi ignorado não gasta a vez do canal", () => {
    const blockedIds = new Set([BETO]);

    const introducer = about.createIntroductions({ silent: id => blockedIds.has(id), now: clock().now });

    assert.equal(introducer.reply(messageOf(BETO, MENTION), BOT, "h"), null, "bloqueado");
    assert.equal(introducer.reply(messageOf(ANA, `${MENTION} oi`), BOT, "h"), null, "conversa");
    assert.ok(introducer.reply(messageOf(ANA, MENTION), BOT, "h"), "o canal continua livre para quem pode");
});

test("a memória não cresce sem limite: o que já esperou sai depois de muitas pessoas", () => {
    const relogio = clock();

    const introducer = introducerWith(relogio);

    for (let i = 0; i < 700; i++) {
        introducer.reply(messageOf(String(1_000_000_000_000_000 + i), MENTION, { channelId: `c${i}` }), BOT, "h");

        relogio.advance(1000);
    }

    // continua respondendo normalmente depois da limpeza
    assert.ok(introducer.reply(messageOf(ANA, MENTION, { channelId: "novo" }), BOT, "h"));
});

// ==========================================
// QUEM FICA DE FORA (o padrão consulta o banco)
// ==========================================

test("calada para quem os comandos também ignoram: criadores, bloqueados e manutenção", () => {
    const introducer = about.createIntroductions({ now: clock().now });

    assert.equal(introducer.reply(messageOf(CRIADOR, MENTION), BOT, "h"), null, "criador tem a resposta carinhosa");

    setBlocked(BETO, "teste");

    try {
        assert.equal(introducer.reply(messageOf(BETO, MENTION, { channelId: "c9" }), BOT, "h"), null, "bloqueado");

    } finally {
        unblock(BETO);
    }

    assert.ok(introducer.reply(messageOf(ANA, MENTION, { channelId: "c8" }), BOT, "h"), "pessoa comum responde");

    setSetting("maintenance", "1");

    try {
        assert.equal(introducer.reply(messageOf(CAIO, MENTION, { channelId: "c7" }), BOT, "h"), null, "em manutenção");

    } finally {
        setSetting("maintenance", "0");
    }

    assert.ok(introducer.reply(messageOf(CAIO, MENTION, { channelId: "c7" }), BOT, "h"), "saiu da manutenção");
});

test("se o banco falhar, fica calada em vez de falar sem saber", () => {
    db.exec("ALTER TABLE developer_blacklist RENAME TO developer_blacklist_off");

    try {
        const introducer = about.createIntroductions({ now: clock().now });

        assert.equal(introducer.reply(messageOf(ANA, MENTION, { channelId: "c6" }), BOT, "h"), null);

    } finally {
        db.exec("ALTER TABLE developer_blacklist_off RENAME TO developer_blacklist");
    }
});

// ==========================================
// ENVIAR
// ==========================================

test("introduceSelf envia o cartão uma vez e devolve true; sem o que responder, não envia nada", async () => {
    const sent = [];

    const introducer = introducerWith();

    const send = async (message, data) => { sent.push([message.channelId, data]); };

    assert.equal(await about.introduceSelf({ message: messageOf(ANA, MENTION), botId: BOT, prefix: "h", send, introducer }), true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0][0], "c1");
    assert.equal(sent[0][1].body, introText({ prefix: "h" }));

    // de novo logo em seguida: a espera segura
    assert.equal(await about.introduceSelf({ message: messageOf(ANA, MENTION), botId: BOT, prefix: "h", send, introducer }), false);
    assert.equal(sent.length, 1);
});

test("introduceSelf nunca lança erro: se o envio falhar (sem permissão, por exemplo), só avisa no log", async () => {
    const warnings = [];

    const before = console.warn;

    console.warn = (...args) => warnings.push(args.join(" "));

    try {
        const result = await about.introduceSelf({
            message: messageOf(ANA, MENTION),
            botId: BOT,
            prefix: "h",
            send: async () => { throw new Error("Missing Permissions"); },
            introducer: introducerWith()
        });

        assert.equal(result, false);

    } finally {
        console.warn = before;
    }

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /\[APRESENTAÇÃO\].*Missing Permissions/);
});

test("quando o criador menciona, vale a resposta carinhosa e o cartão nem tenta", async () => {
    const sent = [];

    const send = async (message, data) => { sent.push(data.body); };

    const message = messageOf(CRIADOR, MENTION);

    const greeted = await greetMention({ message, botId: BOT, send });

    assert.equal(greeted, true);

    // o helena.mjs só chama o cartão quando a resposta carinhosa não saiu; e o padrão já ignora criadores
    assert.equal(await about.introduceSelf({ message, botId: BOT, prefix: "h", send }), false);

    assert.equal(sent.length, 1);
    assert.doesNotMatch(sent[0], /Suporte:/);
});

// ==========================================
// COMO O TEXTO SAI
// ==========================================

test("sem prévia de link: a marca vale na mensagem comum e não existe no layout V2; sem a marca, nada muda", () => {
    const plain = toDiscordMessage({ body: introText({ prefix: "h" }), suppressEmbeds: true });

    assert.equal(plain.json.flags, FLAGS.SUPPRESS_EMBEDS);
    assert.equal(FLAGS.SUPPRESS_EMBEDS, 4);

    assert.equal(toDiscordMessage({ body: "oi" }).json.flags, undefined, "sem a marca, sem flags");

    const v2 = toDiscordMessage({ suppressEmbeds: true, components: [{ type: "container", components: [{ type: "text", content: "oi" }] }] });

    assert.equal(v2.json.flags, FLAGS.COMPONENTS_V2, "no V2 só a marca do V2");
});

test("com os emojis do aplicativo, cada linha leva o desenho da Helena e o texto continua dentro de 2000 caracteres", () => {
    setAppEmojis([
        ["flower", "700000000000000001"],
        ["sparkle", "700000000000000002"],
        ["letter", "700000000000000003"],
        ["globe", "700000000000000004"],
        ["book", "700000000000000005"],
        ["laptop", "700000000000000006"]
    ].map(([name, id]) => ({ id, name: `h_${name}`, animated: false })));

    try {
        const { json } = toDiscordMessage({ body: introText({ prefix: "h" }), replyTo: "5550001", suppressEmbeds: true });

        const lines = json.content.split("\n");

        assert.deepEqual(lines.map(line => line.match(/^<:(h_\w+):\d+>/)?.[1]), ["h_flower", "h_sparkle", "h_letter", "h_globe", "h_book", "h_laptop"]);
        assert.ok(json.content.length < 2000);
        assert.deepEqual(json.message_reference, { message_id: "5550001", fail_if_not_exists: false });
        assert.equal(json.flags, 4);

        // os links ficam como estão (o código do emoji não entra no endereço)
        assert.ok(json.content.includes(`Suporte: ${SUPPORT_URL}`));

    } finally {
        setAppEmojis([]);
    }

    // sem emojis no aplicativo, os comuns seguem
    assert.ok(toDiscordMessage({ body: introText({ prefix: "h" }) }).json.content.startsWith("🌸 Olá!"));
});

test("pelo transporte: a mensagem vai ao canal certo, respondendo à pessoa e sem prévia de link", async () => {
    const calls = [];

    const transport = createTransport({
        send: async (channelId, body) => { calls.push([channelId, body.json]); return { id: "m" }; }
    }, "app");

    const message = normalizeMessage({
        id: "5550002",
        guild_id: "g1",
        channel_id: "c1",
        content: MENTION,
        author: { id: ANA, username: "ana" }
    });

    const reply = introducerWith().reply(message, BOT, "h");

    await transport.send(message, reply);

    assert.equal(calls[0][0], "c1");
    assert.equal(calls[0][1].content, introText({ prefix: "h" }));
    assert.equal(calls[0][1].flags, 4);
    assert.deepEqual(calls[0][1].message_reference, { message_id: "5550002", fail_if_not_exists: false });
    assert.equal(calls[0][1].allowed_mentions.replied_user, false, "quem recebe o cartão não leva um aviso de resposta");
});

test("em inglês o cartão sai traduzido, com a ajuda em hhelp", async () => {
    const english = localizeData({ body: introText({ prefix: "h" }) }, "en-US").body;

    assert.equal(english, [
        "🌸 Hi! I'm **Helena**!",
        "✨ My prefix is **h**, use **hhelp** to discover all my commands.",
        `💌 Support: ${SUPPORT_URL}`,
        `🌐 Website: ${SITE_URL}`,
        `📖 Wiki: ${WIKI_URL}`,
        `💻 Code: ${REPO_URL}`
    ].join("\n"));

    // e quem escolheu inglês em /config recebe assim pelo transporte
    setLang(ANA, "en-US");

    try {
        const calls = [];

        const transport = createTransport({
            send: async (channelId, body) => { calls.push(body.json); return { id: "m" }; }
        }, "app");

        const message = normalizeMessage({ id: "5550003", guild_id: "g1", channel_id: "c1", content: MENTION, author: { id: ANA, username: "ana" } });

        await transport.send(message, introducerWith().reply(message, BOT, "h"));

        assert.match(calls[0].content, /Hi! I'm \*\*Helena\*\*!/);
        assert.match(calls[0].content, /use \*\*hhelp\*\*/);

    } finally {
        db.exec("DELETE FROM user_settings");
        resetLangCache();
    }
});

// ==========================================
// A LIGAÇÃO NO helena.mjs
// ==========================================

test("o helena.mjs só apresenta a Helena quando não era um comando e a resposta carinhosa dos criadores não saiu", () => {
    const source = readFileSync(new URL("../helena.mjs", import.meta.url), "utf8").replaceAll("\r\n", "\n");

    assert.match(source, /import \{ introduceSelf \} from "\.\/services\/platform\/about\.mjs"/);
    assert.match(source, /PREFIX,\n\s+processarPrefixo/);

    const at = source.indexOf("if (!eraComando) {\n        const saudou = await greetMention(");

    assert.ok(at > 0, "greetMention dentro do if (!eraComando)");

    const block = source.slice(at, source.indexOf("\n    }\n}", at));

    assert.match(block, /if \(!saudou\) \{\s+await introduceSelf\(\{[\s\S]*?prefix: PREFIX,[\s\S]*?send: enviarMensagemCanal/);
});

// ==========================================
// A BIOGRAFIA DO APLICATIVO
// ==========================================

test("a biografia cabe nos 400 caracteres do Portal e a que está em docs/discord-setup.md é a do código", async () => {
    const { bioText, BIO_LIMIT } = await import("../config/about.mjs");

    const bio = bioText({ prefix: "h" });

    assert.equal(BIO_LIMIT, 400);
    assert.ok([...bio].length <= BIO_LIMIT, `${[...bio].length} caracteres`);

    for (const url of [SUPPORT_URL, SITE_URL]) {
        assert.ok(bio.includes(url), url);
    }

    assert.match(bio, /\*\*Helena\*\*/);
    assert.match(bio, /prefixo é \*\*h\*\*, use \*\*hajuda\*\*/);

    const docs = readFileSync(new URL("../docs/discord-setup.md", import.meta.url), "utf8").replaceAll("\r\n", "\n");

    // o bloco do documento tem o texto com 3 espaços de recuo
    const indented = bio.split("\n").map(line => `   ${line}`).join("\n");

    assert.ok(docs.includes(indented), "o texto da biografia em docs/discord-setup.md é o bioText()");
});
