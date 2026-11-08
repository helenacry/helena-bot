process.env.HELENA_OWNER_ID = "777000000000000001, 777000000000000002";

import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Os gestos de carinho para os criadores: a resposta à menção e as boas-vindas quando entram em um
// servidor (services/platform/creators.mjs, guild-channels.mjs) e o que o gateway pede para vê-los.

const creators = await import("../services/platform/creators.mjs");
const channels = await import("../services/platform/guild-channels.mjs");
const { MENTION_REPLIES, WELCOME_MESSAGES } = await import("../config/creators.mjs");
const { INTENTS, DEFAULT_INTENTS, FATAL_CLOSE, intentsFromEnv } = await import("../services/discord/gateway.mjs");
const { toDiscordMessage } = await import("../services/discord/format.mjs");
const { createTransport } = await import("../services/discord/transport.mjs");
const { setLang, resetLangCache } = await import("../services/platform/i18n.mjs");
const { normalizeMessage } = await import("../services/discord/normalize.mjs");

const BOT = "999000000000000009";
const CRIADOR_A = "777000000000000001";
const CRIADOR_B = "777000000000000002";
const OUTRA_PESSOA = "123456789012345678";

// um relógio de mentira, para a espera entre respostas
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

const greeterWith = (relogio = clock(), extra = {}) => creators.createCreatorGreetings({
    isCreator: id => [CRIADOR_A, CRIADOR_B].includes(String(id)),
    now: relogio.now,
    random: () => 0,
    ...extra
});

// ==========================================
// A MENÇÃO AO BOT
// ==========================================

test("mentionsBot: só a menção escrita no texto, <@id> ou <@!id>, e só do ID certo", () => {
    assert.equal(creators.mentionsBot(`oi <@${BOT}>`, BOT), true);
    assert.equal(creators.mentionsBot(`<@!${BOT}> oi`, BOT), true);
    assert.equal(creators.mentionsBot(`oi <@${BOT}0>`, BOT), false, "outro ID que começa igual");
    assert.equal(creators.mentionsBot("oi, Helena", BOT), false, "só o nome não conta");
    assert.equal(creators.mentionsBot(`<@${CRIADOR_A}>`, BOT), false, "menção a outra pessoa");
    assert.equal(creators.mentionsBot(`<@${BOT}>`, null), false, "sem ID do bot");
    assert.equal(creators.mentionsBot(`<@${BOT}>`, "abc"), false, "ID inválido");
    assert.equal(creators.mentionsBot(null, BOT), false);
});

// ==========================================
// A RESPOSTA À MENÇÃO
// ==========================================

test("quando um criador menciona a Helena ela responde à mensagem, com um dos textos fofos", () => {
    const reply = greeterWith().mentionReply(messageOf(CRIADOR_A, `oi <@${BOT}>`), BOT);

    assert.deepEqual(reply, { body: MENTION_REPLIES[0], replyTo: "5550001" });
    assert.ok(MENTION_REPLIES.length >= 4, "variedade para não repetir sempre a mesma frase");
});

test("o texto escolhido varia com o sorteio e nunca sai do que existe na lista", () => {
    for (const sorteio of [0, 0.3, 0.5, 0.99, 1]) {
        const reply = greeterWith(clock(), { random: () => sorteio }).mentionReply(messageOf(CRIADOR_A, `<@${BOT}>`), BOT);

        assert.ok(MENTION_REPLIES.includes(reply.body), `sorteio ${sorteio}`);
    }
});

test("quem não é criador não ganha resposta, nem bot, nem webhook", () => {
    const greeter = greeterWith();

    assert.equal(greeter.mentionReply(messageOf(OUTRA_PESSOA, `oi <@${BOT}>`), BOT), null);
    assert.equal(greeter.mentionReply(messageOf(CRIADOR_A, `oi <@${BOT}>`, { author: { id: CRIADOR_A, bot: true } }), BOT), null);
    assert.equal(greeter.mentionReply(messageOf(CRIADOR_A, `oi <@${BOT}>`, { webhookId: "w1" }), BOT), null);
    assert.equal(greeter.mentionReply(messageOf(CRIADOR_A, "oi sem mencionar"), BOT), null);
    assert.equal(greeter.mentionReply(null, BOT), null);
    assert.equal(greeter.mentionReply({}, BOT), null);
});

test("a espera: duas menções seguidas respondem uma vez, e depois do prazo responde de novo", () => {
    const relogio = clock();
    const greeter = greeterWith(relogio);

    const menciona = autor => greeter.mentionReply(messageOf(autor, `<@${BOT}>`), BOT);

    assert.ok(menciona(CRIADOR_A));
    assert.equal(menciona(CRIADOR_A), null, "logo em seguida");

    relogio.advance(29_000);

    assert.equal(menciona(CRIADOR_A), null, "ainda dentro dos 30 s");
    assert.ok(menciona(CRIADOR_B), "outro criador tem a sua própria espera");

    relogio.advance(2_000);

    assert.ok(menciona(CRIADOR_A), "passou o prazo");
});

