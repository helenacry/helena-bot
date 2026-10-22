import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const {
    renderMarkdown, parseFrontMatter, expandValues, slugify, escapeHtml
} = await import("../scripts/site/wiki-markdown.mjs");

const { reais, percent, duration, range, table } = await import("../scripts/site/wiki-values.mjs");
const { generateWiki, WIKI_OUTPUT } = await import("../scripts/site/wiki-generate.mjs");
const { SITE_PAGES } = await import("../scripts/site/wiki-pages.mjs");
const { NAV } = await import("../wiki/nav.mjs");

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SITE_PAGES_DIR = path.join(ROOT, "site", "src", "pages");
const WIKI_SRC = fileURLToPath(new URL("../wiki/", import.meta.url));

// ==========================================
// CONVERSOR DE MARKDOWN
// ==========================================

const links = {
    resolveLink: target => target.startsWith("wiki:") ? `/w/${target.slice(5)}/` : target,
    cards: list => `<cards:${list.join(",")}>`
};

const render = markdown => renderMarkdown(markdown, links);

test("títulos ganham âncora, o texto não repete id e o sumário sai dos ## e ###", () => {
    const { html, headings } = render("## Fuga\n\ntexto\n\n### Fuga\n\n## Fuga da prisão\n");

    assert.deepEqual(headings.map(h => [h.level, h.id]), [[2, "fuga"], [3, "fuga-2"], [2, "fuga-da-prisao"]]);
    assert.match(html, /<h2 id="fuga"><a class="anchor" href="#fuga" aria-label="Link para esta seção">#<\/a>Fuga<\/h2>/);

    assert.equal(slugify("Ação & Reação! 2"), "acao-reacao-2");
});

test("negrito, itálico, código e links; o texto é sempre escapado", () => {
    const { html } = render("Use **/daily** e *depois* `a < b && c` ou [a bolsa](wiki:economy/market) e [site](https://exemplo.test/?a=1&b=2). <script>alert(1)</script>");

    assert.match(html, /<strong>\/daily<\/strong>/);
    assert.match(html, /<em>depois<\/em>/);
    assert.match(html, /<code>a &lt; b &amp;&amp; c<\/code>/);
    assert.match(html, /<a href="\/w\/economy\/market\/">a bolsa<\/a>/);
    assert.match(html, /<a href="https:\/\/exemplo\.test\/\?a=1&amp;b=2" target="_blank" rel="noopener">site<\/a>/);

    assert.doesNotMatch(html, /<script/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("o que está entre crases não recebe negrito nem itálico", () => {
    const { html } = render("`**nada** e *nada*` mas **isto** sim");

    assert.match(html, /<code>\*\*nada\*\* e \*nada\*<\/code>/);
    assert.match(html, /<strong>isto<\/strong>/);
});

test("listas, ordenadas e aninhadas", () => {
    const { html } = render("- um\n- dois\n  - dois e meio\n- três\n\n1. primeiro\n2. segundo\n");

    assert.match(html, /<ul><li>um<\/li><li>dois<ul><li>dois e meio<\/li><\/ul><\/li><li>três<\/li><\/ul>/);
    assert.match(html, /<ol><li>primeiro<\/li><li>segundo<\/li><\/ol>/);
});

test("tabelas: as curtas empilham no celular (data-label), as largas não", () => {
    const short = render("| Item | Quanto |\n| --- | --- |\n| Maçã | R$ 3 |\n").html;

    assert.match(short, /<div class="table-wrap stack">/);
    assert.match(short, /<td>Maçã<\/td><td data-label="Quanto">R\$ 3<\/td>/, "a primeira célula é o título da linha");

    const wide = render("| A | B | C | D |\n| --- | --- | --- | --- |\n| 1 | 2 | 3 | 4 |\n").html;

    assert.match(wide, /<div class="table-wrap" role="region" tabindex="0" aria-label="Tabela: A, B, C, D"><table>/);
    assert.match(wide, /<td data-label="D">4<\/td>/);

    const piped = render("| Comando | O que faz |\n| --- | --- |\n| `/x` | a \\| b |\n").html;

    assert.match(piped, /<td data-label="O que faz">a \| b<\/td>/, "\\| é um | dentro da célula");
});

test("blocos de código e avisos", () => {
    const { html } = render("```\nhdepositar 100\n<b>\n```\n\n> [!WARNING]\n> Cuidado com **isto**.\n> Segunda linha.\n\n> [!MONEY] Uma linha só.\n");

    assert.match(html, /<pre><code>hdepositar 100\n&lt;b&gt;<\/code><\/pre>/);
    assert.match(html, /<aside class="callout warning"><p class="callout-title">Atenção<\/p><p>Cuidado com <strong>isto<\/strong>\. Segunda linha\.<\/p><\/aside>/);
    assert.match(html, /<aside class="callout money"><p class="callout-title">Dinheiro<\/p><p>Uma linha só\.<\/p><\/aside>/);
});

test("cartões e régua", () => {
    const { html } = render("{{cards: a/b, c/d}}\n\n---\n");

    assert.match(html, /<cards:a\/b,c\/d>/);
    assert.match(html, /<hr>/);
});

test("o texto limpo para a busca não leva marcação nem o # da âncora", () => {
    const { text } = render("## Título\n\nUm **texto** com `/comando`.\n");

    assert.equal(text, "Título Um texto com /comando.");
});

test("o que o conversor não entende vira erro, não HTML solto", () => {
    assert.throws(() => render("# Título grande\n"), /Título inválido/);
    assert.throws(() => render("#### Fundo\n"), /Título inválido/);
    assert.throws(() => render("```\nsem fim\n"), /sem o fechamento/);
    assert.throws(() => render("| A | B |\n| 1 | 2 |\n| 3 | 4 |\n"), /separação/);
    assert.throws(() => render("| A | B |\n| --- | --- |\n| 1 | 2 | 3 |\n"), /colunas a mais ou a menos/);
    assert.throws(() => render("> Uma citação comum\n"), /Citação sem tipo conhecido/);
    assert.throws(() => render("> [!INVENTADO]\n> x\n"), /Citação sem tipo conhecido/);
});

test("cabeçalho da página: título e descrição são obrigatórios", () => {
    const { meta, body } = parseFrontMatter("---\ntitle: Bolsa\ndescription: O mercado.\n---\nCorpo\n", "x.md");

    assert.deepEqual(meta, { title: "Bolsa", description: "O mercado." });
    assert.equal(body, "Corpo\n");

    // aspas servem para valores com dois-pontos e não aparecem no título
    assert.equal(
        parseFrontMatter('---\ntitle: "Crime: por onde começar"\ndescription: Um texto.\n---\n', "x.md").meta.title,
        "Crime: por onde começar"
    );

    assert.throws(() => parseFrontMatter("sem cabeçalho", "x.md"), /faltou o cabeçalho/);
    assert.throws(() => parseFrontMatter("---\ntitle: A\n---\n", "x.md"), /precisa de "description"/);
    assert.throws(() => parseFrontMatter("---\ntitle A\n---\n", "x.md"), /linha inválida/);
});

test("{{v:caminho}} troca pelo valor do bot e erra se o valor não existe", () => {
    const values = { crime: { cooldown: "1 hora" }, n: 5 };

    assert.equal(expandValues("Espera de {{v:crime.cooldown}} ({{v:n}}x)", values), "Espera de 1 hora (5x)");
    assert.throws(() => expandValues("{{v:crime.nada}}", values, "p.md"), /p\.md: o valor \{\{v:crime\.nada\}\} não existe/);
    assert.throws(() => expandValues("{{v:crime}}", values), /não existe/, "um grupo não é um valor");
});

// ==========================================
// FORMATOS DOS NÚMEROS
// ==========================================

test("dinheiro, porcentagem e tempo saem em português", () => {
    assert.equal(reais(50_000), "R$ 500");
    assert.equal(reais(250), "R$ 2,50");
    assert.equal(reais(1_000_000), "R$ 10.000");

    assert.equal(percent(0.5), "50%");
    assert.equal(percent(0.033), "3,3%");
    assert.equal(percent(0.245), "24,5%");

    assert.equal(duration(3600), "1 hora");
    assert.equal(duration(5 * 3600), "5 horas");
    assert.equal(duration(24 * 3600), "24 horas");
    assert.equal(duration(48 * 3600), "48 horas");
    assert.equal(duration(72 * 3600), "3 dias");
    assert.equal(duration(1800), "30 minutos");
    assert.equal(duration(60), "1 minuto");
    assert.equal(duration(90), "90 segundos");

    assert.equal(range(30, 80), "30 a 80");
    assert.equal(range(8000, 60000, reais), "R$ 80 a R$ 600");

    assert.equal(table(["A", "B"], [["x|y", "z"]]), "| A | B |\n| --- | --- |\n| x\\|y | z |");
});

// ==========================================
// A WIKI GERADA
// ==========================================

const { pages, json } = await generateWiki();

const byId = new Map(pages.map(page => [page.id, page]));

const order = NAV.flatMap(section => section.pages.map(page => `${section.id}/${page}`));

const diskFiles = dir => readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.relative(dir, path.join(entry.parentPath, entry.name)).replace(/\\/g, "/"));

test("site/src/content/wiki.json está em dia com wiki/*.md e com o bot (rode npm run wiki:build se falhar)", () => {
    assert.equal(
        readFileSync(WIKI_OUTPUT, "utf8").replace(/\r\n/g, "\n"),
        json.replace(/\r\n/g, "\n"),
        "o arquivo gerado está desatualizado"
    );
});

test("o menu, os arquivos de wiki/ e as páginas geradas contam a mesma história", () => {
    assert.deepEqual([...byId.keys()].sort(), ["index", ...order].sort());

    const sources = diskFiles(WIKI_SRC).filter(file => file.endsWith(".md")).map(file => file.replace(/\.md$/, ""));

    assert.deepEqual(sources.sort(), ["index", ...order].sort());

    // slugs em inglês, em kebab-case (veja a memória "nomes em inglês")
    for (const section of NAV) {
        assert.match(section.id, /^[a-z]+(-[a-z]+)*$/);

        for (const page of section.pages) {
            assert.match(page, /^[a-z]+(-[a-z]+)*$/, `${section.id}/${page}`);
        }
    }

    for (const page of pages) {
        assert.equal(page.path, page.id === "index" ? "/wiki/" : `/wiki/${page.id}/`);
    }
});

test("cada página tem título, descrição, ids sem repetição e nenhum h1 no corpo (o título vem do site)", () => {
    for (const page of pages) {
        assert.ok(page.title && page.description, `${page.id}: título e descrição`);
        assert.doesNotMatch(page.html, /<h1[ >]/, `${page.id}: o h1 é do layout`);

        const ids = [...page.html.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);

        assert.equal(new Set(ids).size, ids.length, `${page.id}: id repetido`);
        assert.deepEqual(page.headings.map(heading => heading.id), ids, `${page.id}: o sumário tem um item por título`);
    }
});

test("nada de {{...}} sobrando, e nenhum HTML escrito à mão passa pelo conversor", () => {
    for (const page of pages) {
        assert.doesNotMatch(page.html, /\{\{|\}\}/, `${page.id}: marcador não resolvido`);
    }

    for (const source of diskFiles(WIKI_SRC).filter(file => file.endsWith(".md"))) {
        const text = readFileSync(path.join(WIKI_SRC, source), "utf8");

        assert.doesNotMatch(text, /<\/?(?:script|iframe|style|div|span|a)\b/i, `wiki/${source}: HTML solto`);
    }
});

test("todo link da wiki leva a uma página, a uma página do site ou a https; as âncoras existem", () => {
    const wikiPaths = new Map(pages.map(page => [page.path, page]));

    let internal = 0;

    for (const page of pages) {
        const own = new Set(page.headings.map(heading => heading.id));

        for (const [, href] of page.html.matchAll(/href="([^"]+)"/g)) {
            if (href.startsWith("https://")) continue;

            if (href.startsWith("#")) {
                assert.ok(own.has(href.slice(1)), `${page.id}: âncora ${href} não existe na página`);
                continue;
            }

            assert.ok(href.startsWith("/"), `${page.id}: link "${href}" não é interno nem https`);

            const [target, anchor] = href.split("#");

            internal++;

            if (wikiPaths.has(target)) {
                if (anchor) {
                    assert.ok(wikiPaths.get(target).headings.some(heading => heading.id === anchor), `${page.id}: ${href}, a seção não existe`);
                }

                continue;
            }

            assert.ok(SITE_PAGES.includes(target.slice(1)), `${page.id}: ${href} não é uma página da wiki nem do site`);
        }
    }

    assert.ok(internal > 40, "achou os links internos");
});

test("as páginas do site que a wiki pode citar existem de verdade em site/src/pages", () => {
    for (const target of SITE_PAGES) {
        const file = target === "" ? path.join(SITE_PAGES_DIR, "index.astro") : path.join(SITE_PAGES_DIR, target, "index.astro");

        assert.ok(existsSync(file), `site:${target} não tem página (${path.relative(ROOT, file)})`);
    }
});

test("todo comando público do bot é citado em alguma página, fora da lista geral", async () => {
    const { collectSiteData } = await import("../scripts/site/data-source.mjs");

    const { categories } = await collectSiteData();

    const names = categories.flatMap(category => category.commands.map(command => command.name));

    assert.ok(names.length > 40);

    // o texto de todas as páginas, menos a lista gerada de comandos (que cita todos por construção)
    const prose = pages
        .filter(page => page.id !== "help/commands")
        .map(page => page.html.replace(/<[^>]+>/g, " "))
        .join("\n");

    const missing = names.filter(name => !new RegExp(`/${name}(?![a-z])`).test(prose));

    assert.deepEqual(missing, [], "comando novo sem página na wiki: escreva sobre ele em wiki/ e rode npm run wiki:build");
});

test("os atalhos de cada comando que a wiki cita existem de verdade", async () => {
    const { collectSiteData } = await import("../scripts/site/data-source.mjs");

    const { categories } = await collectSiteData();

    const all = new Map(categories.flatMap(category => category.commands.map(command => [command.name, command])));

    const aliases = new Set([...all.values()].flatMap(command => command.aliases));

    let checked = 0;

    // atalhos que as páginas escrevem à mão, no formato (atalho `/x`) ou (atalhos `/x` e `/y`)
    for (const page of pages) {
        for (const [, group] of page.html.matchAll(/atalhos? ((?:<code>\/[a-z]+<\/code>(?:,| e )? ?)+)/g)) {
            for (const [, alias] of group.matchAll(/<code>\/([a-z]+)<\/code>/g)) {
                assert.ok(aliases.has(alias) || all.has(alias), `${page.id}: o atalho /${alias} não existe`);

                checked++;
            }
        }
    }

    assert.ok(checked >= 10, `só ${checked} atalhos conferidos: o formato do texto mudou?`);
});

test("anterior e próxima seguem a ordem do menu; a inicial não tem nenhuma das duas", () => {
    order.forEach((slug, index) => {
        const page = byId.get(slug);

        assert.equal(page.previous?.id ?? null, index > 0 ? order[index - 1] : null, `${slug}: anterior`);
        assert.equal(page.next?.id ?? null, index < order.length - 1 ? order[index + 1] : null, `${slug}: próxima`);
    });

    const home = byId.get("index");

    assert.equal(home.previous, null);
    assert.equal(home.section, null);
});

test("tabelas largas da wiki são regiões focáveis com nome (o teclado alcança a rolagem)", () => {
    const wide = pages.flatMap(page => [...page.html.matchAll(/<div class="table-wrap"([^>]*)>/g)].map(match => [page.id, match[1]]));

    assert.ok(wide.length > 0, "há pelo menos uma tabela larga");

    for (const [id, attributes] of wide) {
        assert.match(attributes, /role="region" tabindex="0" aria-label="Tabela: [^"]+"/, id);
    }
});
