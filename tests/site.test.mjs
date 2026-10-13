import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const { collectSiteData } = await import("../site/data-source.mjs");

const SITE = fileURLToPath(new URL("../site/", import.meta.url));

const read = file => readFileSync(join(SITE, file), "utf8");

const html = read("index.html");

const data = await collectSiteData();

// o que o site embute em site/data/site-data.js
function embedded() {
    const file = read("data/site-data.js");
    const marker = "window.Helena.data = ";

    return JSON.parse(
        file.slice(file.indexOf(marker) + marker.length).replace(/;\s*$/, "")
    );
}

// ==========================================
// ARQUIVOS
// ==========================================

test("tudo o que o index.html carrega existe", () => {
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map(match => match[1])
        .filter(ref => !/^(https?:|mailto:|#|data:)/.test(ref));

    assert.ok(refs.length > 10, "achou os links locais");

    for (const ref of refs) {
        assert.ok(existsSync(join(SITE, ref)), `site/${ref} não existe`);
    }
});

test("as imagens citadas nos CSS existem", () => {
    for (const file of readdirSync(join(SITE, "css"))) {
        const css = read(`css/${file}`);

        for (const match of css.matchAll(/url\("([^"]+)"\)/g)) {
            const path = join(SITE, "css", match[1]);

            assert.ok(existsSync(path), `css/${file} cita ${match[1]}, que não existe`);
        }
    }
});

test("os scripts carregam na ordem certa: dados, config, util e o resto", () => {
    const order = [...html.matchAll(/<script defer src="([^"]+)">/g)].map(m => m[1]);

    assert.deepEqual(order.slice(0, 3), ["data/site-data.js", "js/config.js", "js/util.js"]);

    // scripts clássicos, para abrir direto do disco
    assert.doesNotMatch(html, /type="module"/);
});

// ==========================================
// DADOS
// ==========================================

test("os dados do site acompanham o bot (rode npm run site:data se falhar)", () => {
    assert.deepEqual(embedded(), JSON.parse(JSON.stringify(data)));
});

test("os números de reserva do HTML batem com os dados", () => {
    const found = [...html.matchAll(/data-stat="(\w+)">(\d+)</g)];

    assert.ok(found.length >= 4);

    for (const [, key, value] of found) {
        assert.equal(Number(value), data.stats[key], `data-stat="${key}" no HTML`);
    }
});

test("comandos do dono do bot e de teste não aparecem no site", () => {
    const names = data.categories.flatMap(c => c.commands.map(command => command.name));

    for (const folder of ["admin", "dev"]) {
        const dir = join(dirname(SITE), "commands", folder);

        for (const file of readdirSync(dir).filter(f => f.endsWith(".mjs"))) {
            const name = file.replace(/\.mjs$/, "");

            assert.ok(!names.includes(name), `/${name} (commands/${folder}) está no site`);
        }
    }

    assert.ok(!names.includes("testembed"));
    assert.ok(names.includes("daily") && names.includes("loja") && names.includes("usaritem"));
});

test("cada categoria tem comandos, empregos crescem e as conquistas têm raridade conhecida", () => {
    assert.ok(data.categories.length >= 5);
    assert.ok(data.categories.every(c => c.commands.length > 0));

    assert.equal(data.jobs.length, data.stats.jobs);

    for (let i = 1; i < data.jobs.length; i++) {
        assert.ok(data.jobs[i].salary > data.jobs[i - 1].salary, `${data.jobs[i].name} paga mais que o anterior`);
        assert.ok(data.jobs[i].level > data.jobs[i - 1].level);
    }

    assert.equal(data.achievements.length, data.stats.achievements);

    for (const achievement of data.achievements) {
        assert.ok(data.rarities[achievement.rarity], `${achievement.name}: raridade ${achievement.rarity}`);
    }
});

// ==========================================
// LINKS
// ==========================================

test("os links do convite e do servidor oficial estão preenchidos", () => {
    const config = read("js/config.js");

    assert.match(config, /inviteUrl: "https:\/\/vsync\.lat\/oauth2\/authorize\?client_id=\d+&scope=bot/);
    assert.match(config, /supportUrl: "https:\/\/vsync\.lat\/\w+"/);
});
