
/**
 * Componentes de layout V2 do Discord.
 *
 * Regras da documentação (fundamentos/componentes): blocos text, separator,
 * section (1 a 3 textos + um botão ou uma miniatura) e container (barra de cor),
 * misturados com linhas de botões e menus; até 40 componentes por mensagem
 * contando todos os níveis; container não aceita container; customId único.
 *
 * Este módulo tem três partes:
 *   1. as regras (layoutProblems) e a contagem de componentes;
 *   2. o kit: peças prontas para montar um layout (heading, section, container...);
 *   3. a conversão de uma resposta clássica (embed) em layout, para todos os
 *      comandos ganharem o visual novo sem cada um ser reescrito.
 */

import { DEFAULT_FOOTER } from "./embed.mjs";

export const V2_LIMITS = Object.freeze({
    components: 40,
    textLength: 4000,
    sectionTexts: 3,
    rows: 5
});

// ==========================================
// REGRAS DA DOCUMENTAÇÃO
// ==========================================

// Conta os componentes como o Discord: o container, cada texto, a seção e o acessório
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
// KIT: PEÇAS PARA MONTAR UM LAYOUT
// ==========================================

export const text = content => ({ type: "text", content });

// "## Título", "### Grupo": a doc do Discord aceita títulos com # no começo da linha.
export const heading = (title, level = 2) => text(`${"#".repeat(level)} ${title}`);

// Letra pequena ("-# texto"), para notas e rodapés.
export const subtext = content => text(`-# ${content}`);

// Linha fina entre os grupos; "gap" só abre um respiro, sem linha.
export const divider = (spacing = "small") => ({ type: "separator", divider: true, spacing });

export const gap = (spacing = "small") => ({ type: "separator", divider: false, spacing });

// Até 3 textos à esquerda e um acessório à direita (botão ou miniatura).
export const section = (texts, accessory) => ({ type: "section", texts, accessory });

// A miniatura só existe com https; sem ela devolve null (quem monta a seção cai num texto).
export const thumbnail = (url, description) =>
    String(url ?? "").startsWith("https://")
        ? { type: "thumbnail", url, ...(description ? { description: String(description).slice(0, 200) } : {}) }
        : null;

// Barra de cor: "#rrggbb" ou número; cor inválida fica sem barra.
export function accentColor(color) {
    if (typeof color === "number" && Number.isInteger(color) && color >= 0 && color <= 0xffffff) {
        return "#" + color.toString(16).padStart(6, "0");
    }

    const match = /^#?([0-9a-fA-F]{6})$/.exec(String(color ?? ""));

    return match ? "#" + match[1] : undefined;
}

export function container(components, { color, spoiler } = {}) {
    const accent = accentColor(color);

    return {
        type: "container",
        ...(accent ? { accentColor: accent } : {}),
        ...(spoiler ? { spoiler: true } : {}),
        components: components.filter(Boolean)
    };
}

// Cabeçalho de painel: com miniatura, os textos viram uma seção (a miniatura fica ao lado);
// sem ela, ficam como textos soltos. A seção aceita até 3 textos; o que passa disso segue solto.
export function headerBlock(lines, thumb) {
    const texts = lines.filter(Boolean);

    if (!texts.length) return [];

    if (!thumb) return texts.map(text);

    return [
        section(texts.slice(0, V2_LIMITS.sectionTexts), thumb),
        ...texts.slice(V2_LIMITS.sectionTexts).map(text)
    ];
}

