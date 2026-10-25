import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// A atividade do bot (o texto que aparece no perfil dele, girando a cada minuto)
// e o endereço do site que ela mostra.

const { getStatusMessages } = await import("../services/platform/status-data.mjs");
const { STATUS_CONFIG } = await import("../config/status.mjs");
const { SITE_URL, WIKI_URL, SITE_LABEL } = await import("../config/site.mjs");
const { HELP_CONFIG } = await import("../config/help.mjs");

const ROOT = fileURLToPath(new URL("../", import.meta.url));

test("o endereço do site vem de um lugar só e tem a forma certa", () => {
    assert.match(SITE_URL, /^https:\/\/[a-z0-9.-]+\/(?:[a-z0-9-]+\/)?$/, "https e com a barra no fim");
    assert.equal(WIKI_URL, `${SITE_URL}wiki/`);
    assert.equal(SITE_LABEL, "helena.discloud.dev", "sem https e sem a barra do fim");

    assert.equal(STATUS_CONFIG.site, SITE_LABEL, "a atividade usa o endereço do site");
    assert.equal(HELP_CONFIG.wikiUrl, WIKI_URL, "a ajuda aponta para a wiki do mesmo site");
});

test("o site da atividade é o endereço que o .env.example libera para o painel", () => {
    // o .env.example lista o site como origem permitida do painel
    const example = readFileSync(path.join(ROOT, ".env.example"), "utf8");

    const origin = example.match(/^HELENA_WEB_ORIGINS=(\S+)/m)?.[1];

    assert.ok(origin, ".env.example tem HELENA_WEB_ORIGINS");
    assert.ok(SITE_URL.startsWith(`${origin}/`), `${SITE_URL} deveria ficar em ${origin}`);
});

test("uma das atividades mostra o site, e todas cabem no limite", () => {
    for (const input of [{}, { guildCount: 3 }, { guildCount: 1200, guildCountComplete: true }]) {
        const messages = getStatusMessages(input);

        assert.equal(messages.length, 5);

        for (const message of messages) {
            assert.ok(message.length > 0 && message.length <= STATUS_CONFIG.maxActivityLength, `"${message}" (${message.length})`);
        }

        assert.ok(messages.includes(`Online | site: ${SITE_LABEL}`), "a atividade com o site");
        assert.ok(messages.includes(`Online | ${STATUS_CONFIG.helpCommand}`), "a atividade com o comando de ajuda");
    }
});

test("as atividades de servidores seguem o que o bot sabe", () => {
    assert.ok(getStatusMessages({}).includes("Cluster 1 | aguardando dados"));
    assert.ok(getStatusMessages({}).includes("Servers: aguardando dados"));

    assert.ok(getStatusMessages({ guildCount: 3 }).includes("Cluster 1 | [3]"));
    assert.ok(getStatusMessages({ guildCount: 3 }).includes("3 servers"));
});

test("o endereço antigo do site não aparece mais em lugar nenhum do bot", () => {
    const folders = ["config", "services", "commands", "utils", "database"];

    const files = [
        path.join(ROOT, "helena.mjs"),
        path.join(ROOT, "command-registry.mjs"),
        ...folders.flatMap(folder =>
            readdirSync(path.join(ROOT, folder), { recursive: true, withFileTypes: true })
                .filter(entry => entry.isFile() && entry.name.endsWith(".mjs"))
                .map(entry => path.join(entry.parentPath, entry.name))
        )
    ];

    assert.ok(files.length > 100);

    for (const file of files) {
        assert.doesNotMatch(readFileSync(file, "utf8"), /helenabot\.help/, path.relative(ROOT, file));
    }
});
