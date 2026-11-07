
import { db } from "../../database/connection.mjs";

import { DEFAULT_LANG, isLang } from "../../config/i18n.mjs";

import * as enUS from "../../config/locales/en-US.mjs";

// ==========================================
// IDIOMA DE CADA PESSOA E TRADUÇÃO DAS RESPOSTAS
// ==========================================

// O código inteiro escreve em português (pt-BR). Quem escolhe outro idioma em /config recebe as
// respostas traduzidas NA HORA DE ENVIAR: o transporte (services/discord/transport.mjs) passa cada
// resposta por localizeResponse, que troca os textos pelos do dicionário do idioma
// (config/locales/<idioma>.mjs). Nenhum comando precisa saber que existe tradução.
//
// O que não está no dicionário sai em português, nunca quebrado. Com HELENA_I18N_LOG=on o log lista
// uma vez cada texto sem tradução, para você acrescentar ao dicionário.

// ==========================================
// DICIONÁRIOS
// ==========================================

const fold = text => text.normalize("NFC").toLowerCase();

function buildLocale({ EXACT, PATTERNS }) {
    return {
        exact: new Map(Object.entries(EXACT)),

        // sem diferença de maiúsculas: "HELENA · BANCO" acha "Banco"
        folded: new Map(Object.entries(EXACT).map(([from, to]) => [fold(from), to])),

        patterns: PATTERNS
    };
}

const LOCALES = Object.freeze({
    "en-US": buildLocale(enUS)
});

// ==========================================
// IDIOMA DE CADA PESSOA
// ==========================================

const cache = new Map();

// O idioma de quem usou o comando. Quem nunca escolheu (ou não tem ID) fica no padrão.
export function getLang(userId) {
    if (userId === undefined || userId === null || userId === "") {
        return DEFAULT_LANG;
    }

    const id = String(userId);

    if (cache.has(id)) {
        return cache.get(id);
    }

    const row = db.prepare("SELECT lang FROM user_settings WHERE user_id = ?").get(id);

    const lang = isLang(row?.lang) ? row.lang : DEFAULT_LANG;

    cache.set(id, lang);

    return lang;
}

export function setLang(userId, lang) {
    if (!isLang(lang)) {
        throw new Error(`Idioma inválido: ${lang}.`);
    }

    const id = String(userId ?? "");

    if (!id) {
        throw new Error("Pessoa não identificada.");
    }

    db.prepare(`
        INSERT INTO user_settings (user_id, lang)
        VALUES (?, ?)
        ON CONFLICT (user_id)
        DO UPDATE SET lang = excluded.lang, updated_at = unixepoch()
    `).run(id, lang);

    cache.set(id, lang);

    return lang;
}

// Para os testes (e para quem apagar linhas do banco por fora).
export function resetLangCache() {
    cache.clear();
}

// ==========================================
// O QUE FALTA TRADUZIR
// ==========================================

const missing = new Set();

const MISSING_LIMIT = 2_000;

export const missingTranslations = () => [...missing];

export const clearMissingTranslations = () => missing.clear();

function noteMissing(lang, text) {
    if (missing.size >= MISSING_LIMIT || missing.has(`${lang}\u0000${text}`)) {
        return;
    }

    missing.add(`${lang}\u0000${text}`);

    if (String(process.env.HELENA_I18N_LOG ?? "").trim().toLowerCase() === "on") {
        console.log(`[I18N] sem tradução (${lang}): ${JSON.stringify(text)}`);
    }
}

// ==========================================
// TRADUZIR UM TEXTO
// ==========================================

