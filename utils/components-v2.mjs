
/**
 * Componentes de layout V2 da VSync.
 *
 * Regras da documentação (fundamentos/componentes): blocos text, separator,
 * section (1 a 3 textos + um botão ou uma miniatura) e container (barra de cor),
 * misturados com linhas de botões e menus; até 40 componentes por mensagem
 * contando todos os níveis; container não aceita container; customId único.
 */

export const V2_LIMITS = Object.freeze({
    components: 40,
    textLength: 4000,
    sectionTexts: 3,
    rows: 5
});

// ==========================================
// REGRAS DA DOCUMENTAÇÃO
// ==========================================

// Conta os componentes como a VSync: o container, cada texto, a seção e o acessório
// dela, cada linha e cada botão ou menu.
export function countComponents(components) {
    let total = 0;

    const visit = component => {
        total += 1;

        if (component?.type === "container" || component?.type === "row") {
            (component.components ?? []).forEach(visit);

        } else if (component?.type === "section") {
            total += (component.texts ?? []).length;

            visit(component.accessory);
        }
    };

    (components ?? []).forEach(visit);

    return total;
}

// Devolve a lista do que está fora das regras (vazia = layout válido). É o mesmo
// teste que a API faz ("400 Componentes inválidos"), feito aqui antes de enviar.
export function layoutProblems(components) {
    const problems = [];
    const ids = new Set();

    if (!Array.isArray(components) || !components.length) {
        return ["sem componentes"];
    }

    const text = (value, where) => {
        const content = typeof value === "string" ? value : value?.content;

        if (typeof content !== "string" || !content.trim() || content.length > V2_LIMITS.textLength) {
            problems.push(`${where}: o texto precisa ter de 1 a ${V2_LIMITS.textLength} caracteres`);
        }
    };

    const control = component => {
        if (component.customId !== undefined) {
            if (ids.has(component.customId)) problems.push(`customId repetido: ${component.customId}`);

            ids.add(component.customId);
        }
    };

    let rows = 0;

    const visit = (component, parent) => {
        const type = component?.type;

        if (type === "container") {
            if (parent === "container") problems.push("um container não aceita outro container");

            if (component.accentColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(component.accentColor)) {
                problems.push("accentColor precisa ser #rrggbb");
            }

            if (!Array.isArray(component.components) || !component.components.length) {
                problems.push("container vazio");
            }

            (component.components ?? []).forEach(child => visit(child, "container"));

        } else if (type === "row") {
            rows += 1;

            const kids = component.components ?? [];
            const onlyMenu = kids.length === 1 && kids[0]?.type === "select";

            if (!onlyMenu && (kids.length < 1 || kids.length > 5)) {
                problems.push("uma row leva de 1 a 5 botões ou 1 menu");
            }

            kids.forEach(child => visit(child, "row"));

        } else if (type === "section") {
            const texts = component.texts ?? [];

            if (texts.length < 1 || texts.length > V2_LIMITS.sectionTexts) {
                problems.push("section leva de 1 a 3 textos");
            }

            texts.forEach(item => text(item, "section"));

            if (!["button", "thumbnail"].includes(component.accessory?.type)) {
                problems.push("section leva um acessório: botão ou miniatura");
            }

            visit(component.accessory, "section");

        } else if (type === "text") {
            text(component, "text");

        } else if (type === "thumbnail") {
            if (parent !== "section") problems.push("thumbnail só como acessório de section");

            if (!String(component.url ?? "").startsWith("https://")) problems.push("thumbnail precisa de https");

        } else if (type === "separator") {
            if (component.spacing !== undefined && !["small", "large"].includes(component.spacing)) {
                problems.push("spacing: small ou large");
            }

        } else if (type === "button" || type === "select") {
            control(component);

        } else {
            problems.push(`tipo desconhecido: ${type}`);
        }
    };

    components.forEach(component => visit(component, null));

    if (rows > V2_LIMITS.rows) problems.push(`${rows} linhas (máximo ${V2_LIMITS.rows})`);

    const total = countComponents(components);

    if (total > V2_LIMITS.components) problems.push(`${total} componentes (máximo ${V2_LIMITS.components})`);

    return problems;
}

// ==========================================
// EMBED -> LAYOUT
// ==========================================

function accentColor(color) {
    if (typeof color === "number" && Number.isInteger(color) && color >= 0 && color <= 0xffffff) {
        return "#" + color.toString(16).padStart(6, "0");
    }

    const match = /^#?([0-9a-fA-F]{6})$/.exec(String(color ?? ""));

    return match ? "#" + match[1] : undefined;
}

