import "./helpers.mjs";

import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const {
    renderMarkdown, parseFrontMatter, expandValues, slugify, escapeHtml
} = await import("../site/wiki-markdown.mjs");

const { reais, percent, duration, range, table } = await import("../site/wiki-values.mjs");
const { generateWiki } = await import("../site/wiki-generate.mjs");
const { NAV } = await import("../wiki/nav.mjs");

const SITE = fileURLToPath(new URL("../site/", import.meta.url));
const WIKI_OUT = path.join(SITE, "wiki");
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

    assert.match(wide, /<div class="table-wrap"><table>/);
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

const files = await generateWiki();

const pages = [...files.keys()].filter(file => file.endsWith(".html"));

const diskFiles = dir => readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.relative(dir, path.join(entry.parentPath, entry.name)).replace(/\\/g, "/"));

test("site/wiki está em dia com wiki/*.md e com o bot (rode npm run wiki:build se falhar)", () => {
    assert.deepEqual(diskFiles(WIKI_OUT).sort(), [...files.keys()].sort(), "sobrou ou faltou arquivo em site/wiki");

    for (const [file, content] of files) {
        assert.equal(
            readFileSync(path.join(WIKI_OUT, file), "utf8").replace(/\r\n/g, "\n"),
            content.replace(/\r\n/g, "\n"),
            `site/wiki/${file} está desatualizado`
        );
    }
});

test("o menu, os arquivos de wiki/ e as páginas geradas contam a mesma história", () => {
    const expected = ["index.html", ...NAV.flatMap(section => section.pages.map(page => `${section.id}/${page}/index.html`))];

    assert.deepEqual(pages.sort(), expected.sort());

    const sources = diskFiles(WIKI_SRC).filter(file => file.endsWith(".md")).map(file => file.replace(/\.md$/, ""));

    assert.deepEqual(
        sources.sort(),
        ["index", ...NAV.flatMap(section => section.pages.map(page => `${section.id}/${page}`))].sort()
    );

    // slugs em inglês, em kebab-case (veja a memória "nomes em inglês")
    for (const section of NAV) {
        assert.match(section.id, /^[a-z]+(-[a-z]+)*$/);

        for (const page of section.pages) {
            assert.match(page, /^[a-z]+(-[a-z]+)*$/, `${section.id}/${page}`);
        }
    }
});

test("cada página tem um título, uma descrição, um único h1 e ids sem repetição", () => {
    for (const file of pages) {
        const html = files.get(file);

        assert.match(html, /<html lang="pt-BR">/, file);
        assert.match(html, /<title>[^<]+<\/title>/, file);
        assert.match(html, /<meta name="description" content="[^"]+">/, file);
        assert.equal((html.match(/<h1>/g) ?? []).length, 1, `${file}: um h1`);

        const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(match => match[1]);

        assert.equal(new Set(ids).size, ids.length, `${file}: id repetido`);
    }
});

test("nada de {{...}} sobrando, e nenhum HTML escrito à mão passa pelo conversor", () => {
    for (const file of pages) {
        const html = files.get(file);

        assert.doesNotMatch(html, /\{\{|\}\}/, `${file}: marcador não resolvido`);
    }

    for (const source of diskFiles(WIKI_SRC).filter(file => file.endsWith(".md"))) {
        const text = readFileSync(path.join(WIKI_SRC, source), "utf8");

        assert.doesNotMatch(text, /<\/?(?:script|iframe|style|div|span|a)\b/i, `wiki/${source}: HTML solto`);
    }
});

