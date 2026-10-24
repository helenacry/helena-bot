// Desenha uma mensagem do bot (embed, botões e o layout V2) como HTML parecido com o chat da
// Discord, para conferir o visual das respostas sem abrir o app. É só uma aproximação: a fonte
// e as medidas são as de um chat escuro qualquer, o que vale é a estrutura e o texto.
// Usado por scripts/dev/preview-replies.mjs.

const escape = text => String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// ------------------------------------------------------------ markdown do Discord
// Negrito, itálico, sublinhado, tachado, spoiler, código, bloco de código, títulos (# a ###),
// texto pequeno (-#), citação, listas, links, menções e emojis personalizados.
function inline(source, keep) {
    let html = source;

    // tokens de menção e de emoji personalizado (antes de escapar o < e o >)
    html = html.replace(/<(a?):([A-Za-z0-9_]+):\d+>/g, (_all, _a, name) => keep(`<span class="emoji">:${escape(name)}:</span>`));
    html = html.replace(/<@&?[0-9A-Za-z-]+>/g, () => keep('<span class="mention">@alguém</span>'));
    html = html.replace(/<#[0-9A-Za-z-]+>/g, () => keep('<span class="mention">#canal</span>'));

    html = escape(html);

    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_all, label, url) => keep(`<a href="${url}">${label}</a>`));
    html = html.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_all, lead, url) => `${lead}${keep(`<a href="${url}">${url}</a>`)}`);
    html = html.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    html = html.replace(/__([^_]+)__/g, "<u>$1</u>");
    html = html.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>");
    html = html.replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g, "$1<i>$2</i>");
    html = html.replace(/~~([^~]+)~~/g, "<s>$1</s>");
    html = html.replace(/\|\|([^|]+)\|\|/g, '<span class="spoiler">$1</span>');

    return html;
}

