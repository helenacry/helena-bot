// Lê wiki/*.md, junta com os números do bot e devolve os arquivos de site/wiki/.
// Usado por scripts/site/build-wiki.mjs (grava) e por tests/wiki.test.mjs (confere).
//
// Quem importa este arquivo precisa ter apontado o banco para uma pasta
// temporária antes (ver scripts/site/wiki-values.mjs).

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { buildWiki } from "./wiki-pages.mjs";
import { collectWikiBot } from "./wiki-values.mjs";

const WIKI_DIR = fileURLToPath(new URL("../../wiki/", import.meta.url));
const SITE_DIR = fileURLToPath(new URL("../../site/", import.meta.url));

// wiki/index.md -> "home"; wiki/start/first-steps.md -> "start/first-steps"
async function readSources() {
    const sources = {};

    async function walk(dir) {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await walk(full);
            } else if (entry.name.endsWith(".md")) {
                const slug = path.relative(WIKI_DIR, full).replace(/\\/g, "/").replace(/\.md$/, "");

                sources[slug === "index" ? "home" : slug] = await readFile(full, "utf8");
            }
        }
    }

    await walk(WIKI_DIR);

    return sources;
}

// um link site:terms/ vale se site/terms/index.html existe
const siteHas = target => {
    const clean = target.replace(/[?#].*$/, "");

    const file = path.join(SITE_DIR, clean);

    return clean === "" || existsSync(file) && (!clean.endsWith("/") || existsSync(path.join(file, "index.html")));
};

export async function generateWiki() {
    const { NAV } = await import("../../wiki/nav.mjs");

    return buildWiki({
        nav: NAV,
        sources: await readSources(),
        bot: await collectWikiBot(),
        siteHas
    });
}
