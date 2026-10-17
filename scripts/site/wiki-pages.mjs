// Monta a wiki: recebe o texto das páginas (wiki/*.md), o menu (wiki/nav.mjs)
// e os números do bot (scripts/site/wiki-values.mjs) e devolve todos os arquivos que
// vão para site/wiki/. Função pura: quem grava no disco é scripts/site/build-wiki.mjs.

import path from "node:path";

import {
    escapeHtml,
    parseFrontMatter,
    expandValues,
    renderMarkdown
} from "./wiki-markdown.mjs";

const HOME = "home";

// ==========================================
// ENDEREÇOS
// ==========================================

// Arquivo de cada página, a partir de site/wiki/: a inicial é index.html,
// as outras ficam em <seção>/<página>/index.html (endereço sem .html).
const fileOf = slug => slug === HOME ? "index.html" : `${slug}/index.html`;

// Caminho relativo de uma página (ou arquivo) para outra, dentro de site/wiki/.
function relative(fromFile, toFile) {
    const from = path.posix.dirname(fromFile);
    const to = path.posix.dirname(toFile);

    const base = path.posix.relative(from, to) || ".";

    return `${base}/`;
}

// De uma página da wiki para a raiz do site (css, js, imagens).
function siteRoot(fromFile) {
    const depth = path.posix.dirname(fromFile) === "." ? 1 : path.posix.dirname(fromFile).split("/").length + 1;

    return "../".repeat(depth);
}

// ==========================================
// MENU
// ==========================================

function flatten(nav) {
    return nav.flatMap(section => section.pages.map(page => `${section.id}/${page}`));
}

// ==========================================
// CONSTRUÇÃO
// ==========================================

export function buildWiki({ nav, sources, bot, siteHas = () => true }) {
    const slugs = [HOME, ...flatten(nav)];

    // todas as páginas do menu têm texto, e todo texto está no menu
    for (const slug of slugs) {
        if (typeof sources[slug] !== "string") {
            throw new Error(`wiki/${slug}.md não existe (está em wiki/nav.mjs).`);
        }
    }

    for (const slug of Object.keys(sources)) {
        if (!slugs.includes(slug)) {
            throw new Error(`wiki/${slug}.md existe, mas não está em wiki/nav.mjs.`);
        }
    }

    // cabeçalhos primeiro: os cartões e o menu precisam dos títulos
    const pages = new Map();

    for (const slug of slugs) {
        const { meta, body } = parseFrontMatter(sources[slug], `wiki/${slug}.md`);

        pages.set(slug, { slug, meta, body });
    }

    const sectionOf = slug => nav.find(section => slug.startsWith(`${section.id}/`));

    // links com âncora, conferidos depois que todas as páginas existirem
    const anchors = [];

    const rendered = new Map();

    for (const page of pages.values()) {
        const file = fileOf(page.slug);

        const where = `wiki/${page.slug}.md`;

        const resolveLink = target => {
            if (/^https?:\/\//.test(target) || target.startsWith("#")) {
                return target;
            }

            if (target.startsWith("wiki:")) {
                const [slug, anchor] = target.slice(5).split("#");

                if (!pages.has(slug)) {
                    throw new Error(`${where}: o link ${target} aponta para uma página que não existe.`);
                }

                if (anchor) {
                    anchors.push({ where, slug, anchor });
                }

                return relative(file, fileOf(slug)) + (anchor ? `#${anchor}` : "");
            }

            if (target.startsWith("site:")) {
                const rest = target.slice(5);

                if (!siteHas(rest)) {
                    throw new Error(`${where}: o link ${target} aponta para algo que não está em site/.`);
                }

                return `${siteRoot(file)}${rest}`;
            }

            throw new Error(`${where}: link "${target}" inválido (use wiki:, site:, https:// ou #).`);
        };

        const cards = list => {
            const items = list.map(slug => {
                const found = pages.get(slug);

                if (!found) {
                    throw new Error(`${where}: o cartão "${slug}" não é uma página.`);
                }

                return (
                    `<li><a href="${escapeHtml(relative(file, fileOf(slug)))}">` +
                    `<b>${escapeHtml(found.meta.title)}</b>` +
                    `<span>${escapeHtml(found.meta.description)}</span></a></li>`
                );
            });

            return `<ul class="cards">${items.join("")}</ul>`;
        };

        const expanded = expandValues(
            expandTables(page.body, bot.tables, where),
            bot.values,
            where
        );

        rendered.set(page.slug, renderMarkdown(expanded, { resolveLink, cards }));
    }

    for (const { where, slug, anchor } of anchors) {
        if (!rendered.get(slug).headings.some(heading => heading.id === anchor)) {
            throw new Error(`${where}: a página ${slug} não tem a seção #${anchor}.`);
        }
    }

    // ---------- arquivos ----------
    const files = new Map();

    const order = flatten(nav);

    for (const page of pages.values()) {
        const result = rendered.get(page.slug);

        const position = order.indexOf(page.slug);

        const neighbours = {
            previous: position > 0 ? pages.get(order[position - 1]) : null,
            next: position >= 0 && position < order.length - 1 ? pages.get(order[position + 1]) : null
        };

        files.set(fileOf(page.slug), renderPage({
            page,
            result,
            nav,
            pages,
            section: sectionOf(page.slug),
            neighbours
        }));
    }

    files.set("search-index.js", renderSearchIndex(pages, rendered, nav));

    return files;
}

