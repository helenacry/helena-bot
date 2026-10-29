// Base dos testes. Importe este arquivo PRIMEIRO em cada teste: ele
// aponta o banco para uma pasta temporária antes de qualquer módulo
// do bot abrir o SQLite, e roda as migrações.
//
//   import { ... } from "./helpers.mjs";
//
// Cada arquivo *.test.mjs roda em um processo próprio (node --test),
// então cada um tem o seu banco, sem interferência.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Sempre um banco novo e temporário, nunca o que estiver no ambiente.
process.env.HELENA_DATABASE_PATH = join(
    mkdtempSync(join(tmpdir(), "helena-test-")),
    "test.db"
);

process.env.DISCORD_BOT_TOKEN = "token-de-teste";

// A bolsa sorteia preços ao acaso. Nos testes ela começa desligada, para a
// loja valer o preço de tabela; tests/market.test.mjs liga e controla o sorteio.
process.env.HELENA_MARKET = "off";

// O intervalo entre comandos barraria os testes, que usam vários comandos
// seguidos com a mesma pessoa. Começa desligado; tests/anti-spam.test.mjs cria
// o seu próprio com relógio controlado (createPrefixRunner aceita { gate }).
process.env.HELENA_ANTI_SPAM = "off";

// Sem os contadores do servidor de suporte nem edição ao vivo rápida
// demais: os testes controlam o tempo por conta própria.
delete process.env.HELENA_SUPPORT_GUILD_ID;

const migrations = [
    ["../database/migrations.mjs", "runMigrations"],
    ["../database/combat-migrations.mjs", "runCombatMigrations"],
    ["../database/developer-migrations.mjs", "runDeveloperMigrations"],
    ["../database/streak-migrations.mjs", "runStreakMigrations"],
    ["../services/platform/player-names.mjs", "runPlayerNamesMigrations"],
    ["../database/achievement-migrations.mjs", "runAchievementMigrations"],
    ["../database/crime-migrations.mjs", "runCrimeMigrations"],
    ["../database/web-migrations.mjs", "runWebMigrations"],
    ["../database/market-migrations.mjs", "runMarketMigrations"],
    ["../database/family-migrations.mjs", "runFamilyMigrations"],
    ["../database/userinfo-history-migrations.mjs", "runUserinfoHistoryMigrations"]
];

// Silencia o log das migrações.
const log = console.log;
console.log = () => {};

for (const [file, name] of migrations) {
    (await import(file))[name]();
}

console.log = log;

export const { db } = await import("../database/connection.mjs");

export const { getPlayer } = await import("../database/economy.mjs");

// ==========================================
// SORTEIO CONTROLADO
// ==========================================

// Devolve os valores na ordem e, acabando, 0.5.
export function seq(...values) {
    let index = 0;

    return () => (index < values.length ? values[index++] : 0.5);
}

// ==========================================
// ATALHOS
// ==========================================

export const set = (sql, ...params) =>
    db.prepare(sql).run(...params);

export const get = (sql, ...params) =>
    db.prepare(sql).get(...params);

// Roda uma função e devolve o título do GameBlocked lançado, ou
// null se nada foi lançado. Qualquer outro erro vira "ERRO:...".
export async function blockedTitle(fn) {
    const { GameBlocked } = await import("../utils/game-error.mjs");

    try {
        await fn();

        return null;

    } catch (error) {
        return error instanceof GameBlocked
            ? error.title
            : "ERRO:" + error.message;
    }
}

// Comandos pelo prefixo h, como o bot faz.
export async function createPrefixRunner({
    guildId,
    channelId = "900000000000000099",
    author,
    send,
    edit,
    gate,
    firstTime,
    messageId
}) {
    const { carregarComandos } = await import("../command-registry.mjs");
    const { processarPrefixo } = await import("../services/platform/prefix.mjs");

    const log = console.log;
    console.log = () => {};

    const comandos = await carregarComandos();

    console.log = log;

    let sequence = 0;

    return async function run(body, who = author) {
        const sent = [];

        sequence++;

        await processarPrefixo({
            message: {
                id: messageId ? messageId(sequence) : "m" + sequence,
                body,
                guildId,
                channelId,
                author: who
            },

            comandos,

            send: send ?? (async (_message, payload) => {
                sent.push(payload);

                return { message: { id: "msg" + sequence } };
            }),

            edit,

            // sem gate, vale o padrão do bot (desligado nos testes)
            gate,

            // sem firstTime, nada é descartado como repetido
            firstTime
        });

        const first = sent[0] ?? {};

        return {
            sent,
            body: first.body ?? "",
            title: first.embeds?.[0]?.title ?? null,
            // os arquivos (o cartão de perfil) entram no texto só pelo nome e tamanho
            text: JSON.stringify(first, (key, value) =>
                value?.type === "Buffer" ? `<${value.data.length} bytes>` : value
            ),
            components: first.components ?? [],
            attachments: first.files ?? []
        };
    };
}