// A Helena fala de si no feminino ("obrigada", "pronta"); o cuidado é com quem ela recebe: nada de
// "bem-vindo/bem-vinda" nem de "criador/criadora" no singular. "Boas-vindas" e "meus criadores" valem.
test("os textos não presumem o gênero de quem é recebido", () => {
    for (const texto of [...MENTION_REPLIES, ...WELCOME_MESSAGES]) {
        assert.doesNotMatch(texto, /\b(bem-vindo|bem-vinda|criador|criadora|obrigado)\b/i, texto);
    }
});

// ==========================================
// AS BOAS-VINDAS
// ==========================================

test("quando um criador entra, a Helena o recebe marcando a pessoa", () => {
    const welcome = greeterWith().welcome({ guildId: "g1", user: { id: CRIADOR_A } });

    assert.ok(welcome.body.includes(`<@${CRIADOR_A}>`), welcome.body);
    assert.ok(!welcome.body.includes("{user}"), "o espaço da menção foi preenchido");
    assert.equal(welcome.replyTo, undefined);
});

test("boas-vindas exclusivas dos criadores: ninguém mais, nem bot", () => {
    const greeter = greeterWith();

    assert.equal(greeter.welcome({ guildId: "g1", user: { id: OUTRA_PESSOA } }), null);
    assert.equal(greeter.welcome({ guildId: "g1", user: { id: CRIADOR_A, bot: true } }), null);
    assert.equal(greeter.welcome({ guildId: null, user: { id: CRIADOR_A } }), null);
    assert.equal(greeter.welcome({ guildId: "g1", user: null }), null);
    assert.equal(greeter.welcome({ guildId: "g1" }), null);
});

test("entrar e sair do servidor não repete as boas-vindas em 10 minutos, mas outro servidor tem as suas", () => {
    const relogio = clock();
    const greeter = greeterWith(relogio);

    const entra = (guildId, id = CRIADOR_A) => greeter.welcome({ guildId, user: { id } });

    assert.ok(entra("g1"));
    assert.equal(entra("g1"), null);
    assert.ok(entra("g2"), "outro servidor");
    assert.ok(entra("g1", CRIADOR_B), "outro criador no mesmo servidor");

    relogio.advance(10 * 60_000 + 1);

    assert.ok(entra("g1"), "passou o prazo");
});

test("os textos de boas-vindas têm a menção e cabem numa mensagem", () => {
    for (const texto of WELCOME_MESSAGES) {
        assert.ok(texto.includes("{user}"), texto);
        assert.ok(texto.length < 300, texto);
    }
});

// ==========================================
// ENVIAR: A MENÇÃO E AS BOAS-VINDAS
// ==========================================

test("greetMention envia a resposta para a mensagem e diz que respondeu", async () => {
    const enviados = [];
    const greeter = greeterWith();

    const respondeu = await creators.greetMention({
        message: messageOf(CRIADOR_A, `<@${BOT}> oi`),
        botId: BOT,
        send: async (alvo, dados) => { enviados.push([alvo.id, dados]); },
        greeter
    });

    assert.equal(respondeu, true);
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0][0], "5550001");
    assert.equal(enviados[0][1].replyTo, "5550001");
});

test("greetMention fica quieta com quem não é criador e nunca lança erro quando o Discord recusa", async () => {
    const enviados = [];
    const greeter = greeterWith();

    assert.equal(await creators.greetMention({
        message: messageOf(OUTRA_PESSOA, `<@${BOT}>`),
        botId: BOT,
        send: async () => { enviados.push(1); },
        greeter
    }), false);

    assert.equal(enviados.length, 0);

    const aviso = console.warn;
    const avisos = [];

    console.warn = (...args) => avisos.push(args.join(" "));

    try {
        assert.equal(await creators.greetMention({
            message: messageOf(CRIADOR_A, `<@${BOT}>`),
            botId: BOT,
            send: async () => { throw new Error("Missing Permissions"); },
            greeter
        }), false);

    } finally {
        console.warn = aviso;
    }

    assert.match(avisos[0], /Missing Permissions/);
});

