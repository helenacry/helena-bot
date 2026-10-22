// Monta a wiki: recebe o texto das páginas (wiki/*.md), o menu (wiki/nav.mjs)
// e os números do bot (scripts/site/wiki-values.mjs) e devolve uma lista de
// páginas já convertidas (HTML do corpo, sumário, texto para a busca, vizinhas).
// Quem desenha a página é o site (site/src/pages/wiki/); aqui só entra o conteúdo.
// Função pura: quem grava no disco é scripts/site/build-wiki.mjs.
//
// Links no HTML saem como caminhos a partir da raiz do site, sem o subcaminho do
// GitHub Pages ("/wiki/economy/market/", "/terms/"); o site põe o prefixo na hora de
// desenhar (site/src/lib/url.ts, withBase).

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

// Endereço de uma página da wiki, a partir da raiz do site.
export const pathOf = slug => slug === HOME ? "/wiki/" : `/wiki/${slug}/`;

// Páginas do site (fora da wiki) que um texto pode citar com [texto](site:terms/).
export const SITE_PAGES = Object.freeze(["", "terms/", "privacy/", "account/"]);

// ==========================================
// MENU
// ==========================================

function flatten(nav) {
    return nav.flatMap(section => section.pages.map(page => `${section.id}/${page}`));
}

// ==========================================
// CONSTRUÇÃO
// ==========================================

export function buildWiki({ nav, sources, bot, siteHas = target => SITE_PAGES.includes(target.replace(/[?#].*$/, "")) }) {
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

    const sectionOf = slug => nav.find(section => slug.startsWith(`${section.id}/`)) ?? null;

    // links com âncora, conferidos depois que todas as páginas existirem
    const anchors = [];

    const rendered = new Map();

    for (const page of pages.values()) {
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

                return pathOf(slug) + (anchor ? `#${anchor}` : "");
            }

            if (target.startsWith("site:")) {
                const rest = target.slice(5);

                if (!siteHas(rest)) {
                    throw new Error(`${where}: o link ${target} aponta para algo que não está no site.`);
                }

                return `/${rest}`;
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
                    `<li><a href="${escapeHtml(pathOf(slug))}">` +
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

    // ---------- registros ----------
    const order = flatten(nav);

    const brief = slug => {
        const found = pages.get(slug);

        return found ? { id: slug, path: pathOf(slug), title: found.meta.title } : null;
    };

    return [...pages.values()].map(page => {
        const result = rendered.get(page.slug);
        const position = order.indexOf(page.slug);
        const section = sectionOf(page.slug);

        return {
            id: page.slug === HOME ? "index" : page.slug,
            path: pathOf(page.slug),
            title: page.meta.title,
            description: page.meta.description,
            section: section ? { id: section.id, title: section.title } : null,
            html: result.html,
            headings: result.headings,
            previous: position > 0 ? brief(order[position - 1]) : null,
            next: position >= 0 && position < order.length - 1 ? brief(order[position + 1]) : null
        };
    });
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
