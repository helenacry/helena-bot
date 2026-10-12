
import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const PREFIX = "h";

const CATEGORIES = {
    economia: {
        emoji: "💰",
        name: "Economia",
        description: "Gerencie seu dinheiro e desenvolva sua conta.",
        commands: [
            ["daily", "Resgate sua recompensa diária."],
            ["perfil", "Consulte seu perfil econômico."],
            ["ranking", "Veja a classificação dos jogadores."]
        ]
    },

    progresso: {
        emoji: "🏆",
        name: "Progresso",
        description: "Acompanhe sua evolução e desbloqueie recompensas.",
        commands: [
            ["conquistas", "Consulte conquistas e seus requisitos."],
            ["titulos", "Veja os títulos disponíveis para você."],
            ["equipartitulo", "Equipe um título desbloqueado."],
            ["desequipartitulo", "Remova seu título atual."]
        ]
    },

    combate: {
        emoji: "⚔️",
        name: "Combate",
        description: "Desafie jogadores e desenvolva sua carreira PvP.",
        commands: [
            // Adicione aqui os nomes exatos dos comandos
            // existentes na sua pasta commands/.
        ]
    },

    social: {
        emoji: "💍",
        name: "Social",
        description: "Interaja com outros jogadores.",
        commands: [
            // Adicione aqui os comandos sociais existentes.
        ]
    },

    outros: {
        emoji: "⚙️",
        name: "Outros",
        description: "Informações e recursos adicionais.",
        commands: [
            ["ajuda", "Abra esta central de ajuda."]
        ]
    }
};

// ==========================================
// UTILITÁRIOS
// ==========================================

function getOption(interaction, name) {
    const options = interaction.data?.options;

    // Compatibilidade com opções em formato de objeto.
    if (options && !Array.isArray(options)) {
        const option = options[name];

        if (option && typeof option === "object") {
            return option.value ?? null;
        }

        return option ?? null;
    }

    // Compatibilidade com opções em formato de array.
    if (Array.isArray(options)) {
        return options.find(
            option => option.name === name
        )?.value ?? null;
    }

    return null;
}

function formatCommand(command) {
    const [name, description] = command;

    return (
        "**`" + PREFIX + name + "`**\n" +
        description
    );
}

function createMainHelp() {
    const fields = Object.entries(CATEGORIES).map(
        ([id, category]) => ({
            name:
                category.emoji +
                " " +
                category.name,

            value:
                category.description +
                "\n`hajuda categoria:" +
                id +
                "`",

            inline: false
        })
    );

    return createEmbed({
        title: "📖 Helena • Central de Ajuda",

        description: [
            "Bem-vindo à **Helena**!",
            "",
            "Explore os sistemas do bot e descubra",
            "os comandos disponíveis em cada categoria.",
            "",
            "**Como utilizar:**",
            "Use `hajuda` para abrir este menu ou",
            "`hajuda categoria:economia` para ver os comandos",
            "de uma categoria específica."
        ].join("\n"),

        color: HELENA_COLORS.primary,

        fields,

        footer:
            "Helena • Sua jornada começa aqui."
    });
}

function createCategoryHelp(categoryId) {
    const category = CATEGORIES[categoryId];

    if (!category) {
        return null;
    }

    const commandsText = category.commands.length
        ? category.commands
            .map(formatCommand)
            .join("\n\n")
        : "Os comandos desta categoria serão adicionados em breve.";

    return createEmbed({
        title:
            category.emoji +
            " Helena • " +
            category.name,

        description: [
            category.description,
            "",
            commandsText,
            "",
            "Use `/ajuda` para voltar ao menu principal."
        ].join("\n"),

        color: HELENA_COLORS.primary,

        footer:
            "Helena • Central de Ajuda"
    });
}

// ==========================================
// COMANDO /AJUDA
// ==========================================

export default {
    name: "ajuda",
    aliases: ["help", "comandos"],

    description:
        "Consulte os comandos e sistemas da Helena.",

    options: [
        {
            name: "categoria",
            description:
                "Escolha a categoria de comandos que deseja consultar.",

            type: "string",
            required: false,

            choices: [
                {
                    name: "💰 Economia",
                    value: "economia"
                },
                {
                    name: "🏆 Progresso",
                    value: "progresso"
                },
                {
                    name: "⚔️ Combate",
                    value: "combate"
                },
                {
                    name: "💍 Social",
                    value: "social"
                },
                {
                    name: "⚙️ Outros",
                    value: "outros"
                }
            ]
        }
    ],

    async execute(interaction) {
        try {
            const selectedCategory = getOption(
                interaction,
                "categoria"
            );

            // Exibir menu principal.
            if (!selectedCategory) {
                return embedResponse(
                    createMainHelp()
                );
            }

            const categoryId = String(
                selectedCategory
            ).trim().toLowerCase();

            // Validar categoria.
            if (!CATEGORIES[categoryId]) {
                return errorEmbed(
                    "Categoria inválida. Utilize `/ajuda` para consultar as opções disponíveis."
                );
            }

            // Exibir comandos da categoria.
            return embedResponse(
                createCategoryHelp(categoryId)
            );

        } catch (error) {
            console.error("[AJUDA]", error);

            return errorEmbed(
                "Não foi possível carregar a central de ajuda."
            );
        }
    }
};