test("welcomeCreator tenta os canais em ordem e para no primeiro que aceita", async () => {
    const tentativas = [];

    const canal = await creators.welcomeCreator({
        event: { guild_id: "g1", user: { id: CRIADOR_A } },
        channelsOf: () => ["c-avisos", "c-geral", "c-extra"],
        send: async alvo => {
            tentativas.push(alvo.channelId);

            if (alvo.channelId === "c-avisos") {
                throw new Error("Missing Access");
            }
        },
        greeter: greeterWith()
    });

    assert.equal(canal, "c-geral");
    assert.deepEqual(tentativas, ["c-avisos", "c-geral"], "o terceiro nem é tentado");
});

test("welcomeCreator: o alvo do envio leva a pessoa (para o idioma dela) e o servidor", async () => {
    let alvoVisto = null;

    await creators.welcomeCreator({
        event: { guild_id: "g1", user: { id: CRIADOR_B, username: "bia" } },
        channelsOf: () => ["c1"],
        send: async alvo => { alvoVisto = alvo; },
        greeter: greeterWith()
    });

    assert.deepEqual(alvoVisto, { channelId: "c1", guildId: "g1", user: { id: CRIADOR_B, username: "bia" } });
});

test("welcomeCreator não manda nada para quem não é criador, e avisa quando nenhum canal aceita", async () => {
    let enviou = 0;

    assert.equal(await creators.welcomeCreator({
        event: { guild_id: "g1", user: { id: OUTRA_PESSOA } },
        channelsOf: () => ["c1"],
        send: async () => { enviou++; },
        greeter: greeterWith()
    }), null);

    assert.equal(enviou, 0);

    const aviso = console.warn;
    const avisos = [];

    console.warn = (...args) => avisos.push(args.join(" "));

    try {
        const falhou = await creators.welcomeCreator({
            event: { guild_id: "g9", user: { id: CRIADOR_A } },
            channelsOf: () => ["c1", "c2"],
            send: async () => { throw new Error("Missing Permissions"); },
            greeter: greeterWith()
        });

        const semCanal = await creators.welcomeCreator({
            event: { guild_id: "g8", user: { id: CRIADOR_A } },
            channelsOf: () => [],
            send: async () => { enviou++; },
            greeter: greeterWith()
        });

        assert.equal(falhou, null);
        assert.equal(semCanal, null);

    } finally {
        console.warn = aviso;
    }

    assert.equal(enviou, 0);
    assert.match(avisos[0], /g9.*Missing Permissions/);
    assert.match(avisos[1], /g8.*nenhum canal conhecido/);
});

test("com o padrão (HELENA_OWNER_ID de verdade), os dois IDs do ambiente são os criadores", async () => {
    const enviados = [];

    for (const [indice, autor] of [CRIADOR_A, CRIADOR_B, OUTRA_PESSOA].entries()) {
        await creators.greetMention({
            message: messageOf(autor, `<@${BOT}>`, { id: `m${indice}` }),
            botId: BOT,
            send: async (alvo) => { enviados.push(alvo.id); }
        });
    }

    assert.deepEqual(enviados, ["m0", "m1"]);
});

// ==========================================
// ONDE FALAR EM CADA SERVIDOR
// ==========================================

test("o canal de avisos vem primeiro, depois os canais de texto por posição, até 5", () => {
    channels.resetGuildChannels();

    channels.rememberGuildChannels({
        id: "g1",
        system_channel_id: "900",
        channels: [
            { id: "11", type: 2, position: 0 },   // voz: nunca
            { id: "12", type: 0, position: 3 },
            { id: "13", type: 0, position: 1 },
            { id: "900", type: 0, position: 2 },  // o de avisos não repete
            { id: "14", type: 4, position: 0 },   // categoria: nunca
            { id: "15", type: 0, position: 2 },
            { id: "16", type: 0, position: 9 },
            { id: "17", type: 0, position: 10 }
        ]
    });

    assert.deepEqual(channels.welcomeChannelsOf("g1"), ["900", "13", "15", "12", "16"]);
    assert.deepEqual(channels.welcomeChannelsOf("g-desconhecido"), []);
});

test("sem canal de avisos, valem os de texto; sem nenhum, o servidor fica sem canal; sair apaga", () => {
    channels.resetGuildChannels();

    channels.rememberGuildChannels({ id: "g2", channels: [{ id: "21", type: 0, position: 0 }] });
    assert.deepEqual(channels.welcomeChannelsOf("g2"), ["21"]);

    channels.rememberGuildChannels({ id: "g3", channels: [{ id: "31", type: 2 }] });
    assert.deepEqual(channels.welcomeChannelsOf("g3"), []);

    channels.rememberGuildChannels({ id: "g4", system_channel_id: "41" });
    assert.deepEqual(channels.welcomeChannelsOf("g4"), ["41"]);

    channels.rememberGuildChannels({ id: "g2" });
    assert.deepEqual(channels.welcomeChannelsOf("g2"), [], "um GUILD_CREATE sem canais limpa o que havia");

    channels.rememberGuildChannels({ id: "g4", system_channel_id: "41" });
    channels.forgetGuildChannels("g4");
    assert.deepEqual(channels.welcomeChannelsOf("g4"), []);

    channels.rememberGuildChannels(null);
    channels.rememberGuildChannels({});
    channels.resetGuildChannels();
});