test("todo link e arquivo carregado pelas páginas existe, e as âncoras também", () => {
    const exists = absolute => {
        const relative = path.relative(WIKI_OUT, absolute).replace(/\\/g, "/");

        if (!relative.startsWith("..")) {
            return files.has(relative) || files.has(`${relative}/index.html`.replace(/^\/|\/\/+/g, ""));
        }

        return existsSync(absolute) && (!statSync(absolute).isDirectory() || existsSync(path.join(absolute, "index.html")));
    };

    for (const file of pages) {
        const html = files.get(file);
        const dir = path.join(WIKI_OUT, path.dirname(file));

        const own = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(match => match[1]));

        for (const [, ref] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
            if (/^(https?:|mailto:|data:)/.test(ref)) continue;

            if (ref.startsWith("#")) {
                assert.ok(own.has(ref.slice(1)), `${file}: âncora ${ref} não existe na página`);

                continue;
            }

            const target = path.resolve(dir, ref.replace(/[?#].*$/, ""));

            assert.ok(exists(target), `${file} aponta para ${ref}, que não existe`);
        }
    }
});

test("todo comando público do bot é citado em alguma página, fora da lista geral", async () => {
    const { collectSiteData } = await import("../site/data-source.mjs");

    const { categories } = await collectSiteData();

    const names = categories.flatMap(category => category.commands.map(command => command.name));

    assert.ok(names.length > 40);

    // o texto de todas as páginas, menos a lista gerada de comandos (que cita todos por construção)
    const prose = [...files]
        .filter(([file]) => file.endsWith(".html") && file !== "help/commands/index.html")
        .map(([, html]) => html.replace(/<[^>]+>/g, " "))
        .join("\n");

    const missing = names.filter(name => !new RegExp(`/${name}(?![a-z])`).test(prose));

    assert.deepEqual(missing, [], "comando novo sem página na wiki: escreva sobre ele em wiki/ e rode npm run wiki:build");
});

test("os atalhos de cada comando que a wiki cita existem de verdade", async () => {
    const { collectSiteData } = await import("../site/data-source.mjs");

    const { categories } = await collectSiteData();

    const all = new Map(categories.flatMap(category => category.commands.map(command => [command.name, command])));

    const aliases = new Set([...all.values()].flatMap(command => command.aliases));

    let checked = 0;

    // atalhos que as páginas escrevem à mão, no formato (atalho `/x`) ou (atalhos `/x` e `/y`)
    for (const [file, html] of files) {
        for (const [, group] of html.matchAll(/atalhos? ((?:<code>\/[a-z]+<\/code>(?:,| e )? ?)+)/g)) {
            for (const [, alias] of group.matchAll(/<code>\/([a-z]+)<\/code>/g)) {
                assert.ok(aliases.has(alias) || all.has(alias), `${file}: o atalho /${alias} não existe`);

                checked++;
            }
        }
    }

    assert.ok(checked >= 10, `só ${checked} atalhos conferidos: o formato do texto mudou?`);
});

test("o menu lateral lista todas as páginas, na ordem, com a atual marcada", () => {
    const expected = NAV.flatMap(section => section.pages.map(page => `${section.id}/${page}`));

    for (const file of pages) {
        const html = files.get(file);

        const menu = html.match(/<nav class="wiki-nav"[\s\S]*?<\/nav>/)[0];

        assert.equal((menu.match(/<li>/g) ?? []).length, expected.length, `${file}: uma linha por página`);

        const current = [...menu.matchAll(/aria-current="page"/g)].length;

        assert.equal(current, 1, `${file}: exatamente uma página marcada`);
    }
});

test("anterior e próxima seguem a ordem do menu", () => {
    const order = NAV.flatMap(section => section.pages.map(page => `${section.id}/${page}`));

    order.forEach((slug, index) => {
        const html = files.get(`${slug}/index.html`);

        const pager = html.match(/<nav class="pager"[\s\S]*?<\/nav>/)[0];

        assert.equal(pager.includes('class="prev"'), index > 0, `${slug}: anterior`);
        assert.equal(pager.includes('class="next"'), index < order.length - 1, `${slug}: próxima`);
    });

    assert.doesNotMatch(files.get("index.html"), /class="pager"/, "o início não tem anterior nem próxima");
});

test("as páginas usam os estilos e scripts da wiki, e o índice da busca abre", () => {
    for (const file of pages) {
        const html = files.get(file);

        assert.match(html, /css\/wiki\.css/);
        assert.match(html, /js\/wiki\.js/);
        assert.match(html, /search-index\.js/);
    }

    const index = files.get("search-index.js");

    const sandbox = { window: {} };

    vm.runInNewContext(index, sandbox);

    const entries = sandbox.window.Helena.wikiIndex;

    assert.equal(entries.length, pages.length);

    for (const entry of entries) {
        assert.ok(entry.t && entry.s && entry.d && entry.x.length > 40, `entrada de busca ${entry.t}`);
        assert.ok(entry.u === "" || /^[a-z-]+\/[a-z-]+\/$/.test(entry.u), `endereço ${entry.u}`);
    }
});

// ==========================================
// A BUSCA (site/js/wiki.js)
// ==========================================

// Um DOM de mentira, só com o que o script usa.
function fakeDom() {
    const make = tag => {
        const node = {
            tag, children: [], attrs: {}, listeners: {}, hidden: false, textContent: "", value: "",
            classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
            setAttribute(name, value) { node.attrs[name] = value; },
            getAttribute(name) { return node.attrs[name] ?? null; },
            appendChild(child) { node.children.push(child); return child; },
            addEventListener(type, fn) { (node.listeners[type] ??= []).push(fn); },
            contains: () => false,
            closest: () => null,
            focus() {}
        };

        Object.defineProperty(node, "textContent", {
            get() { return node._text ?? ""; },
            set(value) { node._text = value; if (value === "") node.children = []; }
        });

        return node;
    };

    const nodes = {
        "#wiki-search-box": make("form"),
        "#wiki-search": make("input"),
        "#wiki-results": make("ul")
    };

    nodes["#wiki-search-box"].hidden = true;
    nodes["#wiki-results"].hidden = true;

    const document = {
        documentElement: { classList: { add() {} } },
        body: { getAttribute: () => "../../" },
        createElement: make,
        getElementById: () => null,
        querySelector: selector => nodes[selector] ?? null,
        querySelectorAll: () => [],
        addEventListener() {}
    };

    return { document, nodes };
}

function loadSearch() {
    const { document, nodes } = fakeDom();

    const window = { Helena: {}, location: { href: "" }, addEventListener() {} };

    const context = { window, document, IntersectionObserver: undefined };

    vm.runInNewContext(readFileSync(path.join(SITE, "js/config.js"), "utf8"), context);
    vm.runInNewContext(readFileSync(path.join(SITE, "js/util.js"), "utf8").replace("window.matchMedia(\"(prefers-reduced-motion: reduce)\").matches", "false").replace("window.matchMedia(\"(pointer: fine)\").matches", "false"), context);

    vm.runInNewContext(files.get("search-index.js"), context);
    vm.runInNewContext(readFileSync(path.join(SITE, "js/wiki.js"), "utf8"), context);

    const type = value => {
        nodes["#wiki-search"].value = value;

        for (const listener of nodes["#wiki-search"].listeners.input ?? []) listener();
    };

    const results = () => nodes["#wiki-results"].children.map(item => {
        const link = item.children[0];

        return link?.attrs?.href ?? item._text;
    });

    return { nodes, type, results };
}

test("a busca aparece só com JavaScript, acha a página pelo título e pelo texto, sem acento", () => {
    const { nodes, type, results } = loadSearch();

    assert.equal(nodes["#wiki-search-box"].hidden, false, "o campo de busca é mostrado pelo script");

    type("bolsa");
    assert.equal(nodes["#wiki-results"].hidden, false);
    assert.equal(results()[0], "../../economy/market/", "o título da página vem primeiro, com o caminho a partir da raiz da wiki");

    type("EMPREGO magnata");
    assert.ok(results().includes("../../start/jobs/"), "vários termos: todos precisam estar na página");

    type("indice");
    assert.ok(results().includes("../../economy/market/"), "acha 'índice' sem o acento");

    type("zzzzz");
    assert.deepEqual(results(), ["Nada encontrado para “zzzzz”."]);

    type("a");
    assert.deepEqual(results(), ["Nada encontrado para “a”."], "um termo de uma letra só não conta (2 ou mais)");

    type("");
    assert.equal(nodes["#wiki-results"].hidden, true);
});
