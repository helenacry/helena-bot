
import {
    parseUserReference,
    parseChannelReference,
    parseRoleReference
} from "../utils/ids.mjs";

// ==========================================
// PARSER DOS COMANDOS COM PREFIXO
// ==========================================

// Converte o texto digitado ("hdepositar 100",
// "hajuda categoria:economia") no mesmo formato
// que a VSync entrega nos comandos de barra:
//
//   data.options = { nome: valor, ... }
//
// (objeto indexado pelo nome da opção; opções do
// tipo user, channel e role chegam como ID).
//
// Este módulo não acessa banco nem rede.

const MAX_STRING_LENGTH = 2000;

// ==========================================
// ERRO DE USO
// ==========================================

export class PrefixUsageError extends Error {
    constructor(message) {
        super(message);

        this.name = "PrefixUsageError";
    }
}

// ==========================================
// TOKENIZAÇÃO
// ==========================================

// Aceita:
//   palavra
//   "texto entre aspas"   'texto entre aspas'
//   nome:valor            nome:"texto entre aspas"
//
// Aspas só agrupam quando abrem no início de uma
// palavra e fecham no fim dela, para que um
// apóstrofo no meio do texto não quebre a frase.

const TOKEN =
    /(?:[^\s"':]+:)?(?:"[^"]*"(?=\s|$)|'[^']*'(?=\s|$))|\S+/g;

function unquote(value) {
    if (
        value.length >= 2 &&
        (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        )
    ) {
        return value.slice(1, -1);
    }

    return value;
}

export function tokenize(input) {
    const tokens = [];

    for (const match of String(input ?? "").matchAll(TOKEN)) {
        tokens.push(match[0]);
    }

    return tokens;
}

// ==========================================
// CONVERSÃO DE VALORES
// ==========================================

function usage(definition, detail) {
    return new PrefixUsageError(
        `A opção "${definition.name}" ${detail}`
    );
}

function convertValue(raw, definition) {
    switch (definition.type) {
        case "integer": {
            if (!/^[+-]?\d+$/.test(raw)) {
                throw usage(
                    definition,
                    "precisa ser um número inteiro."
                );
            }

            const number = Number(raw);

            if (!Number.isSafeInteger(number)) {
                throw usage(
                    definition,
                    "tem um número grande demais."
                );
            }

            return number;
        }

        case "number": {
            const normalized = raw.replace(",", ".");

            if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) {
                throw usage(
                    definition,
                    "precisa ser um número."
                );
            }

            return Number(normalized);
        }

        case "boolean": {
            const value = raw.toLowerCase();

            if (["true", "sim", "s", "1"].includes(value)) {
                return true;
            }

            if (["false", "não", "nao", "n", "0"].includes(value)) {
                return false;
            }

            throw usage(
                definition,
                "precisa ser sim ou não."
            );
        }

        case "user": {
            const id = parseUserReference(raw);

            if (!id) {
                throw usage(
                    definition,
                    "precisa ser uma menção (@usuário) ou um ID válido."
                );
            }

            return id;
        }

        case "channel": {
            const id = parseChannelReference(raw);

            if (!id) {
                throw usage(
                    definition,
                    "precisa ser um canal (#canal) ou um ID válido."
                );
            }

            return id;
        }

        case "role": {
            const id = parseRoleReference(raw);

            if (!id) {
                throw usage(
                    definition,
                    "precisa ser um cargo (@cargo) ou um ID válido."
                );
            }

            return id;
        }

        default: {
            if (raw.length > MAX_STRING_LENGTH) {
                throw usage(
                    definition,
                    `aceita no máximo ${MAX_STRING_LENGTH} caracteres.`
                );
            }

            return raw;
        }
    }
}

// Retorna o valor oficial da opção quando ela
// possui choices. Aceita o valor ou o nome da
// escolha, sem diferenciar maiúsculas.

function applyChoices(value, definition) {
    if (!Array.isArray(definition.choices)) {
        return value;
    }

    const wanted = String(value).toLowerCase();

    const choice = definition.choices.find(item =>
        String(item.value).toLowerCase() === wanted ||
        String(item.name).toLowerCase() === wanted
    );

    if (!choice) {
        throw new PrefixUsageError(
            `Valor inválido para "${definition.name}". Opções: ${
                definition.choices
                    .map(item => item.value)
                    .join(", ")
            }`
        );
    }

    return choice.value;
}

// ==========================================
// ANÁLISE DOS ARGUMENTOS
// ==========================================

export function parseArguments(input, definitions = []) {
    const names = new Set(
        definitions.map(definition => definition.name)
    );

    const named = new Map();

    const positional = [];

    for (const token of tokenize(input)) {
        const separator = token.indexOf(":");

        const prefix = separator > 0
            ? token.slice(0, separator)
            : "";

        // "nome:valor" só vale quando "nome" é uma
        // opção do comando e o valor não está vazio.
        if (
            names.has(prefix) &&
            token.length > separator + 1 &&
            !named.has(prefix)
        ) {
            named.set(
                prefix,
                unquote(token.slice(separator + 1))
            );

            continue;
        }

        positional.push(token);
    }

    const options = {};

    let cursor = 0;

    for (let index = 0; index < definitions.length; index++) {
        const definition = definitions[index];

        let raw;

        if (named.has(definition.name)) {
            raw = named.get(definition.name);

        } else if (cursor < positional.length) {
            const remaining = positional.length - cursor;

            const isLastPending = definitions
                .slice(index + 1)
                .every(next => named.has(next.name));

            // A última opção de texto recebe o restante
            // da frase, como no comando de barra.
            if (
                isLastPending &&
                remaining > 1 &&
                (definition.type ?? "string") === "string"
            ) {
                raw = positional.slice(cursor).join(" ");

                cursor = positional.length;

            } else {
                raw = unquote(positional[cursor]);

                cursor++;
            }
        }

        if (raw === undefined || raw === "") {
            if (definition.required) {
                throw new PrefixUsageError(
                    `Faltou a opção "${definition.name}".`
                );
            }

            continue;
        }

        options[definition.name] = applyChoices(
            convertValue(raw, definition),
            definition
        );
    }

    if (cursor < positional.length) {
        throw new PrefixUsageError(
            "Foram informados mais argumentos do que o comando aceita."
        );
    }

    return options;
}