test("a lista devolvida é uma cópia: mexer nela não muda o que está guardado", () => {
    channels.resetGuildChannels();

    channels.rememberGuildChannels({ id: "g5", system_channel_id: "51" });

    channels.welcomeChannelsOf("g5").push("lixo");

    assert.deepEqual(channels.welcomeChannelsOf("g5"), ["51"]);

    channels.resetGuildChannels();
});

// ==========================================
// AS INTENÇÕES DO GATEWAY
// ==========================================

test("a Server Members Intent só é pedida com HELENA_MEMBERS_INTENT ligada", () => {
    assert.equal(intentsFromEnv({}), DEFAULT_INTENTS);
    assert.equal(intentsFromEnv({ HELENA_MEMBERS_INTENT: "" }), DEFAULT_INTENTS);
    assert.equal(intentsFromEnv({ HELENA_MEMBERS_INTENT: "off" }), DEFAULT_INTENTS);
    assert.equal(intentsFromEnv({ HELENA_MEMBERS_INTENT: "talvez" }), DEFAULT_INTENTS);

    for (const valor of ["on", "ON", "1", "true", " sim "]) {
        assert.equal(intentsFromEnv({ HELENA_MEMBERS_INTENT: valor }), DEFAULT_INTENTS | INTENTS.GUILD_MEMBERS, valor);
    }

    assert.equal(INTENTS.GUILD_MEMBERS, 2);
    assert.equal(DEFAULT_INTENTS & INTENTS.GUILD_MEMBERS, 0, "o padrão não pede a intenção privilegiada de membros");
    assert.ok(DEFAULT_INTENTS & INTENTS.MESSAGE_CONTENT, "o padrão segue lendo o texto dos comandos");
});

test("o aviso do erro 4014 cita as duas intenções", () => {
    assert.match(FATAL_CLOSE[4014], /Message Content/);
    assert.match(FATAL_CLOSE[4014], /Server Members/);
    assert.match(FATAL_CLOSE[4014], /HELENA_MEMBERS_INTENT/);
});

// ==========================================
// O ENVIO COMO RESPOSTA
// ==========================================

test("replyTo vira message_reference e a Helena não marca de novo quem respondeu", () => {
    const { json } = toDiscordMessage({ body: "oi", replyTo: "5550001" });

    assert.deepEqual(json.message_reference, { message_id: "5550001", fail_if_not_exists: false });
    assert.equal(json.allowed_mentions.replied_user, false);
});

test("sem replyTo, ou numa edição, não há message_reference", () => {
    assert.equal(toDiscordMessage({ body: "oi" }).json.message_reference, undefined);
    assert.equal(toDiscordMessage({ body: "oi", replyTo: "5550001" }, { update: true }).json.message_reference, undefined);
});

test("o transporte leva o replyTo até o Discord, também para quem usa o inglês", async () => {
    resetLangCache();

    setLang(CRIADOR_A, "en-US");

    const chamadas = [];

    const transport = createTransport({
        send: async (channelId, body) => { chamadas.push([channelId, body.json]); return { id: "m" }; }
    }, "app");

    const mensagem = normalizeMessage({
        id: "5550002",
        guild_id: "g1",
        channel_id: "c1",
        content: `<@${BOT}> oi`,
        author: { id: CRIADOR_A, username: "ana" }
    });

    await transport.send(mensagem, { body: "Oi, oi!", replyTo: mensagem.id });

    assert.equal(chamadas[0][0], "c1");
    assert.deepEqual(chamadas[0][1].message_reference, { message_id: "5550002", fail_if_not_exists: false });
});

// ==========================================
// A LIGAÇÃO NO helena.mjs
// ==========================================

test("o helena.mjs liga as peças: intenções, canais do servidor, menção e entrada de membro", () => {
    const fonte = readFileSync(new URL("../helena.mjs", import.meta.url), "utf8");

    assert.match(fonte, /intents:\s*intentsFromEnv\(process\.env\)/);
    assert.match(fonte, /nome === "GUILD_MEMBER_ADD"/);
    assert.match(fonte, /rememberGuildChannels\(dados\)/);
    assert.match(fonte, /forgetGuildChannels\(guildId\)/);
    assert.match(fonte, /greetMention\(\{/);
    assert.match(fonte, /welcomeCreator\(\{/);
    assert.match(fonte, /botUserId = String\(dados\.user\.id\)/);
});
