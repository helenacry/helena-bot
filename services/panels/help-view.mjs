import { HELP_CONFIG } from "../../config/help.mjs";

import { SITE_URL, WIKI_URL, SUPPORT_URL } from "../../config/site.mjs";

import {
    categoryOfCatalog,
    usageOf,
    typeLabel
} from "../platform/command-catalog.mjs";

import {
    createEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

import {
    container,
    divider,
    section,
    subtext,
    text
} from "../../utils/components-v2.mjs";

import { button, row } from "./panel-kit.mjs";

// ==========================================
// TELAS DA CENTRAL DE AJUDA
// ==========================================

// A ajuda é um painel: abre no início, com um menu de categorias; cada categoria
// lista os comandos (6 por página); um menu leva ao detalhe de cada comando; e o
// botão Buscar abre um formulário (modal) para achar um comando pelo nome ou
// pelo que ele faz. Toda a navegação está nos customIds, então nada fica em memória.
//
//   ajuda:home:<dono>                     início
//   ajuda:cat:<dono>                      menu de categorias (valor = categoria)
//   ajuda:pg:<dono>:<categoria>:<n>       página n de uma categoria
//   ajuda:cmd:<dono>:<categoria>:<n>      menu de comandos (valor = comando)
//   ajuda:ver:<dono>:<categoria>:<n>:<comando>   botão Ver ao lado de um comando (só no V2)
//   ajuda:buscar:<dono>                   abre o formulário de busca
//   ajuda:fechar:<dono>                   fecha o painel
//
// "-" no lugar da categoria quer dizer "veio da busca ou do início".

const NO_CATEGORY = "-";

const clip = (text, max) => {
    const value = String(text ?? "");

    return value.length > max ? value.slice(0, max - 1) + "…" : value;
};

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const codes = list => list.map(item => `\`${item}\``).join(", ");

// ==========================================
// PEÇAS COMUNS
// ==========================================

function categoryMenu(ownerId, catalog, selected) {
    return row({
        type: "select",
        customId: `ajuda:cat:${ownerId}`,
        placeholder: "Selecione uma categoria",
        minValues: 1,
        maxValues: 1,
        options: catalog.categories.map(category => ({
            label: clip(`${category.emoji} ${category.label} (${category.commands.length})`, 100),
            value: category.id,
            description: clip(HELP_CONFIG.blurbs[category.id] ?? "", 100),
            default: category.id === selected
        }))
    });
}

// Menu com comandos, para abrir o detalhe de um deles.
function commandMenu(ownerId, entries, categoryId, page, placeholder = "🔎 Ver detalhes de um comando") {
    return row({
        type: "select",
        customId: `ajuda:cmd:${ownerId}:${categoryId}:${page}`,
        placeholder,
        minValues: 1,
        maxValues: 1,
        options: entries.slice(0, 25).map(entry => ({
            label: clip(`/${entry.name}`, 100),
            value: entry.name,
            description: clip(entry.description, 100)
        }))
    });
}

const searchButton = ownerId => button(`ajuda:buscar:${ownerId}`, "Buscar", "🔎", "primary");
const homeButton = ownerId => button(`ajuda:home:${ownerId}`, "Início", "🏠", "secondary");
const closeButton = ownerId => button(`ajuda:fechar:${ownerId}`, "Fechar", "✖️", "danger");

// ==========================================
// INÍCIO
// ==========================================

// Os links do menu: o site, o painel do jogador e a
// privacidade. Botões de link não levam customId.
const linkButton = (label, emoji, url) => ({ type: "button", style: "link", label, emoji, url });

export const helpLinks = () => [
    linkButton("Website", "🌐", SITE_URL),
    linkButton("Painel do jogador", "🎮", `${SITE_URL}account/`),
    linkButton("Privacidade", "🔒", `${SITE_URL}privacy/`)
];

// O início é só isto: o prefixo, a chamada, o menu de categorias, duas
// dicas e os três links. Nada de lista de categorias nem de explicação das opções: isso vem quando
// a pessoa escolhe uma categoria.
export function buildHelpHome({ ownerId, catalog }) {
    const intro = [
        "-# Prefixo neste servidor: `h`",
        "Encontre o que precisa escolhendo uma categoria abaixo."
    ];

    const tips = [
        `💬 Dúvidas? Use \`/ajuda comando:daily\` ou entre no [servidor oficial](${SUPPORT_URL}).`,
        `📖 Resumo de cada sistema do jogo: [wiki](${WIKI_URL}).`
    ];

    // O clássico: um embed sem autor, miniatura nem rodapé, com o menu e os links embaixo.
    const embed = createEmbed({
        title: "📚 Menu de comandos",
        description: [...intro, "", ...tips].join("\n"),
        color: HELENA_COLORS.primary,
        footer: "",
        timestamp: false
    });

    // O V2: tudo dentro de um cartão só, com o menu no meio.
    const layout = [
        container([
            text("## 📚 Menu de comandos"),

            text(intro.join("\n")),

            categoryMenu(ownerId, catalog, null),

            divider(),

            text(tips.join("\n")),

            row(...helpLinks())
        ], { color: HELENA_COLORS.primary })
    ];

    return {
        embed,

        layout,

        components: [
            categoryMenu(ownerId, catalog, null),
            row(...helpLinks())
        ]
    };
}

// ==========================================
// CATEGORIA
// ==========================================

export function pagesOf(category) {
    return Math.max(1, Math.ceil(category.commands.length / HELP_CONFIG.pageSize));
}

// Devolve null se a categoria não existe.
export function buildHelpCategory({ ownerId, catalog, categoryId, page = 1 }) {
    const category = categoryOfCatalog(catalog, categoryId);

    if (!category) {
        return null;
    }

    const pages = pagesOf(category);

    const current = Math.min(pages, Math.max(1, Math.trunc(Number(page)) || 1));

    const slice = category.commands.slice(
        (current - 1) * HELP_CONFIG.pageSize,
        current * HELP_CONFIG.pageSize
    );

    const fields = slice.map(entry => {
        const usage = usageOf(entry);

        const lines = [
            entry.description,
            `\`${usage.slash}\``
        ];

        if (entry.aliases.length > 0) {
            lines.push(`Atalhos: ${codes(entry.aliases.map(alias => "/" + alias))}`);
        }

        return {
            name: `/${entry.name}`,
            value: lines.join("\n"),
            inline: false
        };
    });

    const embed = createEmbed({
        section: "Ajuda",
        title: `${category.emoji} ${category.label}`,

        description: [
            HELP_CONFIG.blurbs[category.id] ?? "",
            "",
            "Escolha um comando no menu para ver as opções e como usar."
        ].join("\n"),

        color: HELENA_COLORS.primary,
        mood: "feliz",

        fields,

        footer: `Página ${current}/${pages} · ${plural(category.commands.length, "comando", "comandos")}`
    });

    const navigation = row(
        button(`ajuda:pg:${ownerId}:${category.id}:${current - 1}`, "Anterior", "◀️", "secondary", { disabled: current <= 1 }),
        button(`ajuda:noop:${ownerId}`, `${current}/${pages}`, undefined, "secondary", { disabled: true }),
        button(`ajuda:pg:${ownerId}:${category.id}:${current + 1}`, "Próxima", "▶️", "secondary", { disabled: current >= pages }),
        homeButton(ownerId),
        closeButton(ownerId)
    );

    // O V2: cada comando é uma seção com o botão Ver ao lado (no lugar do menu de comandos).
    const layout = [
        container([
            text("-# HELENA · AJUDA"),

            text(`## ${category.emoji} ${category.label}`),

            text(`${HELP_CONFIG.blurbs[category.id] ?? ""}\nToque em **Ver** para as opções e como usar.`.trim()),

            divider(),

            ...slice.map(entry => {
                const usage = usageOf(entry);

                const aliases = entry.aliases.length > 0
                    ? ` (${entry.aliases.map(alias => "/" + alias).join(", ")})`
                    : "";

                return section(
                    [
                        `**/${entry.name}**${aliases}`,
                        `${entry.description}\n\`${usage.slash}\``
                    ],
                    button(`ajuda:ver:${ownerId}:${category.id}:${current}:${entry.name}`, "Ver", "🔎", "secondary")
                );
            }),

            divider(),

            categoryMenu(ownerId, catalog, category.id),

            navigation
        ], { color: HELENA_COLORS.primary }),

        subtext(`Página ${current}/${pages} · ${plural(category.commands.length, "comando", "comandos")}`)
    ];

    return {
        embed,
        page: current,
        pages,

        layout,

        components: [
            categoryMenu(ownerId, catalog, category.id),

            commandMenu(ownerId, slice, category.id, current),

            navigation
        ]
    };
}

// ==========================================
// DETALHE DE UM COMANDO
// ==========================================

// from = { categoryId, page } leva o botão "Voltar" de volta à página de onde
// a pessoa veio; sem isso, o botão volta ao início.
export function buildHelpCommand({ ownerId, catalog, entry, from = null }) {
    const category = categoryOfCatalog(catalog, entry.category);

    const usage = usageOf(entry);

    const fields = [
        {
            name: "📝 Como usar",
            value: [
                `**De barra:** \`${usage.slash}\``,
                `**Com prefixo:** \`${usage.prefix}\``
            ].join("\n"),
            inline: false
        }
    ];

    if (entry.options.length > 0) {
        const lines = entry.options.map(option => {
            const parts = [
                `\`${option.name}\` (${option.required ? "obrigatória" : "opcional"}, ${typeLabel(option.type)})`,
                option.description
            ].filter(Boolean);

            let line = "• " + parts.join(": ");

            if (Array.isArray(option.choices) && option.choices.length > 0) {
                line += `\n  Valores: ${codes(option.choices.map(choice => choice.value ?? choice.name))}`;
            }

            return line;
        });

        fields.push({
            name: "⚙️ Opções",
            value: lines.join("\n"),
            inline: false
        });
    }

    if (entry.aliases.length > 0) {
        fields.push({
            name: "🔁 Atalhos",
            value: `${codes(entry.aliases.map(alias => "/" + alias))}\nFuncionam igual ao comando.`,
            inline: true
        });
    }

    fields.push({
        name: "📂 Categoria",
        value: category ? `${category.emoji} ${category.label}` : entry.category,
        inline: true
    });

    if (entry.blockedInPrison) {
        fields.push({
            name: "🚔 Na cadeia",
            value: "Fica bloqueado enquanto você cumpre pena.",
            inline: true
        });
    }

    const embed = createEmbed({
        section: "Ajuda",
        title: `${category?.emoji ?? "📖"} /${entry.name}`,
        description: entry.description,
        color: HELENA_COLORS.primary,
        mood: "feliz",
        fields,
        footer: "O menu de categorias volta ao início da ajuda"
    });

    const back = from?.categoryId && from.categoryId !== NO_CATEGORY
        ? button(`ajuda:pg:${ownerId}:${from.categoryId}:${from.page ?? 1}`, "Voltar", "◀️", "secondary")
        : homeButton(ownerId);

    return {
        embed,

        components: [
            row(
                back,
                searchButton(ownerId),
                ...(back.customId.startsWith("ajuda:pg:") ? [homeButton(ownerId)] : []),
                closeButton(ownerId)
            )
        ]
    };
}

// ==========================================
// RESULTADO DA BUSCA
// ==========================================

export function buildHelpSearch({ ownerId, catalog, query, results }) {
    const shown = clip(String(query ?? "").trim(), 80);

    if (results.length === 0) {
        return {
            embed: createEmbed({
                section: "Ajuda",
                title: "🔎 Nada encontrado",

                description: [
                    `Não achei nenhum comando para **${shown}**.`,
                    "",
                    "Tente outra palavra: o nome do comando (`daily`), um atalho (`bal`) " +
                    "ou o que ele faz (`dinheiro`, `arma`, `casamento`)."
                ].join("\n"),

                color: HELENA_COLORS.warning,
                mood: "triste",

                footer: "Também dá para escolher uma categoria no menu"
            }),

            components: [
                categoryMenu(ownerId, catalog, null),
                row(searchButton(ownerId), homeButton(ownerId), closeButton(ownerId))
            ]
        };
    }

    const lines = results.map(entry => {
        const aliases = entry.aliases.length > 0
            ? ` (${entry.aliases.map(alias => "/" + alias).join(", ")})`
            : "";

        return `**/${entry.name}**${aliases}\n${entry.description}`;
    });

    return {
        embed: createEmbed({
            section: "Ajuda",
            title: "🔎 Resultado da busca",

            description: [
                `Comandos para **${shown}**:`,
                "",
                lines.join("\n\n")
            ].join("\n"),

            color: HELENA_COLORS.primary,
            mood: "feliz",

            footer: plural(results.length, "resultado", "resultados")
        }),

        components: [
            commandMenu(ownerId, results, NO_CATEGORY, 1, "📖 Abrir um resultado"),
            row(searchButton(ownerId), homeButton(ownerId), closeButton(ownerId))
        ]
    };
}

// ==========================================
// PAINEL FECHADO
// ==========================================

export function buildHelpClosed() {
    return {
        embed: createEmbed({
            section: "Ajuda",
            title: "📖 Ajuda fechada",
            description: "Use `/ajuda` para abrir de novo.",
            color: HELENA_COLORS.wait,
            mood: "dormindo",
            footer: "Qualquer dúvida, é só chamar"
        }),

        components: []
    };
}