// {{table:nome}} sozinho numa linha vira a tabela vinda do bot.
function expandTables(source, tables, file) {
    return source.replace(/^\{\{table:([A-Za-z0-9_.:-]+)\}\}\s*$/gm, (whole, name) => {
        if (typeof tables[name] !== "string") {
            throw new Error(`${file}: a tabela {{table:${name}}} não existe.`);
        }

        return tables[name];
    });
}

// ==========================================
// PÁGINA
// ==========================================

function menu(nav, pages, currentSlug, file) {
    const home = `<a class="side-home" href="${relative(file, fileOf(HOME))}"${currentSlug === HOME ? ' aria-current="page"' : ""}>Início da wiki</a>`;

    const sections = nav.map(section => {
        const links = section.pages.map(page => {
            const slug = `${section.id}/${page}`;

            const current = slug === currentSlug ? ' aria-current="page"' : "";

            return `<li><a href="${relative(file, fileOf(slug))}"${current}>${escapeHtml(pages.get(slug).meta.title)}</a></li>`;
        }).join("");

        return `<section><h2>${escapeHtml(section.title)}</h2><ul>${links}</ul></section>`;
    }).join("");

    return `${home}${sections}`;
}

function tocOf(headings) {
    if (headings.length < 2) {
        return "";
    }

    const items = headings.map(heading =>
        `<li class="l${heading.level}"><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`
    ).join("");

    return `<nav class="wiki-toc" aria-label="Nesta página"><h2>Nesta página</h2><ol>${items}</ol></nav>`;
}

function renderPage({ page, result, nav, pages, section, neighbours }) {
    const file = fileOf(page.slug);

    const root = siteRoot(file);

    const isHome = page.slug === HOME;

    const title = isHome ? "Wiki da Helena" : `${page.meta.title} | Wiki da Helena`;

    const crumbs = isHome
        ? ""
        : `<nav class="crumbs" aria-label="Você está em"><a href="${relative(file, fileOf(HOME))}">Wiki</a><span>${escapeHtml(section.title)}</span></nav>`;

    const step = (neighbour, label) => neighbour
        ? `<a class="${label === "Anterior" ? "prev" : "next"}" href="${relative(file, fileOf(neighbour.slug))}"><small>${label}</small><b>${escapeHtml(neighbour.meta.title)}</b></a>`
        : "<span></span>";

    const pager = isHome
        ? ""
        : `<nav class="pager" aria-label="Outras páginas">${step(neighbours.previous, "Anterior")}${step(neighbours.next, "Próxima")}</nav>`;

    return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(page.meta.description)}">