// Parte o texto em pedaços de até "max", de preferência nas quebras de linha.
export function chunks(value, max = V2_LIMITS.textLength) {
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

// ==========================================
// EMBED -> LAYOUT
// ==========================================

const ZERO_WIDTH = /[​-‍﻿]/g;

// Um valor curto e de uma linha só ("Entregador", "**+R$ 150,00**") vira "Nome: valor" numa
// lista compacta; o que tem várias linhas ou é comprido vira um bloco com título.
const isCompact = (name, value) => !value.includes("\n") && value.length <= 60 && name.length <= 34;

// O valor inteiro em negrito perde o negrito: o nome é que fica em negrito na linha.
const unbold = value => {
    const match = /^\*\*([^*]+)\*\*$/.exec(value);

    return match ? match[1] : value;
};

// Campos do embed -> grupos: { lines: [...] } (compactos, juntos) ou { name, value } (bloco).
export function fieldGroups(fields) {
    const groups = [];

    for (const field of fields ?? []) {
        const name = String(field?.name ?? "").replace(ZERO_WIDTH, "").trim();
        const value = String(field?.value ?? "").replace(ZERO_WIDTH, "").trim();

        // o campo vazio que o embed usa para pular linha não vira nada
        if (!name && !value) continue;

        if (name && value && isCompact(name, value)) {
            const line = `**${name.replace(/:$/, "")}:** ${unbold(value)}`;
            const last = groups.at(-1);

            if (last?.lines) last.lines.push(line);
            else groups.push({ lines: [line] });

            continue;
        }

        groups.push({ name, value });
    }

    return groups;
}

const groupText = group => group.lines
    ? group.lines.join("\n")
    : (group.name ? `### ${group.name}\n${group.value}` : group.value).trim();

// Um embed vira um container com a cor dele, o título, a descrição, os campos em grupos
// (linhas compactas ou blocos com título, separados por uma linha fina), os botões e menus
// dentro e o rodapé fora, em letra pequena. O rodapé padrão da Helena, que se repete em
// toda mensagem, não vai. Sem bloco de imagem no layout, embed com imagem não converte
// (devolve null).
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

    const groups = fieldGroups(embed.fields).flatMap(group => {
        const content = groupText(group);

        return content ? chunks(content).map((piece, index) => ({ content: piece, block: Boolean(group.name) && index === 0 })) : [];
    });

    const controls = (rows ?? []).filter(Boolean);

    const thumb = String(embed.thumbnail?.url ?? "").startsWith("https://")
        ? { type: "thumbnail", url: embed.thumbnail.url }
        : null;

    const build = withSeparators => {
        const body = groups.map(group => group.content);

        // Sem título nem descrição, o primeiro grupo faz o papel do cabeçalho ao lado da miniatura.
        const lead = head.length || !thumb ? head : body.splice(0, 1);

        const inside = headerBlock(lead, thumb);

        for (const content of body) {
            if (withSeparators && inside.length) inside.push(divider());

            inside.push(text(content));
        }

        if (controls.length && inside.length && withSeparators) inside.push(divider());

        inside.push(...controls);

        return inside;
    };

    let inside = build(true);

    // Muitos grupos: sem as linhas finas, para caber nos 40 componentes.
    if (countComponents([container(inside)]) > V2_LIMITS.components) inside = build(false);

    if (!inside.length) {
        return null;
    }

    const layout = [container(inside, { color: embed.color })];

    const footer = String(embed.footer?.text ?? "").trim();

    if (footer && footer !== DEFAULT_FOOTER) layout.push(subtext(footer.slice(0, V2_LIMITS.textLength - 3)));

    return layout;
}

// ==========================================
// RESPOSTA CLÁSSICA -> RESPOSTA V2
// ==========================================

// Tira o layout próprio da resposta (ele só existe para o V2; o clássico não o conhece).
export function stripLayout(data) {
    if (!data || typeof data !== "object" || !("layout" in data)) return data;

    const { layout, ...rest } = data;

    return rest;
}

// "data" no formato de sempre ({ body, embeds, components, ephemeral... }), com um
// "layout" opcional (o desenho próprio do V2 para essa tela). Devolve o mesmo com o layout
// no lugar do embed, ou null quando é melhor ficar no clássico:
//   - texto no body: é ele que avisa (notifica) quem foi mencionado;
//   - menção de pessoa ou cargo (<@id>, <@&id>) no texto: no embed ela é só visual, mas
//     num texto do layout ela notifica, como no body (a doc de mensagens);
//   - anexos: a doc não diz se anexo convive com o layout;
//   - embed com imagem, mais de um embed ou layout fora das regras.
// "clear": numa atualização (update) a mensagem antiga pode ter body e embed, então
// o V2 os esvazia.
const MENTION = /<@&?[0-9A-Za-z-]+>/;

export function toV2Data(data, { clear = false } = {}) {
    if (!data || typeof data !== "object") {
        return null;
    }

    if ((Array.isArray(data.attachments) && data.attachments.length) || (Array.isArray(data.files) && data.files.length)) {
        return null;
    }

    if (String(data.body ?? "").trim()) {
        return null;
    }

    let layout = null;

    // O desenho próprio da tela vale quando está dentro das regras; senão, converte o embed.
    if (Array.isArray(data.layout) && !layoutProblems(data.layout).length) {
        layout = data.layout;

    } else if (Array.isArray(data.embeds) && data.embeds.length === 1) {
        layout = embedToLayout(data.embeds[0], Array.isArray(data.components) ? data.components : []);
    }

    if (!layout || layoutProblems(layout).length || MENTION.test(JSON.stringify(layout))) {
        return null;
    }

    const { body, embeds, components, layout: ignored, ...rest } = data;

    return {
        ...rest,
        ...(clear ? { body: "", embeds: [] } : {}),
        components: layout
    };
}
