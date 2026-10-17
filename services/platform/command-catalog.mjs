import { comandosCarregados } from "../../command-registry.mjs";

import {
    COMMAND_CATEGORIES,
    categoryOf,
    isHiddenCommand
} from "../../config/command-categories.mjs";

import { PRISON_BLOCKED_COMMANDS } from "../../config/crime.mjs";

// ==========================================
// CATÁLOGO DE COMANDOS
// ==========================================

// A lista de comandos que a central de ajuda mostra, montada a partir dos
// comandos que o bot carregou: cada um entra na categoria da sua pasta
// (config/command-categories.mjs), sem lista escrita à mão. Comando novo
// aparece na ajuda sozinho; os de admin, dev e de teste ficam de fora.

// minúsculas e sem acento, para a busca
export const plain = text => String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function entryOf(command, folder) {
    return {
        name: command.name,
        aliases: command.aliases ?? [],
        description: String(command.description ?? "").trim(),
        options: command.options ?? [],
        category: categoryOf(command.name, folder),
        blockedInPrison: PRISON_BLOCKED_COMMANDS.has(command.name)
    };
}

// comandos: Map(nome -> comando); origem: Map(nome -> "pasta/arquivo.mjs")
export function buildCatalog(comandos, origem) {
    const byCategory = new Map(COMMAND_CATEGORIES.map(category => [category.id, []]));

    for (const command of comandos.values()) {
        const folder = String(origem.get(command.name) ?? "").split("/")[0];

        if (isHiddenCommand(command.name, folder)) {
            continue;
        }

        const entry = entryOf(command, folder);

        byCategory.get(entry.category).push(entry);
    }

    const categories = COMMAND_CATEGORIES
        .map(category => ({
            ...category,
            commands: byCategory.get(category.id)
                .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        }))
        .filter(category => category.commands.length > 0);

    const byName = new Map();

    for (const category of categories) {
        for (const entry of category.commands) {
            byName.set(entry.name, entry);

            for (const alias of entry.aliases) {
                byName.set(alias, entry);
            }
        }
    }

    return {
        categories,
        byName,
        total: categories.reduce((sum, category) => sum + category.commands.length, 0)
    };
}

// O catálogo do que o bot tem carregado agora (ou null, se ainda não carregou).
export function getCatalog() {
    const loaded = comandosCarregados();

    if (!loaded) {
        return null;
    }

    return buildCatalog(loaded.comandos, loaded.origem);
}

export const categoryOfCatalog = (catalog, id) =>
    catalog.categories.find(category => category.id === id) ?? null;

// ==========================================
// ACHAR COMANDOS
// ==========================================

// "/daily", "daily", "hdaily" ou um atalho ("bal") -> o comando, ou null.
export function findCommand(catalog, text) {
    const wanted = plain(text).trim().replace(/^\//, "");

    if (!wanted) {
        return null;
    }

    return (
        catalog.byName.get(wanted) ??
        (wanted.startsWith("h") ? catalog.byName.get(wanted.slice(1)) : undefined) ??
        null
    );
}

// Busca por nome, atalho, descrição e categoria, sem acento. Todos os termos
// precisam aparecer; o nome vale mais que o atalho, e o atalho mais que a descrição.
export function searchCommands(catalog, query, limit = 10) {
    const terms = plain(query).split(/\s+/).filter(Boolean);

    if (terms.length === 0) {
        return [];
    }

    const hits = [];

    for (const category of catalog.categories) {
        for (const entry of category.commands) {
            const name = plain(entry.name);
            const aliases = entry.aliases.map(plain);
            const description = plain(entry.description);

            let score = 0;

            for (const term of terms) {
                if (name === term) score += 20;
                else if (name.startsWith(term)) score += 10;
                else if (name.includes(term)) score += 6;
                else if (aliases.some(alias => alias === term)) score += 8;
                else if (aliases.some(alias => alias.includes(term))) score += 4;
                else if (description.includes(term)) score += 2;
                else if (plain(category.label).includes(term)) score += 1;
                else {
                    score = 0;

                    break;
                }
            }

            if (score > 0) {
                hits.push({ entry, score });
            }
        }
    }

    return hits
        .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name, "pt-BR"))
        .slice(0, limit)
        .map(hit => hit.entry);
}

// ==========================================
// COMO USAR
// ==========================================

// "<usuario> <quantia>" ou "[valor] [tipo]": obrigatórias entre < >, opcionais entre [ ].
export function argumentsOf(entry) {
    return entry.options
        .map(option => option.required ? `<${option.name}>` : `[${option.name}]`)
        .join(" ");
}

export function usageOf(entry) {
    const args = argumentsOf(entry);

    return {
        slash: `/${entry.name}${args ? " " + args : ""}`,
        prefix: `h${entry.name}${args ? " " + args : ""}`
    };
}

const TYPE_LABELS = Object.freeze({
    string: "texto",
    integer: "número inteiro",
    number: "número",
    boolean: "sim ou não",
    user: "jogador (nome, @menção ou ID)",
    channel: "canal",
    role: "cargo"
});

export const typeLabel = type => TYPE_LABELS[type] ?? String(type ?? "texto");
