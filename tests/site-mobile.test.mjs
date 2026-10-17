import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// O que o teste do site no celular (Edge emulando 320 a 430 px) achou, travado
// aqui para não voltar. O que só aparece olhando a tela (texto por cima do
// botão, alvo de toque pequeno) vira regra no CSS que dá para conferir.

const SITE = fileURLToPath(new URL("../site/", import.meta.url));

const read = file => readFileSync(join(SITE, file), "utf8");

const cssFiles = readdirSync(join(SITE, "css")).filter(file => file.endsWith(".css"));

test("nenhum texto do site é menor que 12px (0.75rem)", () => {
    const small = [];

    for (const file of cssFiles) {
        // font-size: 0.7rem  |  font: 500 0.72rem var(--font-mono)
        for (const match of read(`css/${file}`).matchAll(/font(?:-size)?:(?: \d{3})? (\d*\.?\d+)rem/g)) {
            if (Number(match[1]) < 0.75) small.push(`${file}: ${match[0]}`);
        }
    }

    assert.deepEqual(small, []);
});

test("o cabeçalho tem os botões Dashboard e Adicionar, curtos o bastante para caber em qualquer tela", () => {
    const html = read("index.html");
    const nav = read("js/nav.js");
    const css = read("css/components.css");

    const actions = html.match(/<div class="actions">([\s\S]*?)<\/div>/)[1];

    // Com a API ligada o botão é o Dashboard (leva ao painel); sem ela, continua o "Ver comandos".
    assert.match(actions, /<a class="btn ghost" href="account\/" data-account hidden>Dashboard<\/a>/);
    assert.match(actions, /<a class="btn ghost" href="#comandos" data-no-account>Ver comandos<\/a>/);
    assert.match(nav, /\[data-no-account\][\s\S]{0,80}hidden = true/);

    // o convite do cabeçalho é só "Adicionar", em qualquer largura (sem versão curta separada)
    assert.match(actions, /data-cta="invite" data-on="Adicionar">/);
    assert.doesNotMatch(html, /data-on-short/);
    assert.doesNotMatch(nav, /"class": "(long|short)"/);
    assert.doesNotMatch(css, /\.top \.btn \.(long|short)/);

    // o link "Painel" do menu só aparece no menu do celular (no computador o botão já leva ao painel)
    assert.match(css, /\.nav a\[data-account\] \{ display: none; \}/);
    assert.match(css, /@media \(max-width: 1080px\) \{[^@]*\.nav a\[data-account\]:not\(\[hidden\]\) \{ display: block; \}/);
});

test("os links do menu não quebram em duas linhas (\"O jogo\" não vira \"O\" e \"jogo\")", () => {
    assert.match(read("css/components.css"), /\.nav a \{[^}]*white-space: nowrap;/);
});

test("o nome da Helena no cabeçalho não encolhe nem quebra (o botão não pode ficar por cima)", () => {
    const css = read("css/components.css");

    assert.match(css, /\.brand \{[^}]*flex: none;/);
    assert.match(css, /\.brand b \{[^}]*white-space: nowrap;/);
});

test("alvos de toque: chip de comando, sumário legal e link da wiki têm área grande no celular", () => {
    assert.match(read("css/base.css"), /@media \(max-width: 720px\), \(pointer: coarse\) \{\s*\.cmd \{[^}]*min-height: 44px;/);
    assert.match(read("css/legal.css"), /\.legal-toc a \{[^}]*min-height: 40px;/);
    assert.match(read("css/wiki.css"), /\.crumbs a \{ padding: 13px 8px; margin: -13px -8px; \}/);
});

test("o painel sempre tem um h1: os avisos que ocupam a página são o título", () => {
    const code = read("js/account.js");

    assert.match(code, /el\(page \? "h1" : "h2", \{ text: title \}\)/);

    // todo aviso de página inteira passa page = true; os de dentro do painel logado não
    for (const title of ["Entrando…", "Carregando…", "Fora do ar", "Painel indisponível"]) {
        const at = code.indexOf(`notice(\n        "${title}"`) >= 0 ? code.indexOf(`notice(\n        "${title}"`) : code.indexOf(`notice("${title}"`);

        assert.ok(at >= 0, `não achei o aviso "${title}"`);

        const call = code.slice(at, code.indexOf(")]);", at));

        assert.match(call, /true\s*$/, `o aviso "${title}" é a página inteira e precisa ser h1`);
    }

    assert.match(read("css/account.css"), /\.acc-notice h1, \.acc-notice h2 \{/);
});

test("a lista de comandos não promete copiar se o clique não copia", () => {
    const html = read("index.html");
    const commands = read("js/commands.js");

    const lede = html.match(/<section class="band" id="comandos">[\s\S]*?<p class="lede">(.*?)<\/p>/)[1];

    if (/copiar/i.test(lede)) {
        assert.match(commands, /data-copy/, "o texto diz que clicar copia, mas os cartões não copiam");
    }
});

test("a página 404 funciona em qualquer profundidade: parte do endereço do site e todos os arquivos existem", async () => {
    const { SITE_URL } = await import("../config/site.mjs");
    const { existsSync } = await import("node:fs");

    const page = read("404.html");

    assert.equal(page.match(/<base href="([^"]+)">/)[1], SITE_URL, "o <base> da 404 precisa ser o SITE_URL");
    assert.match(page, /<meta name="robots" content="noindex">/);
    assert.equal((page.match(/<h1[ >]/g) ?? []).length, 1);
    assert.match(page, /<html lang="pt-BR">/);

    const refs = [...page.matchAll(/(?:src|href)="([^"]+)"/g)]
        .map(match => match[1])
        .filter(ref => !/^(https?:|mailto:|#|data:)/.test(ref) && ref !== "./")
        .map(ref => ref.replace(/[?#].*$/, ""));

    assert.ok(refs.length >= 6, "achou os arquivos locais da 404");

    for (const ref of refs) {
        const path = join(SITE, ref);

        assert.ok(existsSync(path) && (!ref.endsWith("/") || existsSync(join(path, "index.html"))), `a 404 aponta para ${ref}, que não existe`);
    }

    // a volta para o início e a wiki estão na página
    assert.match(page, /href="\.\/"/);
    assert.match(page, /href="wiki\/"/);
});

test("aberto direto do disco (file://), os links de pasta apontam para o index.html; online nada muda", async () => {
    const vm = await import("node:vm");

    // sem window.location (como aqui) o script não toca em nenhum link
    const context = { window: { matchMedia: () => ({ matches: false }) } };

    vm.runInNewContext(read("js/util.js"), context);

    const { localHref } = context.window.Helena;

    assert.equal(localHref("economy/market/"), "economy/market/index.html");
    assert.equal(localHref("./"), "./index.html");
    assert.equal(localHref("../"), "../index.html");
    assert.equal(localHref("wiki/"), "wiki/index.html");
    assert.equal(localHref("wiki/#faq"), "wiki/index.html#faq");
    assert.equal(localHref("./combat/duels/?q=1"), "./combat/duels/index.html?q=1");

    // o que já é arquivo, âncora ou endereço de fora fica como está
    for (const href of ["", "#topo", "page.html", "../css/base.css", "https://vsync.lat/x/", "mailto:a@b.c", "//cdn.example.com/x/"]) {
        assert.equal(localHref(href), href, href);
    }

    // o ajuste só liga em file: (online "pasta/" é o endereço limpo e funciona)
    assert.match(read("js/util.js"), /window\.location\.protocol === "file:"/);

    // toda página do site carrega o util.js, que é onde o ajuste mora
    for (const page of ["index.html", "terms/index.html", "privacy/index.html", "account/index.html", "wiki/index.html", "wiki/economy/market/index.html"]) {
        assert.match(read(page), /<script defer src="(\.\.\/)*(\.\.\/)?js\/util\.js"><\/script>/, page);
    }
});

test("a wiki sempre tem um jeito de voltar ao site, também no celular", () => {
    const css = read("css/wiki.css");

    for (const file of ["wiki/index.html", "wiki/economy/gems/index.html"]) {
        const html = read(file);

        // no cabeçalho: "Voltar ao site" no computador e "← Site" no celular (o nome acessível é sempre o inteiro)
        assert.match(html, /<a class="btn wiki-back" href="[^"]*"><span class="long">Voltar ao site<\/span><span class="short" aria-hidden="true">← Site<\/span><span class="sr short-name">Voltar ao site<\/span><\/a>/, file);

        // e como primeiro item da gaveta do menu
        assert.match(html, /<aside class="wiki-side"[^>]*>\s*<a class="side-back" href="[^"]*">← Voltar ao site<\/a>/, file);
    }

    // o botão do cabeçalho não é mais escondido no celular
    assert.doesNotMatch(css, /\.actions \.btn:not\(\.wiki-menu-btn\) \{ display: none; \}/);
    assert.match(css, /@media \(max-width: 560px\) \{[^@]*\.wiki-back \.long \{ display: none; \}[^@]*\.wiki-back \.short \{ display: inline; \}/);
    assert.match(css, /\.side-back \{ display: none; \}\s*@media \(max-width: 860px\) \{\s*\.side-back \{\s*display: flex;[^}]*min-height: 44px;/);
});

test("a gaveta do menu da wiki no celular ocupa a altura da tela e rola por dentro", () => {
    const rule = read("css/wiki.css").match(/\.wiki-js \.wiki-side \{([^}]*)\}/)[1];

    assert.match(rule, /position: fixed/);
    assert.match(rule, /top: 64px/);
    assert.match(rule, /bottom: 0/);

    // sem isto o "align-self: start" do menu de computador faz o Chromium ignorar top e bottom:
    // a gaveta vira uma coluna da altura do texto, começa atrás do cabeçalho e não rola
    assert.match(rule, /align-self: stretch/);
});

test("o convite do cabeçalho fica junto do Menu (ponta direita) no tablet e no celular", () => {
    const css = read("css/components.css");

    assert.match(css, /@media \(max-width: 1080px\) \{[^@]*\.menu-btn \{ display: inline-flex; margin-left: 0; \}[^@]*\.top \.actions \{ margin-left: auto; \}/);
});

test("os links dos rodapés da wiki e das páginas legais têm área de toque de verdade", () => {
    assert.match(read("css/wiki.css"), /\.wiki-foot a \{ display: inline-block; padding: 10px 0; \}/);
    assert.match(read("css/legal.css"), /\.legal-foot a \{ display: inline-block; padding: 10px 0;/);
});

test("o painel é uma ficha: só a linha com daily liberado tem fundo e barra dourada, e a coroa marca o 7º dia", () => {
    const css = read("css/account.css");

    assert.match(css, /\.acc-row\.ready \{[^}]*background: var\(--bg-2\);[^}]*box-shadow: inset 3px 0 0 var\(--gold\);/);
    assert.match(css, /\.acc-row\.jail \{[^}]*box-shadow: inset 3px 0 0 var\(--red\);/);

    // a coroa é desenhada em CSS (sem emoji nem biblioteca de ícones)
    assert.match(css, /--crown: polygon\(/);
    assert.match(css, /clip-path: var\(--crown\)/);

    // o movimento só roda com a classe "in" e some com movimento reduzido
    assert.match(css, /\.in \.acc-track::after \{ animation: acc-fill/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^}]*animation: none;/);

    // a gaveta e o painel usam só cores dos tokens
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(/);
});
