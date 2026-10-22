// Lê wiki/*.md, junta com os números do bot e devolve o conteúdo de
// site/src/content/wiki.json (a lista de páginas que o Astro desenha).
// Usado por scripts/site/build-wiki.mjs (grava) e por tests/wiki.test.mjs (confere).
//
// Quem importa este arquivo precisa ter apontado o banco para uma pasta
// temporária antes (ver scripts/site/wiki-values.mjs).

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { buildWiki } from "./wiki-pages.mjs";
import { collectWikiBot } from "./wiki-values.mjs";

export const WIKI_DIR = fileURLToPath(new URL("../../wiki/", import.meta.url));
export const WIKI_OUTPUT = fileURLToPath(new URL("../../site/src/content/wiki.json", import.meta.url));

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

export async function generateWiki() {
    const { NAV } = await import("../../wiki/nav.mjs");

    const pages = buildWiki({
        nav: NAV,
        sources: await readSources(),
        bot: await collectWikiBot()
    });

    const nav = NAV.map(section => ({
        id: section.id,
        title: section.title,
        pages: section.pages.map(page => `${section.id}/${page}`)
    }));

    return {
        pages,
        nav,
        json: JSON.stringify({ nav, pages }, null, 2) + "\n"
    };
}
