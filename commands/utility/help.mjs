
import {
    embedResponse,
    errorEmbed
} from "../../utils/embed.mjs";

import { COMMAND_CATEGORIES } from "../../config/command-categories.mjs";

import { HELP_CONFIG } from "../../config/help.mjs";

import {
    getCatalog,
    findCommand,
    searchCommands
} from "../../services/command-catalog.mjs";

import {
    buildHelpHome,
    buildHelpCategory,
    buildHelpCommand,
    buildHelpSearch
} from "../../services/help-view.mjs";

// ==========================================
// COMANDO /AJUDA
// ==========================================

// A central de ajuda é um painel (services/help-panel.mjs): o início tem o menu
// de categorias e a busca. A lista de comandos vem dos comandos que o bot
// carregou (services/command-catalog.mjs), então não fica desatualizada.
//
//   /ajuda                       o início
//   /ajuda categoria:combate     direto numa categoria
//   /ajuda comando:daily         direto no detalhe de um comando

function getOption(interaction, name) {
    const options = interaction.data?.options;

    // Opções em formato de objeto.
    if (options && !Array.isArray(options)) {
        const option = options[name];

        if (option && typeof option === "object") {
            return option.value ?? null;
        }

        return option ?? null;
    }

    // Opções em formato de lista.
    if (Array.isArray(options)) {
        return options.find(option => option.name === name)?.value ?? null;
    }

    return null;
}

function reply(view) {
    const response = embedResponse(view.embed);

    // Só quem abriu o painel mexe nos botões e menus.
    response.data.components = view.components;

    return response;
}

export default {
    name: "ajuda",
    aliases: ["help", "comandos"],

    description: "Consulte os comandos e sistemas da Helena",

    options: [
        {
            name: "categoria",
            description: "Abrir já numa categoria de comandos",

            type: "string",
            required: false,

            choices: COMMAND_CATEGORIES.map(category => ({
                name: `${category.emoji} ${category.label}`,
                value: category.id
            }))
        },
        {
            name: "comando",
            description: "Ver os detalhes de um comando (ex.: daily)",

            type: "string",
            required: false
        }
    ],

    async execute(interaction) {
        try {
            const ownerId = interaction.user?.id ?? "0";

            const catalog = getCatalog();

            if (!catalog) {
                return errorEmbed(
                    "Não foi possível carregar a lista de comandos agora."
                );
            }

            const commandText = getOption(interaction, "comando");

            // /ajuda comando:daily abre o detalhe; se não achar, mostra a busca.
            if (commandText) {
                const entry = findCommand(catalog, commandText);

                if (entry) {
                    return reply(buildHelpCommand({ ownerId, catalog, entry }));
                }

                return reply(buildHelpSearch({
                    ownerId,
                    catalog,
                    query: commandText,
                    results: searchCommands(catalog, commandText, HELP_CONFIG.searchLimit)
                }));
            }

            const selected = getOption(interaction, "categoria");

            if (!selected) {
                return reply(buildHelpHome({ ownerId, catalog }));
            }

            const categoryId = String(selected).trim().toLowerCase();

            const view = buildHelpCategory({ ownerId, catalog, categoryId, page: 1 });

            if (!view) {
                return errorEmbed(
                    "Categoria inválida. Use `/ajuda` para ver as opções."
                );
            }

            return reply(view);

        } catch (error) {
            console.error("[AJUDA]", error);

            return errorEmbed(
                "Não foi possível carregar a central de ajuda."
            );
        }
    }
};