<meta name="theme-color" content="#0d0613">
<link rel="icon" href="${root}assets/img/favicon.png">
<link rel="apple-touch-icon" href="${root}assets/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Shippori+Mincho:wght@500;700;800&display=swap">
<link rel="stylesheet" href="${root}css/tokens.css">
<link rel="stylesheet" href="${root}css/base.css">
<link rel="stylesheet" href="${root}css/components.css">
<link rel="stylesheet" href="${root}css/wiki.css">
<script defer src="${root}js/config.js"></script>
<script defer src="${root}js/util.js"></script>
<script defer src="${root}js/nav.js"></script>
<script defer src="${relative(file, fileOf(HOME))}search-index.js"></script>
<script defer src="${root}js/wiki.js"></script>
</head>
<body class="wiki-page" data-wiki-root="${relative(file, fileOf(HOME))}">
<a class="skip" href="#content">Pular para o conteúdo</a>

<header class="top" id="top-bar">
  <div class="wrap">
    <a class="brand" href="${root}" aria-label="Helena, voltar ao site">
      <img src="${root}assets/img/helena-avatar.webp" alt="" width="36" height="36">
      <b>Helena</b><small>ヘレナ</small>
    </a>
    <span class="wiki-tag">Wiki</span>
    <div class="actions">
      <button class="btn wiki-menu-btn" id="wiki-menu-btn" type="button" aria-expanded="false" aria-controls="wiki-side" hidden>Menu</button>
      <a class="btn wiki-back" href="${root}"><span class="long">Voltar ao site</span><span class="short" aria-hidden="true">← Site</span><span class="sr short-name">Voltar ao site</span></a>
    </div>
  </div>
</header>

<div class="wiki">

  <aside class="wiki-side" id="wiki-side" aria-label="Menu da wiki">
    <a class="side-back" href="${root}">← Voltar ao site</a>
    <form class="wiki-search" id="wiki-search-box" role="search" hidden>
      <label class="sr" for="wiki-search">Buscar na wiki</label>
      <input id="wiki-search" type="search" placeholder="Buscar na wiki" autocomplete="off">
      <ul id="wiki-results" hidden></ul>
    </form>
    <nav class="wiki-nav" aria-label="Seções da wiki">
      ${menu(nav, pages, page.slug, file)}
    </nav>
  </aside>

  <main class="wiki-main" id="content">
    ${crumbs}
    <article class="wiki-doc">
      <header>
        <h1>${escapeHtml(page.meta.title)}</h1>
        <p class="lede">${escapeHtml(page.meta.description)}</p>
      </header>
      ${result.html}
    </article>
    ${pager}
  </main>

  ${tocOf(result.headings)}

</div>

<footer class="wiki-foot">
  <div class="wrap">
    <ul>
      <li><a href="${root}">Site</a></li>
      <li><a href="${root}terms/">Termos de uso</a></li>
      <li><a href="${root}privacy/">Privacidade</a></li>
      <li><a href="https://vsync.lat/tfe6pdxk" data-link="support" target="_blank" rel="noopener">Servidor oficial</a></li>
    </ul>
    <p>A Helena é um projeto independente feito para a VSync. Os valores desta wiki saem do próprio bot quando ela é gerada.</p>
  </div>
</footer>

</body>
</html>
`;
}

// ==========================================
// BUSCA
// ==========================================

// Índice carregado pela busca: título, seção, endereço (a partir da raiz da
// wiki) e o texto da página.
function renderSearchIndex(pages, rendered, nav) {
    const entries = [...pages.values()].map(page => {
        const section = nav.find(item => page.slug.startsWith(`${item.id}/`));

        return {
            t: page.meta.title,
            s: section ? section.title : "Wiki",
            u: page.slug === HOME ? "" : `${page.slug}/`,
            d: page.meta.description,
            x: rendered.get(page.slug).text
        };
    });

    return (
        "// Gerado por `npm run wiki:build`. Não edite à mão.\n" +
        "window.Helena = window.Helena || {};\n" +
        "window.Helena.wikiIndex = " + JSON.stringify(entries) + ";\n"
    );
}
