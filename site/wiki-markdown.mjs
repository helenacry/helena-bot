// Conversor de Markdown da wiki. Aceita só o que as páginas de wiki/ usam:
// títulos (## e ###), parágrafos, listas, tabelas, código, avisos (> [!TIP]),
// regras (---), links e a lista de cartões ({{cards: ...}}). Todo texto é
// escapado; o que não é reconhecido vira erro, não HTML solto.
//
// É uma função pura: recebe o texto e devolve o HTML, os títulos (para o
// sumário lateral) e o texto limpo (para a busca).

export function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// "Fuga da prisão!" -> "fuga-da-prisao"
export function slugify(text) {
    return String(text)
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

// ==========================================
// CABEÇALHO DA PÁGINA (front matter)
// ==========================================

// ---
// title: Primeiros passos
// description: Do convite ao primeiro daily.
// ---
export function parseFrontMatter(source, file = "página") {
    const text = String(source).replace(/\r\n/g, "\n");

    const match = text.match(/^---\n([\s\S]*?)\n---\n?/);

    if (!match) {
        throw new Error(`${file}: faltou o cabeçalho (--- title ---) no começo.`);
    }

    const meta = {};

    for (const line of match[1].split("\n")) {
        if (!line.trim()) {
            continue;
        }

        const pair = line.match(/^([a-z]+):\s*(.+)$/);

        if (!pair) {
            throw new Error(`${file}: linha inválida no cabeçalho: "${line}"`);
        }

        meta[pair[1]] = pair[2].trim();
    }

    for (const key of ["title", "description"]) {
        if (!meta[key]) {
            throw new Error(`${file}: o cabeçalho precisa de "${key}".`);
        }
    }

    return { meta, body: text.slice(match[0].length) };
}

// ==========================================
// VALORES DO BOT ({{v:caminho}})
// ==========================================

// Troca {{v:crime.energyCost}} pelo valor que vem do código do bot.
export function expandValues(source, values, file = "página") {
    return String(source).replace(/\{\{v:([A-Za-z0-9_.-]+)\}\}/g, (whole, path) => {
        const value = path.split(".").reduce(
            (node, key) => (node && typeof node === "object" ? node[key] : undefined),
            values
        );

        if (typeof value !== "string" && typeof value !== "number") {
            throw new Error(`${file}: o valor {{v:${path}}} não existe.`);
        }

        return String(value);
    });
}

// ==========================================
// TEXTO CORRIDO
// ==========================================

const CALLOUTS = Object.freeze({
    NOTE: ["note", "Nota"],
    TIP: ["tip", "Dica"],
    WARNING: ["warning", "Atenção"],
    MONEY: ["money", "Dinheiro"],
    EXAMPLE: ["example", "Exemplo"]
});

function inline(text, ctx) {
    const codes = [];

    // o que está entre crases não recebe mais nenhuma regra
    let out = text.replace(/`([^`]+)`/g, (whole, code) => {
        codes.push(`<code>${escapeHtml(code)}</code>`);

        return `\u0000${codes.length - 1}\u0000`;
    });

    out = escapeHtml(out);

    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, target) => {
        const link = ctx.resolveLink(target.replace(/&amp;/g, "&"));

        const external = /^https?:/.test(link);

        return `<a href="${escapeHtml(link)}"${external ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`;
    });

    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, "$1<em>$2</em>");

    return out.replace(/\u0000(\d+)\u0000/g, (whole, index) => codes[Number(index)]);
}

// ==========================================
// BLOCOS
// ==========================================

const isBlank = line => !line.trim();
const isFence = line => /^```/.test(line);
const isHeading = line => /^#{1,6}\s/.test(line);
const isRule = line => /^---+\s*$/.test(line);
const isQuote = line => /^>/.test(line);
const isTableRow = line => /^\|.*\|\s*$/.test(line);
const isCards = line => /^\{\{cards:/.test(line);
const listMarker = line => line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);

const startsBlock = line =>
    isFence(line) || isHeading(line) || isRule(line) || isQuote(line) ||
    isTableRow(line) || isCards(line) || Boolean(listMarker(line));

function splitRow(line) {
    return line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split(/(?<!\\)\|/)
        .map(cell => cell.trim().replace(/\\\|/g, "|"));
}

// Tabelas de até 3 colunas empilham no celular (cada célula leva o nome da
// sua coluna em data-label); as largas rolam de lado.
const STACK_UP_TO = 3;

function renderTable(rows, ctx) {
    const [head, , ...body] = rows.map(splitRow);

    const labels = head.map(text => text.replace(/`/g, ""));

    const cell = (tag, text, label) =>
        `<${tag}${label ? ` data-label="${escapeHtml(label)}"` : ""}>${inline(text, ctx)}</${tag}>`;

    const stack = head.length <= STACK_UP_TO;

    return (
        `<div class="table-wrap${stack ? " stack" : ""}"><table>` +
        `<thead><tr>${head.map(text => cell("th", text)).join("")}</tr></thead>` +
        `<tbody>${body.map(row =>
            `<tr>${row.map((text, column) => cell("td", text, column > 0 ? labels[column] : null)).join("")}</tr>`
        ).join("")}</tbody>` +
        "</table></div>"
    );
}

// Lista com aninhamento por recuo (2 espaços por nível).
function renderList(lines, start, ctx) {
    const first = listMarker(lines[start]);

    const indent = first[1].length;
    const ordered = /\d/.test(first[2]);

    let html = "";
    let index = start;

    while (index < lines.length) {
        const marker = listMarker(lines[index]);

        if (!marker || marker[1].length < indent) {
            break;
        }

        if (marker[1].length > indent) {
            // sublista dentro do item anterior
            const nested = renderList(lines, index, ctx);

            html = html.replace(/<\/li>$/, `${nested.html}</li>`);
            index = nested.next;

            continue;
        }

        html += `<li>${inline(marker[3], ctx)}</li>`;
        index++;
    }

    const tag = ordered ? "ol" : "ul";

    return { html: `<${tag}>${html}</${tag}>`, next: index };
}

function renderCallout(lines, ctx) {
    const inner = lines.map(line => line.replace(/^>\s?/, ""));

    const head = inner[0].match(/^\[!([A-Z]+)\]\s*(.*)$/);

    if (!head || !CALLOUTS[head[1]]) {
        throw new Error(
            `Citação sem tipo conhecido. Comece com > [!${Object.keys(CALLOUTS).join("|")}]: "${inner[0]}"`
        );
    }

    const [kind, title] = CALLOUTS[head[1]];

    const rest = [head[2], ...inner.slice(1)].filter((line, i) => i > 0 || line);

    const body = renderBlocks(rest, ctx).html;

    return `<aside class="callout ${kind}"><p class="callout-title">${title}</p>${body}</aside>`;
}

function renderBlocks(lines, ctx) {
    const headings = ctx.headings;

    let html = "";
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];

        if (isBlank(line)) {
            index++;

            continue;
        }

        if (isFence(line)) {
            const language = line.slice(3).trim();
            const code = [];

            index++;

            while (index < lines.length && !isFence(lines[index])) {
                code.push(lines[index++]);
            }

            if (index >= lines.length) {
                throw new Error("Bloco de código sem o fechamento ```.");
            }

            index++;

            html += `<pre><code${language ? ` class="language-${escapeHtml(language)}"` : ""}>${escapeHtml(code.join("\n"))}</code></pre>`;

            continue;
        }

        if (isHeading(line)) {
            const match = line.match(/^(#{2,3})\s+(.+?)\s*$/);

            if (!match) {
                throw new Error(`Título inválido (use ## ou ###; o # vem do cabeçalho): "${line}"`);
            }

            const level = match[1].length;
            const text = match[2];

            let id = slugify(text);
            let suffix = 2;

            while (ctx.ids.has(id)) {
                id = `${slugify(text)}-${suffix++}`;
            }

            ctx.ids.add(id);

            headings.push({ level, id, text: text.replace(/`/g, "") });

            html += `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-label="Link para esta seção">#</a>${inline(text, ctx)}</h${level}>`;
            index++;

            continue;
        }

        if (isRule(line)) {
            html += "<hr>";
            index++;

            continue;
        }

        if (isCards(line)) {
            const list = line.match(/^\{\{cards:\s*(.+?)\s*\}\}$/);

            if (!list) {
                throw new Error(`Cartões inválidos: "${line}"`);
            }

            html += ctx.cards(list[1].split(",").map(slug => slug.trim()));
            index++;

            continue;
        }

        if (isTableRow(line)) {
            const rows = [];

            while (index < lines.length && isTableRow(lines[index])) {
                rows.push(lines[index++]);
            }

            if (rows.length < 3 || !/^\|[\s:|-]+\|$/.test(rows[1].trim())) {
                throw new Error(`Tabela sem a linha de separação |---|: "${rows[0]}"`);
            }

            const width = splitRow(rows[0]).length;

            for (const row of rows) {
                if (splitRow(row).length !== width) {
                    throw new Error(`Linha da tabela com colunas a mais ou a menos: "${row}"`);
                }
            }

            html += renderTable(rows, ctx);

            continue;
        }

        if (isQuote(line)) {
            const quote = [];

            while (index < lines.length && isQuote(lines[index])) {
                quote.push(lines[index++]);
            }

            html += renderCallout(quote, ctx);

            continue;
        }

        if (listMarker(line)) {
            const list = renderList(lines, index, ctx);

            html += list.html;
            index = list.next;

            continue;
        }

        const paragraph = [];

        while (index < lines.length && !isBlank(lines[index]) && (paragraph.length === 0 || !startsBlock(lines[index]))) {
            paragraph.push(lines[index++].trim());
        }

        html += `<p>${inline(paragraph.join(" "), ctx)}</p>`;
    }

    return { html };
}

// ==========================================
// CONVERSÃO
// ==========================================

// ctx.resolveLink(destino) -> endereço final (e erro se o destino não existe)
// ctx.cards(lista de páginas) -> HTML dos cartões
export function renderMarkdown(source, { resolveLink, cards }) {
    const ctx = {
        resolveLink,
        cards,
        headings: [],
        ids: new Set()
    };

    const lines = String(source).replace(/\r\n/g, "\n").split("\n");

    const { html } = renderBlocks(lines, ctx);

    return {
        html,
        headings: ctx.headings,
        text: plainText(html)
    };
}

// Texto sem marcação, para a busca da wiki.
export function plainText(html) {
    return html
        .replace(/<a class="anchor"[^>]*>#<\/a>/g, "")
        .replace(/<\/(p|li|h2|h3|tr|aside|pre)>/g, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
}
