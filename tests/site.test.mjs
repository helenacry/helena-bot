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

test("tudo o que as páginas carregam existe", () => {
    // [arquivo, pasta de onde os caminhos relativos partem]
    for (const [page, folder] of [["index.html", ""], ["conta/index.html", "conta"]]) {
        const refs = [...read(page).matchAll(/(?:src|href)="([^"]+)"/g)]
            .map(match => match[1])
            .filter(ref => !/^(https?:|mailto:|#|data:)/.test(ref))
            .map(ref => ref.replace(/[?#].*$/, ""));

        assert.ok(refs.length > 5, `achou os links locais de ${page}`);

        for (const ref of refs) {
            const path = join(SITE, folder, ref);

            // um link para uma pasta (conta/) vale se ela tem index.html
            assert.ok(
                existsSync(path) && (!path.endsWith("/") && !path.endsWith("\\") || existsSync(join(path, "index.html"))),
                `${page} aponta para ${ref}, que não existe`
            );
        }
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
// VISUAL
// ==========================================

test("a linha da rotina fica atrás dos números (z-index fixado)", () => {
    const css = read("css/sections.css");

    // a linha (z-index 0) precisa ficar abaixo dos itens (z-index 1), senão a
    // animação de entrada dos itens faz a linha dourada passar por cima dos números
    assert.match(css, /\.steps::before,\s*\.steps::after\s*\{[^}]*z-index:\s*0/);
    assert.match(css, /\.steps li\s*\{[^}]*z-index:\s*1/);
    assert.match(css, /\.steps\s*\{[^}]*isolation:\s*isolate/);
});

test("o ヘレナ é um desenho em SVG com os 4 traços, escrito na ordem", () => {
    const svg = html.match(/<svg class="kanji draw"[\s\S]*?<\/svg>/)?.[0];

    assert.ok(svg, "o SVG do ヘレナ existe");

    // ヘ (1 traço), レ (1 traço), ナ (2 traços)
    const inks = [...svg.matchAll(/<use href="#(k-[a-z0-9]+)" style="--d:([\d.]+)s;--t:([\d.]+)s"\/>/g)];

    assert.deepEqual(inks.map(m => m[1]), ["k-he", "k-re", "k-na1", "k-na2"]);

    // cada traço começa depois de o anterior terminar
    for (let i = 1; i < inks.length; i++) {
        const previousEnd = Number(inks[i - 1][2]) + Number(inks[i - 1][3]);

        assert.ok(Number(inks[i][2]) >= previousEnd - 0.01, `${inks[i][1]} começa depois de ${inks[i - 1][1]}`);
    }

    // o desenho completo é o estado normal: a animação só parte de "from"
    const motion = read("css/motion.css");

    assert.match(motion, /@keyframes ink\s*\{\s*from\s*\{\s*stroke-dashoffset:\s*1/);
    assert.match(read("css/sections.css"), /\.kanji \.ink use\s*\{[^}]*stroke-dashoffset:\s*0/);
});

test("o ヘレナ continua se escrevendo com movimento reduzido (exceção documentada)", () => {
    const motion = read("css/motion.css");
    const reduced = motion.slice(motion.indexOf("@media (prefers-reduced-motion: reduce)"));

    assert.match(reduced, /\.kanji\.draw \.ink use\s*\{[^}]*animation:\s*ink/);

    // o resto da página continua parado nesse modo
    assert.match(reduced, /\*,\s*\*::before,\s*\*::after\s*\{[^}]*animation:\s*none\s*!important/);
});

test("as cores ficam nos tokens: nenhum CSS fora de tokens.css tem cor solta", () => {
    for (const file of readdirSync(join(SITE, "css")).filter(f => f !== "tokens.css")) {
        const css = read(`css/${file}`);

        // só branco e preto puros (texto sobre botão, sombras e máscaras) e rgba(var(--canal))
        const loose = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\((?!var\()[^)]*\)/g)]
            .map(m => m[0])
            .filter(color => !/^(#fff|#000|#ffffff|#000000)$/i.test(color))
            .filter(color => !/^rgba\((0, 0, 0|255, 255, 255),/.test(color));

        assert.deepEqual(loose, [], `css/${file} tem cor fora dos tokens`);
    }
});

// ==========================================
// PAINEL DA CONTA
// ==========================================

test("a página do painel existe, não vai para buscadores e carrega os scripts na ordem", () => {
    const page = read("conta/index.html");

    assert.match(page, /<meta name="robots" content="noindex">/);
    assert.match(page, /<title>Painel da Helena<\/title>/);

    const order = [...page.matchAll(/<script defer src="([^"]+)">/g)].map(m => m[1]);

    assert.deepEqual(order, ["../js/config.js", "../js/util.js", "../js/account.js"]);

    // o painel e a caixa do desafio anti-robô têm lugar fixo na página
    assert.match(page, /id="account"/);
    assert.match(page, /id="acc-captcha-box"[^>]*hidden/);
    assert.match(page, /id="acc-captcha"/);
});

test("o painel vem escondido: sem apiUrl o link não aparece no menu", () => {
    assert.match(html, /<a href="conta\/" data-account hidden>Painel<\/a>/);

    const config = read("js/config.js");

    for (const field of ["apiUrl", "clientId", "turnstileSiteKey"]) {
        assert.match(config, new RegExp(field + ":"), `config.js tem ${field}`);
    }

    // o ID do aplicativo é o do link de convite (é público)
    assert.match(config, /clientId: "235205613573263360"/);
});

test("nenhum segredo vai para o site (só a chave pública do Turnstile)", () => {
    const files = ["index.html", "conta/index.html", "js/config.js", "js/account.js", "js/nav.js"];

    for (const file of files) {
        const text = read(file);

        assert.doesNotMatch(text, /client_secret|clientSecret|HELENA_TURNSTILE_SECRET|VSYNC_BOT_TOKEN|Bot [A-Za-z0-9_-]{20,}/, file);
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
