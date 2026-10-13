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

process.env.VSYNC_BOT_TOKEN = "token-de-teste";

// Sem os contadores do servidor de suporte nem edição ao vivo rápida
// demais: os testes controlam o tempo por conta própria.
delete process.env.HELENA_SUPPORT_GUILD_ID;

const migrations = [
    ["../database/migrations.mjs", "runMigrations"],
    ["../database/combat-migrations.mjs", "runCombatMigrations"],
    ["../database/developer-migrations.mjs", "runDeveloperMigrations"],
    ["../database/streak-migrations.mjs", "runStreakMigrations"],
    ["../services/player-names.mjs", "runPlayerNamesMigrations"],
    ["../database/achievement-migrations.mjs", "runAchievementMigrations"],
    ["../database/crime-migrations.mjs", "runCrimeMigrations"],
    ["../database/web-migrations.mjs", "runWebMigrations"]
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
    edit
}) {
    const { carregarComandos } = await import("../registrar.mjs");
    const { processarPrefixo } = await import("../services/prefix.mjs");

    const log = console.log;
    console.log = () => {};

    const comandos = await carregarComandos();

    console.log = log;

    let sequence = 0;

    return async function run(body, who = author) {
        const sent = [];

        await processarPrefixo({
            message: {
                id: "m" + (++sequence),
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

            edit
        });

        const first = sent[0] ?? {};

        return {
            sent,
            body: first.body ?? "",
            title: first.embeds?.[0]?.title ?? null,
            text: JSON.stringify(first),
            components: first.components ?? [],
            attachments: first.attachments ?? []
        };
    };
}

// Resumo dos campos de um embed por nome: { "💸 Valor": "R$ ..." }.
export function fieldsOf(embed) {
    return Object.fromEntries(
        (embed?.fields ?? []).map(field => [field.name, field.value])
    );
}
