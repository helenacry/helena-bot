import { getCatalog, findCommand, searchCommands } from "../platform/command-catalog.mjs";

import { HELP_CONFIG } from "../../config/help.mjs";

import {
    buildHelpHome,
    buildHelpCategory,
    buildHelpCommand,
    buildHelpSearch,
    buildHelpClosed
} from "./help-view.mjs";

import {
    openModal,
    textField,
    readFields
} from "./modals.mjs";

import {
    notYours,
    priv,
    sameUser,
    update,
    warn
} from "./panel-kit.mjs";

// ==========================================
// CENTRAL DE AJUDA: CLIQUES E FORMULÁRIO
// ==========================================

const noop = { type: "defer_update" };

const unavailable = () => warn(
    "Ajuda indisponível",
    "Não consegui carregar a lista de comandos agora. Tente de novo em instantes."
);

// A tela da busca, como mensagem nova só da pessoa (o formulário não edita a
// mensagem do painel).
function privateMessage(view) {
    return priv({
        type: "message",
        data: {
            embeds: [view.embed],
            components: view.components
        }
    });
}

// customId: ajuda:<ação>:<dono>[:<categoria>:<página>]
export function handleHelpClick(interaction) {
    const [, action, ownerId, a, b] = String(
        interaction.data?.customId || ""
    ).split(":");

    if (!sameUser(interaction, ownerId)) {
        return notYours();
    }

    if (action === "noop") {
        return noop;
    }

    if (action === "fechar") {
        return update(buildHelpClosed());
    }

    if (action === "buscar") {
        return openModal({
            customId: "ajuda:buscar",
            title: "Buscar um comando",
            fields: [
                textField({
                    id: "termo",
                    label: "O que você procura?",
                    placeholder: "Ex.: daily, arma, dinheiro sujo, casamento",
                    minLength: 2,
                    maxLength: 60
                })
            ]
        });
    }

    const catalog = getCatalog();

    if (!catalog) {
        return unavailable();
    }

    if (action === "home") {
        return update(buildHelpHome({ ownerId, catalog }));
    }

    // menu de categorias (o valor escolhido é o id da categoria)
    if (action === "cat") {
        const view = buildHelpCategory({
            ownerId,
            catalog,
            categoryId: interaction.data?.values?.[0],
            page: 1
        });

        return view
            ? update(view)
            : warn("Categoria inválida", "Escolha uma categoria da lista.");
    }

    // botões Anterior e Próxima: a, b = categoria e página
    if (action === "pg") {
        const view = buildHelpCategory({ ownerId, catalog, categoryId: a, page: Number(b) });

        return view
            ? update(view)
            : warn("Categoria inválida", "Abra a ajuda de novo com `/ajuda`.");
    }

    // menu de comandos (o valor escolhido é o nome do comando)
    if (action === "cmd") {
        const entry = findCommand(catalog, interaction.data?.values?.[0]);

        if (!entry) {
            return warn("Comando não encontrado", "Esse comando não existe mais. Abra a ajuda de novo com `/ajuda`.");
        }

        return update(buildHelpCommand({
            ownerId,
            catalog,
            entry,
            from: { categoryId: a, page: Number(b) || 1 }
        }));
    }

    return warn("Botão desconhecido", "Esse botão não é reconhecido.");
}

// customId do formulário: ajuda:buscar (o envio só chega a quem o abriu)
export async function handleHelpModal(interaction) {
    const [, action] = String(interaction.data?.customId || "").split(":");

    if (action !== "buscar") {
        return warn("Formulário desconhecido", "Esse formulário não é reconhecido.");
    }

    const catalog = getCatalog();

    if (!catalog) {
        return unavailable();
    }

    const query = (readFields(interaction).termo ?? "").trim();

    if (query.length < 2) {
        return warn("Busca curta demais", "Escreva pelo menos 2 letras.");
    }

    const view = buildHelpSearch({
        ownerId: interaction.user.id,
        catalog,
        query,
        results: searchCommands(catalog, query, HELP_CONFIG.searchLimit)
    });

    return privateMessage(view);
}