export function markdown(source) {
    const stash = [];
    const keep = html => {
        stash.push(html);

        return `\u0000${stash.length - 1}\u0000`;
    };

    let text = String(source ?? "").replace(/\r\n/g, "\n");

    // blocos de código
    text = text.replace(/```[a-z]*\n?([\s\S]*?)```/g, (_all, code) => keep(`<pre>${escape(code.replace(/\n$/, ""))}</pre>`));

    // código em linha
    text = text.replace(/`([^`\n]+)`/g, (_all, code) => keep(`<code>${escape(code)}</code>`));

    const out = [];
    let quote = [];
    let list = [];

    const flush = () => {
        if (quote.length) out.push(`<blockquote>${quote.join("<br>")}</blockquote>`);
        if (list.length) out.push(`<ul>${list.map(item => `<li>${item}</li>`).join("")}</ul>`);

        quote = [];
        list = [];
    };

    for (const line of text.split("\n")) {
        let match;

        if ((match = /^> ?(.*)$/.exec(line))) {
            if (list.length) flush();

            quote.push(inline(match[1], keep));
            continue;
        }

        if ((match = /^- (?!#)(.*)$/.exec(line))) {
            if (quote.length) flush();

            list.push(inline(match[1], keep));
            continue;
        }

        flush();

        if ((match = /^(#{1,3}) (.*)$/.exec(line))) {
            out.push(`<h${match[1].length} class="md">${inline(match[2], keep)}</h${match[1].length}>`);

        } else if ((match = /^-# (.*)$/.exec(line))) {
            out.push(`<div class="sub">${inline(match[1], keep)}</div>`);

        } else if (line.trim() === "") {
            out.push('<div class="gap"></div>');

        } else {
            out.push(`<div>${inline(line, keep)}</div>`);
        }
    }

    flush();

    return out.join("").replace(/\u0000(\d+)\u0000/g, (_all, index) => stash[Number(index)]);
}

// ------------------------------------------------------------ imagens
// As imagens do bot ficam no site (GitHub Pages) e ainda podem nem ter sido publicadas: na prévia
// elas saem direto da pasta do projeto.
let localImages = { from: "", to: "" };

export function useLocalImages(from, to) {
    localImages = { from, to };
}

const image = url => (localImages.from && String(url).startsWith(localImages.from)
    ? localImages.to + String(url).slice(localImages.from.length)
    : url);

// ------------------------------------------------------------ componentes
function control(component) {
    if (component.type === "button") {
        const style = component.url ? "link" : component.style ?? "secondary";

        return `<span class="btn ${style}">${component.emoji ? `${escape(component.emoji)} ` : ""}${escape(component.label ?? "")}</span>`;
    }

    if (component.type === "select") {
        return `<span class="select">${escape(component.placeholder ?? "Escolha uma opção")} <small>▾ ${(component.options ?? []).length} opções</small></span>`;
    }

    return "";
}

function rows(components) {
    return (components ?? [])
        .filter(item => item?.type === "row")
        .map(item => `<div class="row">${(item.components ?? []).map(control).join("")}</div>`)
        .join("");
}

// ------------------------------------------------------------ embed clássico
function embedHtml(embed) {
    const color = typeof embed.color === "number" ? "#" + embed.color.toString(16).padStart(6, "0") : embed.color ?? "#555";

    const fields = (embed.fields ?? []).map(field => `
      <div class="field${field.inline ? " inline" : ""}">
        <div class="fname">${markdown(field.name).replace(/<div>|<\/div>/g, "")}</div>
        <div class="fvalue">${markdown(field.value)}</div>
      </div>`).join("");

    const author = embed.author?.name
        ? `<div class="author">${embed.author.iconUrl ? `<img src="${image(embed.author.iconUrl)}">` : ""}<span>${escape(embed.author.name)}</span></div>`
        : "";

    const footer = embed.footer?.text || embed.timestamp
        ? `<div class="footer">${embed.footer?.iconUrl ? `<img src="${image(embed.footer.iconUrl)}">` : ""}<span>${escape(embed.footer?.text ?? "")}${embed.timestamp ? `${embed.footer?.text ? " • " : ""}hoje às 12:00` : ""}</span></div>`
        : "";

    return `
    <div class="embed" style="--bar:${color}">
      <div class="embed-main">
        ${author}
        ${embed.title ? `<div class="title">${escape(embed.title)}</div>` : ""}
        ${embed.description ? `<div class="desc">${markdown(embed.description)}</div>` : ""}
        ${fields ? `<div class="fields">${fields}</div>` : ""}
        ${embed.image?.url ? `<img class="big" src="${image(embed.image.url)}">` : ""}
        ${footer}
      </div>
      ${embed.thumbnail?.url ? `<img class="thumb" src="${image(embed.thumbnail.url)}">` : ""}
    </div>`;
}

// ------------------------------------------------------------ layout V2
function v2Block(block) {
    switch (block.type) {
        case "text":
            return `<div class="v2text">${markdown(block.content)}</div>`;

        case "separator":
            return block.divider === false ? '<div class="v2gap"></div>' : '<hr class="v2sep">';

        case "section": {
            const texts = (block.texts ?? []).map(item => `<div class="v2text">${markdown(typeof item === "string" ? item : item.content)}</div>`).join("");
            const accessory = block.accessory?.type === "thumbnail"
                ? `<img class="thumb" src="${image(block.accessory.url)}">`
                : control(block.accessory ?? {});

            return `<div class="v2section"><div>${texts}</div><div>${accessory}</div></div>`;
        }

        case "container":
            return `<div class="v2container" style="--bar:${block.accentColor ?? "#555"}">${(block.components ?? []).map(v2Block).join("")}</div>`;

        case "row":
            return `<div class="row">${(block.components ?? []).map(control).join("")}</div>`;

        default:
            return "";
    }
}

// ------------------------------------------------------------ mensagem
// "payload" é o que o bot envia: { body, embeds, components } (clássico) ou só components com layout (V2).
export function messageHtml(payload, { name = "Helena", avatar = "" } = {}) {
    const v2 = (payload.components ?? []).some(item => item?.type === "container" || item?.type === "text" || item?.type === "section");

    const content = v2
        ? (payload.components ?? []).map(v2Block).join("")
        : `${payload.body ? `<div class="body">${markdown(payload.body)}</div>` : ""}
           ${(payload.embeds ?? []).map(embedHtml).join("")}
           ${rows(payload.components)}
           ${(payload.attachments ?? []).length ? `<div class="attachment">📎 ${(payload.attachments ?? []).length} anexo(s)</div>` : ""}`;

    return `
    <div class="msg${payload.ephemeral ? " private" : ""}">
      <img class="avatar" src="${avatar}">
      <div class="msg-main">
        <div class="who"><b>${escape(name)}</b> <span class="tag">BOT</span>${payload.ephemeral ? ' <span class="eph">só você vê isto</span>' : ""}${v2 ? ' <span class="eph">layout V2</span>' : ""}</div>
        ${content}
      </div>
    </div>`;
}

