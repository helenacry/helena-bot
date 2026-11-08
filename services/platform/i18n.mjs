
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

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function buildLocale({ EXACT, PATTERNS, NAMES = new Map(), SAME = [] }) {
    return {
        exact: new Map(Object.entries(EXACT)),

        // textos que valem nos dois idiomas, sem mudar (marcas, palavras iguais)
        same: new Set(SAME),

        // sem diferença de maiúsculas: "HELENA · BANCO" acha "Banco"
        folded: new Map(Object.entries(EXACT).map(([from, to]) => [fold(from), to])),

        patterns: PATTERNS,

        // nomes de itens, empregos... (português -> inglês), do maior para o menor: "Espada de ferro" vem
        // antes de "Espada". Só casam como palavra inteira.
        names: [...NAMES.entries()]
            .sort((a, b) => b[0].length - a[0].length)
            .map(([from, to]) => [new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(from)}(?![\\p{L}\\p{N}])`, "gu"), to])
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
// (o que vem antes da barra é só emoji: um texto ali, como "Comando executado por: Ana | ...", é outra coisa)
// (os emojis do app, <:h_wallet:123…>, também valem, apesar das letras)
const RECEIPT = /^((?:[^\p{L}\p{N}]|\p{Extended_Pictographic}|<a?:\w+:\d+>)*\| )([^:|\n]{1,60}): ([\s\S]+)$/u;

// HELENA · BANCO  (o nome da seção em cima da resposta)
const SECTION = /^(HELENA · )(.+)$/;

const hasWords = text => /\p{L}{2,}/u.test(text);

// O que nunca se traduz: código entre crases, menções e horários do Discord, endereços, comandos de barra
// (/saldo) e números. Uma linha que só tem isso (e emoji, pontuação) passa sem ser pendência.
function stripNeutral(text) {
    return text
        .replace(/`[^`]*`/g, " ")
        .replace(/<[@#&!:][^>]*>/g, " ")
        .replace(/\]\(https?:[^)]*\)/g, "] ")
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/(^|[\s*_(])\/[a-z][a-z0-9_-]*/g, "$1 ")
        .replace(/\b(XP|HP|ID|PvP|OK|ms)\b/gi, " ")
        .replace(/\/(min|h|s)\b/g, " ");
}

// "**Café**" e "🇧🇷 Português (Brasil)": o texto conhecido por dentro do negrito ou depois do emoji. A
// formatação e o emoji ficam, a tradução vai no meio.
function peel(core, lang, locale) {
    const bold = /^\*\*([\s\S]+?)\*\*$/.exec(core);

    if (bold) {
        const hit = lookup(bold[1], lang, locale);

        if (hit !== undefined) {
            return `**${hit}**`;
        }
    }

    // o emoji na frente; alguns (ℹ️, por exemplo) são "letras" para o Unicode, por isso o \p{Extended_Pictographic}
    const lead = /^((?:[^\p{L}\p{N}`*_<[(]|\p{Extended_Pictographic})+)([\s\S]+)$/u.exec(core);

    if (lead) {
        const hit = lookup(lead[2], lang, locale);

        if (hit !== undefined) {
            return lead[1] + hit;
        }
    }

    return undefined;
}

const readable = text => hasWords(stripNeutral(text));

const STASH = /\u0001(\d+)\u0002/g;

// A linha que é só nomes conhecidos (itens, empregos...) mais números, preços e emoji: troca os nomes.
// "**☕ Café** · **R$ 7,00**" -> "**☕ Coffee** · **R$ 7,00**". Se sobra qualquer outra palavra, não vale.
function substituteNames(core, locale) {
    if (!locale.names.length) {
        return undefined;
    }

    const stash = [];

    let text = core;

    for (const [pattern, to] of locale.names) {
        text = text.replace(pattern, () => {
            stash.push(to);

            return `\u0001${stash.length - 1}\u0002`;
        });
    }

    if (!stash.length || readable(text.replace(STASH, " "))) {
        return undefined;
    }

    return text.replace(STASH, (_, index) => stash[Number(index)]);
}

// Separadores de uma linha com vários pedaços, do mais forte para o mais fraco.
const SEPARATORS = [" · ", " • ", " — ", " | "];

// "Combate (15)", "Página 1/4 (3)": o nome e a contagem entre parênteses
const COUNTED = /^(.+?) \((\d+(?:\/\d+)?)\)$/;

// A tradução de um texto (a linha inteira ou um pedaço dela), ou undefined se nenhuma regra o conhece.
// O que só tem números, emoji, código e comandos volta igual.
function resolve(core, lang, locale) {
    if (!core || !readable(core)) {
        return core;
    }

    const hit = lookup(core, lang, locale);

    return hit !== undefined ? hit : decompose(core, lang, locale);
}

// Uma linha feita de pedaços conhecidos: "Nome (3)" e "A · B • C". O que não é reconhecido vira pendência
// SÓ do pedaço (não da linha inteira), e a linha sai com os pedaços que foram traduzidos.
function decompose(core, lang, locale) {
    const counted = COUNTED.exec(core);

    if (counted) {
        const head = resolve(counted[1], lang, locale);

        return head === undefined ? undefined : `${head} (${counted[2]})`;
    }

    for (const separator of SEPARATORS) {
        if (!core.includes(separator)) {
            continue;
        }

        const parts = core.split(separator);

        const done = parts.map(part => resolve(part.trim(), lang, locale));

        // nada reconhecido: a linha inteira é a pendência
        if (done.every(part => part === undefined)) {
            return undefined;
        }

        parts.forEach((part, index) => {
            if (done[index] === undefined && readable(part)) {
                noteMissing(lang, part.trim());
            }
        });

        return parts.map((part, index) => done[index] ?? part).join(separator);
    }

    return undefined;
}

function lookup(core, lang, locale) {
    const exact = locale.exact.get(core);

    if (exact !== undefined) {
        return exact;
    }

    // o que é igual nos dois idiomas ("Legal", "Katana")
    if (locale.same.has(core)) {
        return core;
    }

    for (const [pattern, build] of locale.patterns) {
        const match = pattern.exec(core);

        if (match) {
            // o segundo argumento traduz uma parte da frase (o {valor:t} dos padrões); a parte que ninguém
            // conhece fica como está e vira pendência
            return build(match, piece => {
                const done = resolve(piece, lang, locale);

                if (done === undefined && readable(piece)) {
                    noteMissing(lang, piece);
                }

                return done ?? piece;
            });
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
        const label = locale.exact.get(receipt[2]) ?? (locale.same.has(receipt[2]) ? receipt[2] : undefined);

        // o nome da conta sem tradução é pendência (um por conta, não um por valor)
        if (label === undefined && readable(receipt[2])) {
            noteMissing(lang, receipt[2]);
        }

        // o valor também, quando é um texto conhecido e vem em negrito ("**Tudo operacional**")
        const bold = /^\*\*(.+)\*\*$/.exec(receipt[3]);

        const inner = bold ? bold[1] : receipt[3];

        const known = resolve(inner, lang, locale);

        // um valor com palavras que ninguém traduziu vira pendência (um número, preço ou nome não)
        if (known === undefined && readable(inner)) {
            noteMissing(lang, inner);
        }

        const value = bold ? `**${known ?? inner}**` : (known ?? inner);

        return `${receipt[1]}${label ?? receipt[2]}: ${value}`;
    }

    return peel(core, lang, locale) ?? substituteNames(core, locale);
}

function translateLine(line, lang, locale) {
    const marker = MARKER.exec(line);

    if (marker) {
        return marker[1] + translateLine(line.slice(marker[1].length), lang, locale);
    }

    const [, lead, core, tail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(line);

    if (!core || !readable(core)) {
        return line;
    }

    const hit = resolve(core, lang, locale);

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
// Quem fala: a interação (comando de barra, botão, menu) traz a pessoa em "user"; a mensagem do prefixo h
// (hwork, hsaldo...) traz em "author". Sem os dois, fica o português.
export const langOf = target => getLang(target?.user?.id ?? target?.author?.id);