// Parte o texto em pedaços de até "max", de preferência nas quebras de linha.
function chunks(value, max = V2_LIMITS.textLength) {
    const parts = [];
    let rest = String(value ?? "").trim();

    while (rest.length > max) {
        let cut = rest.lastIndexOf("\n", max);

        if (cut < max / 2) cut = max;

        parts.push(rest.slice(0, cut).trim());

        rest = rest.slice(cut).trim();
    }

    if (rest) parts.push(rest);

    return parts.filter(part => part.length > 0);
}

const ZERO_WIDTH = /[​-‍﻿]/g;

// Os campos viram texto corrido: "**nome**" e o valor logo abaixo. O campo vazio que
// o embed usa só para pular linha não vira nada.
function fieldTexts(fields) {
    const blocks = [];

    for (const field of fields ?? []) {
        const name = String(field?.name ?? "").replace(ZERO_WIDTH, "").trim();
        const value = String(field?.value ?? "").replace(ZERO_WIDTH, "").trim();

        if (!name && !value) continue;

        blocks.push(name ? `**${name}**\n${value}`.trim() : value);
    }

    // junta os campos em poucos textos (cada texto vale um dos 40 componentes)
    const joined = [];
    let current = "";

    for (const block of blocks) {
        for (const piece of chunks(block)) {
            if (current && (current + "\n\n" + piece).length > V2_LIMITS.textLength) {
                joined.push(current);
                current = "";
            }

            current = current ? current + "\n\n" + piece : piece;
        }
    }

    if (current) joined.push(current);

    return joined;
}

const text = content => ({ type: "text", content });

const divider = () => ({ type: "separator", divider: true, spacing: "small" });

// Um embed vira um container com a cor do embed, o título, a descrição, os campos e as
// linhas de botões e menus; o rodapé fica fora, em letra pequena. Sem bloco de imagem
// no layout, embed com imagem não converte (devolve null).
export function embedToLayout(embed, rows = []) {
    if (!embed || typeof embed !== "object" || embed.image) {
        return null;
    }

    const author = String(embed.author?.name ?? "").trim();
    const title = String(embed.title ?? "").trim();

    const head = [];

    if (title && author) head.push(`-# ${author}`);

    if (title || author) head.push(`## ${title || author}`);

    head.push(...chunks(embed.description));

    const body = fieldTexts(embed.fields);

    const inside = [];

    const thumbnail = String(embed.thumbnail?.url ?? "");

    // Com miniatura, os primeiros textos viram uma seção (a miniatura fica ao lado).
    if (thumbnail.startsWith("https://")) {
        const pool = [...head, ...(head.length ? [] : body.splice(0, 1))];
        const inSection = pool.slice(0, V2_LIMITS.sectionTexts);

        if (inSection.length) {
            inside.push({
                type: "section",
                texts: inSection,
                accessory: { type: "thumbnail", url: thumbnail }
            });

            head.splice(0, head.length, ...pool.slice(V2_LIMITS.sectionTexts));
        }
    }

    head.forEach(content => inside.push(text(content)));

    if (body.length && inside.length) inside.push(divider());

    body.forEach(content => inside.push(text(content)));

    const controls = (rows ?? []).filter(Boolean);

    if (controls.length && inside.length) inside.push(divider());

    inside.push(...controls);

    if (!inside.length) {
        return null;
    }

    const color = accentColor(embed.color);

    const layout = [{
        type: "container",
        ...(color ? { accentColor: color } : {}),
        components: inside
    }];

    const footer = String(embed.footer?.text ?? "").trim();

    if (footer) layout.push(text(`-# ${footer}`.slice(0, V2_LIMITS.textLength)));

    return layout;
}

// ==========================================
// RESPOSTA CLÁSSICA -> RESPOSTA V2
// ==========================================

// "data" no formato de sempre ({ body, embeds, components, ephemeral... }). Devolve o
// mesmo com o layout no lugar do embed, ou null quando é melhor ficar no clássico:
//   - texto no body: é ele que avisa (notifica) quem foi mencionado;
//   - anexos: a doc não diz se anexo convive com o layout;
//   - mais de um embed, embed com imagem, ou layout fora das regras.
// "clear": numa atualização (update) a mensagem antiga pode ter body e embed, então
// o V2 os esvazia.
export function toV2Data(data, { clear = false } = {}) {
    if (!data || typeof data !== "object") {
        return null;
    }

    if (Array.isArray(data.attachments) && data.attachments.length) {
        return null;
    }

    if (String(data.body ?? "").trim()) {
        return null;
    }

    if (!Array.isArray(data.embeds) || data.embeds.length !== 1) {
        return null;
    }

    const layout = embedToLayout(data.embeds[0], Array.isArray(data.components) ? data.components : []);

    if (!layout || layoutProblems(layout).length) {
        return null;
    }

    const { body, embeds, components, ...rest } = data;

    return {
        ...rest,
        ...(clear ? { body: "", embeds: [] } : {}),
        components: layout
    };
}
