// ==========================================
// FRASES COM PARTES QUE MUDAM
// ==========================================

// Para o dicionário de inglês (config/locales/en-US*.mjs): escreve-se a frase em português e a tradução com
// os mesmos espaços {nome}, e o ajudante monta o [regex, função] que o PATTERNS espera.
//
//   tpl("Você comprou **{n}** munição.", "You bought **{n}** ammo.")
//
//   {n} ou {n2}...   número (com ponto ou vírgula): "1.234", "12,5"
//   {nome}           qualquer texto; se for o nome de um item, emprego, arma... a tradução dele entra
//                    sozinha (veja registerNames), com ou sem o emoji na frente: "🍎 Maçã" -> "🍎 Apple"
//
// A frase tem de casar o texto inteiro (o texto já vem sem espaços nas pontas).

// nomes conhecidos (itens, empregos, armas...): português -> inglês
const names = new Map();

export function registerNames(entries) {
    for (const [pt, en] of Object.entries(entries)) {
        names.set(pt, en);
    }
}

export const knownNames = () => names;

// "🍎 Maçã" -> "🍎 Apple"; "Maçã" -> "Apple"; o que não é nome conhecido volta igual
export function nameOf(text) {
    const value = String(text);

    const direct = names.get(value);

    if (direct !== undefined) {
        return direct;
    }

    const split = /^([^\p{L}\p{N}]*)(.+?)([^\p{L}\p{N}]*)$/u.exec(value);

    if (split) {
        const hit = names.get(split[2]);

        if (hit !== undefined) {
            return `${split[1]}${hit}${split[3]}`;
        }
    }

    return value;
}

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// {nome} na frase em português; {nome} ou {nome:t} na tradução
const PLACEHOLDER = /\{(\w+)\}/g;
const TARGET_PLACEHOLDER = /\{(\w+)(:t)?\}/g;

const isNumber = key => /^n\d*$/.test(key);
const isMention = key => /^u\d*$/.test(key);
const isMoney = key => /^m\d*$/.test(key);

// o que vem de um marcador que não é um nome: número, menção e dinheiro passam como estão
const isPlain = key => isNumber(key) || isMention(key) || isMoney(key);

// {nome:t} na tradução manda traduzir também o que foi capturado (um valor, um rótulo...), com as mesmas
// regras do dicionário inteiro; {nome} só troca os nomes conhecidos de itens e empregos.
//
// "en" também pode ser uma função (valores, traduzir) => texto, para o que depende do número (plural):
//   tpl("{n} itens", ({ n }) => `${n} item${n === "1" ? "" : "s"}`)
export function tpl(pt, en) {
    const keys = [];

    let source = "";
    let last = 0;

    for (const match of pt.matchAll(PLACEHOLDER)) {
        source += escape(pt.slice(last, match.index));

        keys.push(match[1]);

        // {n}: número | {u}: menção <@id> | {m}: dinheiro "R$ 1,50" | o resto: qualquer texto
        source += isNumber(match[1]) ? "(\\d[\\d.,]*)"
            : isMention(match[1]) ? "(<@!?\\d+>)"
                : isMoney(match[1]) ? "(R\\$[\\s\\u00a0]*[\\d.,]+[kMB]?)"
                    : "([\\s\\S]+?)";

        last = match.index + match[0].length;
    }

    source += escape(pt.slice(last));

    const pattern = new RegExp(`^${source}$`);

    return [
        pattern,
        (m, translate = text => text) => {
            const values = {};

            keys.forEach((key, index) => {
                values[key] = isPlain(key) ? m[index + 1] : nameOf(m[index + 1]);
            });

            if (typeof en === "function") {
                return en(values, translate);
            }

            return en.replace(TARGET_PLACEHOLDER, (_, key, mark) => {
                const index = keys.indexOf(key);

                if (index < 0) {
                    return `{${key}${mark ?? ""}}`;
                }

                return mark ? translate(m[index + 1]) : values[key];
            });
        }
    ];
}
