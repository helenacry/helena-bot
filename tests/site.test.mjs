import { db } from "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join, dirname } from "node:path";

const { collectSiteData } = await import("../site/data-source.mjs");
const { WEB_CONFIG } = await import("../config/web.mjs");

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
    for (const [page, folder] of [
        ["index.html", ""],
        ["account/index.html", "account"],
        ["terms/index.html", "terms"],
        ["privacy/index.html", "privacy"]
    ]) {
        const refs = [...read(page).matchAll(/(?:src|href)="([^"]+)"/g)]
            .map(match => match[1])
            .filter(ref => !/^(https?:|mailto:|#|data:)/.test(ref))
            .map(ref => ref.replace(/[?#].*$/, ""));

        assert.ok(refs.length > 5, `achou os links locais de ${page}`);

        for (const ref of refs) {
            const path = join(SITE, folder, ref);

            // um link para uma pasta (account/) vale se ela tem index.html
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

test("comandos do dono do bot e de teste não aparecem no site", async () => {
    const names = data.categories.flatMap(c => c.commands.map(command => command.name));

    for (const folder of ["admin", "dev"]) {
        const dir = join(dirname(SITE), "commands", folder);

        const files = readdirSync(dir).filter(f => f.endsWith(".mjs"));

        assert.ok(files.length > 0, `commands/${folder} tem comandos`);

        for (const file of files) {
            // o nome do arquivo é em inglês; o que vale é o nome do comando dentro dele
            const { default: command } = await import(pathToFileURL(join(dir, file)).href);

            assert.ok(command?.name, `commands/${folder}/${file} exporta um comando`);
            assert.ok(!names.includes(command.name), `/${command.name} (commands/${folder}) está no site`);
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

test("o logo leva ao topo da página, não a uma âncora mais abaixo", () => {
    // #topo é o <main>: clicar nele rola uns 70 px (a altura do cabeçalho) e a página
    // fica diferente de quando foi aberta. href="#" volta ao começo de verdade.
    const brands = [...html.matchAll(/<a class="brand" href="([^"]*)"/g)].map(m => m[1]);

    assert.equal(brands.length, 2, "o do menu e o do rodapé");
    assert.deepEqual(brands, ["#", "#"]);
});

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
    assert.match(read("css/sections.css"), /\.kanji \.ink use,\s*\.kanji-h \.ink use\s*\{[^}]*stroke-dashoffset:\s*0/);
});

test("no celular o ヘレナ aparece na horizontal, com os mesmos traços, cada letra na sua casa", () => {
    // os 4 traços moram num SVG de tamanho zero, reusado pelos dois desenhos
    const defs = html.match(/<svg class="kanji-defs"[\s\S]*?<\/svg>/)?.[0];

    assert.ok(defs, "SVG com os traços");

    const paths = Object.fromEntries(
        [...defs.matchAll(/<path id="(k-[a-z0-9]+)" pathLength="1" d="([^"]+)"\/>/g)].map(m => [m[1], m[2]])
    );

    assert.deepEqual(Object.keys(paths), ["k-he", "k-re", "k-na1", "k-na2"]);

    // o desenho horizontal vem no topo do texto do herói, antes do "eyebrow"
    const horizontal = html.match(/<svg class="kanji-h draw"[\s\S]*?<\/svg>/)?.[0];

    assert.ok(horizontal, "o SVG horizontal existe");
    assert.match(horizontal, /viewBox="0 0 300 100"/);
    assert.ok(html.indexOf(horizontal) < html.indexOf('<span class="eyebrow">Bot de economia'), "fica acima do texto");

    const vertical = html.match(/<svg class="kanji draw"[\s\S]*?<\/svg>/)[0];

    const inks = svg => [...svg.match(/<g class="ink">[\s\S]*?<\/g>/)[0].matchAll(/<use href="#(k-[a-z0-9]+)"(?: transform="translate\((-?\d+) (-?\d+)\)")? style="--d:([\d.]+)s;--t:([\d.]+)s"\/>/g)]
        .map(m => ({ id: m[1], dx: Number(m[2] ?? 0), dy: Number(m[3] ?? 0), delay: m[4], time: m[5] }));

    const written = inks(horizontal);
    const reference = inks(vertical);

    assert.deepEqual(written.map(s => s.id), ["k-he", "k-re", "k-na1", "k-na2"], "mesma ordem");

    // a escrita tem a mesma cadência nos dois desenhos
    assert.deepEqual(written.map(s => [s.delay, s.time]), reference.map(s => [s.delay, s.time]));

    // a sombra fixa (ghost) tem os mesmos deslocamentos da tinta
    const ghost = [...horizontal.match(/<g class="ghost">[\s\S]*?<\/g>/)[0].matchAll(/<use href="#(k-[a-z0-9]+)"(?: transform="translate\((-?\d+) (-?\d+)\)")?\/>/g)]
        .map(m => [m[1], Number(m[2] ?? 0), Number(m[3] ?? 0)]);

    assert.deepEqual(ghost, written.map(s => [s.id, s.dx, s.dy]));

    // cada letra cabe na sua casa de 100 x 100: ヘ, レ e ナ (os dois traços) da esquerda para a direita
    const cell = { "k-he": 0, "k-re": 1, "k-na1": 2, "k-na2": 2 };

    for (const stroke of written) {
        const numbers = paths[stroke.id].match(/-?\d+(?:\.\d+)?/g).map(Number);

        for (let i = 0; i < numbers.length; i += 2) {
            const x = numbers[i] + stroke.dx;
            const y = numbers[i + 1] + stroke.dy;

            assert.ok(x >= cell[stroke.id] * 100 && x <= cell[stroke.id] * 100 + 100, `${stroke.id}: x=${x} fora da casa ${cell[stroke.id]}`);
            assert.ok(y >= 0 && y <= 100, `${stroke.id}: y=${y} fora do desenho`);
        }
    }

    // só um dos dois aparece: o vertical a partir de 1280 px, o horizontal nas telas menores
    const css = read("css/sections.css");

    assert.match(css, /\.kanji-h\s*\{[^}]*display:\s*block/);
    assert.match(css, /@media \(min-width: 1280px\) \{ \.kanji-h \{ display: none; \} \}/);
    assert.match(css, /@media \(min-width: 1280px\) \{ \.kanji \{ display: block; \} \}/);
});

test("o ヘレナ continua se escrevendo com movimento reduzido (exceção documentada)", () => {
    const motion = read("css/motion.css");
    const reduced = motion.slice(motion.indexOf("@media (prefers-reduced-motion: reduce)"));

    assert.match(reduced, /\.kanji\.draw \.ink use,\s*\.kanji-h\.draw \.ink use\s*\{[^}]*animation:\s*ink/);

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
    const page = read("account/index.html");

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
    assert.match(html, /<a href="account\/" data-account hidden>Painel<\/a>/);

    const config = read("js/config.js");

    for (const field of ["apiUrl", "clientId", "turnstileSiteKey"]) {
        assert.match(config, new RegExp(field + ":"), `config.js tem ${field}`);
    }

    // o ID do aplicativo é o do link de convite (é público)
    assert.match(config, /clientId: "235205613573263360"/);
});

test("nenhum segredo vai para o site (só a chave pública do Turnstile)", () => {
    const files = ["index.html", "account/index.html", "js/config.js", "js/account.js", "js/nav.js"];

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

// ==========================================
// TERMOS E PRIVACIDADE
// ==========================================

const terms = read("terms/index.html");
const privacy = read("privacy/index.html");

const LEGAL = [["terms", terms], ["privacy", privacy]];

// texto da página sem tags, em minúsculas e sem acento
const plainText = page => page
    .replace(/<[^>]+>/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();

test("termos e privacidade: o sumário bate com as seções, na ordem e numeradas", () => {
    for (const [name, page] of LEGAL) {
        const toc = [...page.matchAll(/<li><a href="#([a-z-]+)">/g)].map(m => m[1]);
        const sections = [...page.matchAll(/<section id="([a-z-]+)">/g)].map(m => m[1]);
        const numbers = [...page.matchAll(/<span class="n">(\d\d)<\/span>/g)].map(m => Number(m[1]));

        assert.ok(toc.length >= 12, `${name}: achou o sumário`);
        assert.deepEqual(sections, toc, `${name}: cada item do sumário aponta para uma seção, na mesma ordem`);
        assert.deepEqual(numbers, toc.map((_, index) => index + 1), `${name}: seções numeradas 01, 02, 03...`);

        assert.match(page, /<li>Versão \d+\.\d+<\/li>/, name);
        assert.match(page, /<li>Em vigor desde \d{1,2} de \w+ de 20\d\d<\/li>/, name);
    }
});

test("as tabelas da política empilham no celular: cada célula tem o nome da sua coluna", () => {
    const tables = [...privacy.matchAll(/<table>([\s\S]*?)<\/table>/g)].map(m => m[1]);

    assert.equal(tables.length, 3, "bases legais, prazos e cookies");

    for (const table of tables) {
        const heads = [...table.matchAll(/<th>([\s\S]*?)<\/th>/g)].map(m => m[1].trim());

        for (const row of table.match(/<tr>(?:(?!<\/tr>)[\s\S])*<td>[\s\S]*?<\/tr>/g)) {
            const cells = [...row.matchAll(/<td( data-label="([^"]*)")?>/g)];

            assert.equal(cells.length, heads.length, `uma célula por coluna em ${row.slice(0, 60)}`);
            assert.equal(cells[0][1], undefined, "a primeira célula é o título da linha");

            cells.slice(1).forEach((cell, index) => {
                assert.equal(cell[2], heads[index + 1], "data-label igual ao cabeçalho da coluna");
            });
        }
    }

    assert.match(read("css/legal.css"), /td\[data-label\]::before\s*\{[^}]*content:\s*attr\(data-label\)/);
});

test("termos e privacidade: cada 'seção N' citada no texto leva ao assunto certo", () => {
    // para onde cada número aponta hoje; se as seções mudarem de lugar, o texto também precisa mudar
    const target = {
        terms: { 5: "regras", 15: "contato" },
        privacy: { 3: "bot", 6: "terceiros", 15: "contato" }
    };

    for (const [name, page] of LEGAL) {
        const toc = [...page.matchAll(/<li><a href="#([a-z-]+)">/g)].map(m => m[1]);
        const refs = [...page.matchAll(/seção (\d+)/g)].map(m => Number(m[1]));

        assert.ok(refs.length > 0, `${name} cita seções`);

        for (const number of refs) {
            assert.ok(target[name][number], `${name}: "seção ${number}" não está no mapa do teste`);
            assert.equal(toc[number - 1], target[name][number], `${name}: "seção ${number}" deveria ser ${target[name][number]}`);
        }
    }
});

test("termos e privacidade: os prazos e limites do texto vêm da configuração do painel", () => {
    const expected = {
        "session-hours": `${WEB_CONFIG.sessionTtl / 3600} horas`,
        "session-max": String(WEB_CONFIG.maxSessionsPerUser),
        "claim-log-days": String(WEB_CONFIG.claimLogDays)
    };

    const found = page => [...page.matchAll(/data-fact="([a-z-]+)">([^<]+)</g)];

    for (const [name, page] of LEGAL) {
        for (const [, key, text] of found(page)) {
            assert.equal(text, expected[key], `${name}: data-fact="${key}"`);
        }
    }

    const keys = page => new Set(found(page).map(match => match[1]));

    assert.deepEqual([...keys(terms)].sort(), ["session-hours", "session-max"]);
    assert.deepEqual([...keys(privacy)].sort(), ["claim-log-days", "session-hours"]);

    // o prazo do registro é de verdade: o painel o apaga (veja web-api.test.mjs)
    assert.ok(WEB_CONFIG.claimLogDays > 0);
});

test("o contato e o servidor oficial dos textos são os do config.js, e sem e-mail", () => {
    const config = read("js/config.js");

    const contact = config.match(/contactUrl: "([^"]+)"/)?.[1];
    const support = config.match(/supportUrl: "([^"]+)"/)?.[1];

    assert.match(contact, /^https:\/\/github\.com\/[A-Za-z0-9-]+$/, "contato público é o perfil do GitHub");

    for (const [name, page] of LEGAL) {
        const links = [...page.matchAll(/<a href="([^"]+)" data-link="(contact|support)"/g)];

        for (const kind of ["contact", "support"]) {
            const hrefs = links.filter(link => link[2] === kind).map(link => link[1]);

            assert.ok(hrefs.length >= 1, `${name}: tem link de ${kind}`);

            for (const href of hrefs) {
                assert.equal(href, kind === "contact" ? contact : support, `${name}: link de ${kind}`);
            }
        }

        assert.doesNotMatch(page, /mailto:|[\w.+-]+@[\w-]+\.[a-z]{2,}/i, `${name}: o contato público não tem e-mail`);
    }
});

test("termos e privacidade: carregam só config, util e nav, e abrem sem menu", () => {
    for (const [name, page] of LEGAL) {
        const order = [...page.matchAll(/<script defer src="([^"]+)">/g)].map(m => m[1]);

        assert.deepEqual(order, ["../js/config.js", "../js/util.js", "../js/nav.js"], name);
        assert.doesNotMatch(page, /noindex/, `${name}: política pública, pode aparecer em buscas`);
    }

    // nav.js também serve a essas páginas: sem #menu-btn, #nav e #top-bar ele não pode quebrar
    const anchors = { contact: fakeAnchor(), support: fakeAnchor(), code: fakeAnchor() };

    const document = {
        querySelector: () => null,
        querySelectorAll: selector => {
            const kind = selector.match(/data-link="(\w+)"/)?.[1];

            return kind && anchors[kind] ? [anchors[kind]] : [];
        },
        getElementById: () => null
    };

    const window = {
        document,
        scrollY: 0,
        matchMedia: () => ({ matches: false }),
        addEventListener: () => {}
    };

    const context = { window, document };

    for (const file of ["js/config.js", "js/util.js", "js/nav.js"]) {
        vm.runInNewContext(read(file), context);
    }

    const config = window.Helena.config;

    assert.equal(anchors.contact.href, config.contactUrl);
    assert.equal(anchors.support.href, config.supportUrl);
    assert.equal(anchors.contact.hidden, false);

    // sem codeUrl, o link do código continua escondido
    assert.equal(anchors.code.hidden, true);

    function fakeAnchor() {
        return { href: "", hidden: true, target: "", rel: "", textContent: "texto", getAttribute: () => null };
    }
});

test("o site, o painel e as duas páginas se ligam entre si", () => {
    assert.match(html, /<a href="terms\/">Termos de uso<\/a>/);
    assert.match(html, /<a href="privacy\/">Privacidade<\/a>/);

    const account = read("account/index.html");

    assert.match(account, /<a href="\.\.\/terms\/">/);
    assert.match(account, /<a href="\.\.\/privacy\/">/);

    assert.match(terms, /<a href="\.\.\/privacy\/">Política de Privacidade<\/a>/);
    assert.match(privacy, /<a href="\.\.\/terms\/">Termos de uso<\/a>/);

    for (const [name, page] of LEGAL) {
        assert.match(page, /<a class="brand" href="\.\.\/"/, `${name}: o logo volta para o site`);
        assert.match(page, /<link rel="stylesheet" href="\.\.\/css\/legal\.css">/, name);
    }
});

test("a política diz que não há cookies nem rastreadores, e o site não tem", () => {
    // domínios que as páginas e os scripts podem chamar; todos aparecem na política (seção 6)
    const allowed = new Set([
        "fonts.googleapis.com", "fonts.gstatic.com",   // fontes (Google)
        "vsync.lat",                                    // convite, login e servidor oficial
        "github.com",                                   // contato do desenvolvedor
        "challenges.cloudflare.com"                     // verificação anti-robô do painel
    ]);

    const files = [
        "index.html", "account/index.html", "terms/index.html", "privacy/index.html",
        ...readdirSync(join(SITE, "js")).map(file => `js/${file}`)
    ];

    for (const file of files) {
        const text = read(file);

        assert.doesNotMatch(text, /document\.cookie/, `${file} mexe em cookies`);
        assert.doesNotMatch(text, /gtag\(|googletagmanager|google-analytics|plausible|hotjar|matomo|clarity\.ms|facebook\.net/i, `${file} tem rastreador`);

        for (const [, host] of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
            assert.ok(allowed.has(host), `${file} fala com ${host}, que a política não cita`);
        }
    }

    const policy = plainText(privacy);

    for (const owner of ["vsync", "cloudflare", "github", "google fonts"]) {
        assert.ok(policy.includes(owner), `a política cita ${owner}`);
    }
});

test("a política cobre todas as tabelas do banco que guardam dados de pessoas", () => {
    // tabela -> uma expressão que a política usa para descrevê-la (sem acento, em minúsculas)
    const covered = {
        players: "carteira",
        global_users: "gemas",
        transactions: "transferencias",
        player_names: "nome de exibicao",
        crime_players: "ficha de crime",
        prison_players: "prisao",
        laundering_jobs: "lavagem",
        combat_players: "vitorias e derrotas",
        combat_challenges: "duelos",
        combat_gear: "municao",
        combat_history: "historico de duelos",
        combat_admin_log: "ajustes feitos por administradores",
        developer_blacklist: "bloqueadas",
        developer_logs: "acoes do dono",
        mission_progress: "missoes",
        inventory: "inventario",
        equipped_items: "itens equipados",
        marriages: "casamento",
        marriage_requests: "pedidos de casamento",
        player_achievements: "conquistas",
        player_titles: "titulos",
        daily_streaks: "sequencia do daily",
        web_sessions: "sessao",
        web_claim_log: "registro de seguranca",
        userinfo_views: "contagem de quantas vezes o perfil de cada pessoa foi consultado"
    };

    // tabelas sem nada de pessoa (só IDs técnicos e ajustes do bot)
    const technical = ["processed_interactions", "developer_settings", "market_state"];

    const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .all()
        .map(row => row.name);

    const known = new Set([...Object.keys(covered), ...technical]);

    assert.deepEqual(
        tables.filter(table => !known.has(table)),
        [],
        "tabela nova no banco: descreva na política (site/privacy/index.html, seção 4) o que ela guarda e ponha aqui"
    );

    const policy = plainText(privacy);

    for (const [table, phrase] of Object.entries(covered)) {
        assert.ok(tables.includes(table), `${table} não existe mais: tire do mapa`);
        assert.ok(policy.includes(phrase), `a política não descreve ${table} (procurei "${phrase}")`);
    }

    // o que o texto afirma que fica em cada tabela de sessão e de registro
    for (const table of ["web_sessions", "web_claim_log"]) {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);

        assert.ok(columns.includes("ip") && columns.includes("user_agent"), `${table} guarda IP e navegador`);
    }
});