// "## ", "-# ", "> " e "- " no começo de uma linha são formatação: a tradução é do que vem depois.
const MARKER = /^(\s*(?:#{1,6} |-# |> |[-*•] ))/;

// 💵 | Pagamento: **+R$ 420,00**  (uma linha do recibo: emoji, barra, conta, valor)
const RECEIPT = /^(.*?\| )([^:|\n]{1,60}): ([\s\S]+)$/;

// HELENA · BANCO  (o nome da seção em cima da resposta)
const SECTION = /^(HELENA · )(.+)$/;

const hasWords = text => /\p{L}{2,}/u.test(text);

function lookup(core, lang, locale) {
    const exact = locale.exact.get(core);

    if (exact !== undefined) {
        return exact;
    }

    for (const [pattern, build] of locale.patterns) {
        const match = pattern.exec(core);

        if (match) {
            return build(match);
        }
    }

    const section = SECTION.exec(core);

    if (section) {
        const part = locale.folded.get(fold(section[2]));

        if (part !== undefined) {
            return `${section[1]}${part.toUpperCase()}`;
        }
    }

    const receipt = RECEIPT.exec(core);

    if (receipt) {
        const label = locale.exact.get(receipt[2]);

        if (label !== undefined) {
            // o valor também, quando é um texto conhecido e vem em negrito ("**Tudo operacional**")
            const bold = /^\*\*(.+)\*\*$/.exec(receipt[3]);

            const value = bold
                ? `**${locale.exact.get(bold[1]) ?? bold[1]}**`
                : (locale.exact.get(receipt[3]) ?? receipt[3]);

            return `${receipt[1]}${label}: ${value}`;
        }
    }

    return undefined;
}

function translateLine(line, lang, locale) {
    const marker = MARKER.exec(line);

    if (marker) {
        return marker[1] + translateLine(line.slice(marker[1].length), lang, locale);
    }

    const [, lead, core, tail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(line);

    if (!core || !hasWords(core)) {
        return line;
    }

    const hit = lookup(core, lang, locale);

    if (hit === undefined) {
        noteMissing(lang, core);

        return line;
    }

    return lead + hit + tail;
}

// Traduz um texto para o idioma. Português (o padrão), texto vazio e idioma sem dicionário voltam iguais.
export function translateText(text, lang) {
    if (typeof text !== "string" || !text || lang === DEFAULT_LANG) {
        return text;
    }

    const locale = LOCALES[lang];

    if (!locale) {
        return text;
    }

    // o texto inteiro pode ser uma entrada do dicionário (inclusive com várias linhas)
    const whole = locale.exact.get(text);

    if (whole !== undefined) {
        return whole;
    }

    return text.split("\n").map(line => translateLine(line, lang, locale)).join("\n");
}

// ==========================================
// TRADUZIR UMA RESPOSTA
// ==========================================

// Traduz só as chaves que são texto (e existem): não inventa chave nem mexe no resto.
function withTexts(object, keys, tr) {
    const out = { ...object };

    for (const key of keys) {
        if (typeof out[key] === "string") {
            out[key] = tr(out[key]);
        }
    }

    return out;
}

function embedOf(embed, tr) {
    const out = withTexts(embed, ["title", "description"], tr);

    if (out.footer && typeof out.footer === "object") {
        out.footer = withTexts(out.footer, ["text"], tr);
    }

    if (out.author && typeof out.author === "object") {
        out.author = withTexts(out.author, ["name"], tr);
    }

    if (Array.isArray(out.fields)) {
        out.fields = out.fields.map(field => withTexts(field, ["name", "value"], tr));
    }

    return out;
}

// Botões, menus e os blocos do layout V2: só o que a pessoa lê. O customId, o value de uma opção, o
// URL e o emoji nunca são tocados.
function componentOf(node, tr) {
    if (Array.isArray(node)) {
        return node.map(item => componentOf(item, tr));
    }

    if (!node || typeof node !== "object") {
        return node;
    }

    const out = withTexts(node, ["label", "placeholder", "content", "description"], tr);

    if (Array.isArray(out.texts)) {
        out.texts = out.texts.map(text => (typeof text === "string" ? tr(text) : text));
    }

    if (Array.isArray(out.options)) {
        out.options = out.options.map(option => withTexts(option, ["label", "description"], tr));
    }

    if (out.components) {
        out.components = componentOf(out.components, tr);
    }

    if (out.accessory) {
        out.accessory = componentOf(out.accessory, tr);
    }

    return out;
}

// O "data" de uma resposta: { body, embeds, components, layout } ou, num formulário, { title, fields }.
// Devolve uma cópia: a resposta original (que pode estar guardada em outro lugar) não é mexida.
export function localizeData(data, lang) {
    if (!data || typeof data !== "object" || lang === DEFAULT_LANG || !LOCALES[lang]) {
        return data;
    }

    const tr = text => translateText(text, lang);

    const out = withTexts(data, ["body", "title"], tr);

    if (Array.isArray(out.embeds)) {
        out.embeds = out.embeds.map(embed => embedOf(embed, tr));
    }

    if (Array.isArray(out.components)) {
        out.components = componentOf(out.components, tr);
    }

    if (Array.isArray(out.layout)) {
        out.layout = componentOf(out.layout, tr);
    }

    // formulário: o rótulo e a dica de cada campo (o valor é de quem digitou)
    if (Array.isArray(out.fields)) {
        out.fields = out.fields.map(field => withTexts(field, ["label", "placeholder"], tr));
    }

    return out;
}

// { type, data } -> o mesmo, com o data traduzido.
export function localizeResponse(response, lang) {
    if (!response || typeof response !== "object" || !response.data || lang === DEFAULT_LANG || !LOCALES[lang]) {
        return response;
    }

    return { ...response, data: localizeData(response.data, lang) };
}

// O idioma de quem fez a interação (comando, botão, formulário) ou mandou a mensagem.
export const langOf = interaction => getLang(interaction?.user?.id);