export const PAGE_CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px; background: #1e1f24; color: #e3e5ea; font: 15px/1.4 "Segoe UI", system-ui, sans-serif; }
h1.page { font-size: 18px; margin: 0 0 18px; color: #fff; }
section.group { margin: 0 0 38px; }
section.group > h2 { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #8f93a2; margin: 0 0 12px; border-bottom: 1px solid #34363e; padding-bottom: 6px; }
.case { margin: 0 0 22px; max-width: 760px; }
.case > .cmd { font: 12px ui-monospace, Consolas, monospace; color: #9aa0b4; margin: 0 0 6px; }
.case > .cmd b { color: #c9b5ff; }
.msg { display: grid; grid-template-columns: 44px 1fr; gap: 10px; background: #26272d; border-radius: 8px; padding: 12px; }
.msg.private { outline: 1px dashed #5c6070; }
.avatar { width: 40px; height: 40px; border-radius: 50%; background: #5a2be2; }
.who { margin-bottom: 4px; }
.tag { background: #5865f2; color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 4px; vertical-align: 1px; }
.eph { font-size: 11px; color: #8f93a2; margin-left: 6px; }
.body { margin: 2px 0 6px; }
.embed { display: grid; grid-template-columns: 1fr auto; gap: 14px; background: #2e3036; border-left: 4px solid var(--bar); border-radius: 4px; padding: 10px 14px 12px 12px; max-width: 520px; margin-top: 4px; }
.embed .thumb { width: 80px; height: 80px; border-radius: 6px; object-fit: cover; }
.author { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; margin-bottom: 4px; color: #e9eaee; }
.author img { width: 22px; height: 22px; border-radius: 5px; }
.title { font-weight: 700; font-size: 16px; margin-bottom: 4px; color: #fff; }
.desc { font-size: 14px; }
.fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 14px; margin-top: 8px; }
.field { grid-column: 1 / -1; }
.field.inline { grid-column: auto; }
.fname { font-weight: 700; font-size: 13px; color: #fff; margin-bottom: 2px; }
.fvalue { font-size: 14px; }
.big { max-width: 100%; border-radius: 4px; margin-top: 8px; }
.footer { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 12px; color: #a3a7b5; }
.footer img { width: 18px; height: 18px; border-radius: 4px; }
.row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.btn { padding: 6px 12px; border-radius: 4px; font-size: 13px; font-weight: 600; background: #4a4d57; }
.btn.primary { background: #5865f2; } .btn.success { background: #248046; } .btn.danger { background: #c93b3b; } .btn.link { background: #4a4d57; text-decoration: underline; }
.select { padding: 7px 12px; border-radius: 4px; background: #1e1f24; border: 1px solid #4a4d57; font-size: 13px; min-width: 260px; }
.select small { color: #8f93a2; margin-left: 8px; }
pre { background: #1d1e22; border: 1px solid #3a3d46; border-radius: 4px; padding: 8px 10px; margin: 6px 0; font: 13px/1.35 ui-monospace, "Cascadia Mono", Consolas, monospace; white-space: pre; overflow-x: auto; color: #dcdfe6; }
code { background: #1d1e22; border: 1px solid #3a3d46; border-radius: 3px; padding: 0 4px; font: 13px ui-monospace, Consolas, monospace; }
blockquote { margin: 4px 0; padding: 0 0 0 10px; border-left: 3px solid #5c6070; }
ul { margin: 4px 0; padding-left: 20px; }
h1.md { font-size: 22px; margin: 8px 0 4px; } h2.md { font-size: 18px; margin: 8px 0 3px; } h3.md { font-size: 15px; margin: 6px 0 2px; }
.sub { font-size: 12px; color: #a3a7b5; }
.gap { height: 8px; }
a { color: #6cb0ff; }
.mention { background: #3b3f6b; border-radius: 3px; padding: 0 3px; color: #c9d2ff; }
.emoji { color: #c9b5ff; }
.spoiler { background: #1d1e22; color: transparent; border-radius: 3px; }
.v2container { background: #2e3036; border-left: 4px solid var(--bar); border-radius: 6px; padding: 10px 14px; margin-top: 4px; max-width: 540px; }
.v2container .v2text { margin: 2px 0; font-size: 14px; }
.v2sep { border: 0; border-top: 1px solid #44474f; margin: 8px 0; }
.v2gap { height: 8px; }
.v2section { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; }
.v2section .thumb { width: 72px; height: 72px; border-radius: 6px; object-fit: cover; }
.attachment { margin-top: 6px; color: #8f93a2; font-size: 13px; }
`;