// Resumo dos campos de um embed por nome: { "💸 Valor": "R$ ..." }.
export function fieldsOf(embed) {
    return Object.fromEntries(
        (embed?.fields ?? []).map(field => [field.name, field.value])
    );
}

// O recibo de uma resposta (as linhas "💵 | nome: **valor**", veja utils/receipt.mjs) como
// { nome: valor }. Aceita o texto, o embed ou a resposta inteira do comando.
export function receiptOf(source) {
    const text = typeof source === "string"
        ? source
        : source?.description ?? source?.data?.embeds?.[0]?.description ?? "";

    const rows = {};

    for (const [, label, value] of text.matchAll(/^\S+ \| (.+?): \*\*(.+)\*\*$/gm)) {
        rows[label] = value;
    }

    return rows;
}

// O dinheiro do jogo vem com espaço rígido ("R$ 1,00"); o recibo usa espaço comum.
export const spaced = text => String(text).replace(/ /g, " ");


// ==========================================
// DISCORD DE MENTIRA
// ==========================================

// Um membro como a API do Discord devolve ({ user, nick, roles, joined_at }).
export const discordMember = (id, username, displayName, nickname = null, bot = false, extra = {}) => ({
    user: {
        id,
        username,
        global_name: displayName,
        avatar: null,
        bot,
        public_flags: 0,
        ...(extra.user ?? {})
    },
    nick: nickname,
    roles: [],
    joined_at: "2025-01-20T12:00:00.000000+00:00",
    ...(extra.member ?? {})
});

const discordReply = (status, body) => ({
    status,
    ok: status < 300,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
    headers: { get: () => null }
});

// O fetch que responde pelas rotas de membro do Discord:
//   GET /guilds/:g/members/:id           um membro (404 se não está)
//   GET /guilds/:g/members/search?query= quem tem o @usuário ou o apelido começando pelo texto
//   GET /users/:id                       o perfil da conta (banner e cor)
// "state" deixa o teste contar as chamadas e derrubar a API: { down, searches, lookups, accounts }.
export function discordGuildFetch(members, state = {}, accounts = {}) {
    state.searches ??= 0;
    state.lookups ??= 0;
    state.accountCalls ??= 0;

    return async url => {
        const target = new URL(String(url));
        const path = target.pathname.replace(/^\/api\/v\d+/, "");

        if (state.down) return discordReply(500, { message: "Internal Server Error" });

        let match;

        if ((match = path.match(/^\/guilds\/[^/]+\/members\/search$/))) {
            state.searches++;

            const query = (target.searchParams.get("query") ?? "").toLowerCase();
            const limit = Number(target.searchParams.get("limit") ?? 10);

            return discordReply(200, members
                .filter(item =>
                    item.user.username.toLowerCase().startsWith(query) ||
                    String(item.nick ?? "").toLowerCase().startsWith(query) ||
                    String(item.user.global_name ?? "").toLowerCase().startsWith(query)
                )
                .slice(0, limit));
        }

        if ((match = path.match(/^\/guilds\/[^/]+\/members\/([^/]+)$/))) {
            state.lookups++;

            const found = members.find(item => item.user.id === decodeURIComponent(match[1]));

            return found ? discordReply(200, found) : discordReply(404, { message: "Unknown Member", code: 10007 });
        }

        if ((match = path.match(/^\/users\/([^/]+)$/))) {
            state.accountCalls++;

            const id = decodeURIComponent(match[1]);

            return accounts[id] ? discordReply(200, accounts[id]) : discordReply(404, { message: "Unknown User", code: 10013 });
        }

        return discordReply(404, { message: "Unknown Route" });
    };
}
