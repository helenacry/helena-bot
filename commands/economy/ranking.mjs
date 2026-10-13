
import { db } from "../../database/connection.mjs";

import {
    getPlayer,
    formatMoney
} from "../../database/economy.mjs";

import {
    savePlayerName,
    getPlayerName
} from "../../services/player-names.mjs";

import { mention } from "../../services/mentions.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const RANKING_LIMIT = 10;

const RANKING_TYPES = Object.freeze({
    money: {
        name: "Patrimônio",
        emoji: "💰"
    },

    level: {
        name: "Nível",
        emoji: "⭐"
    },

    gems: {
        name: "Gemas",
        emoji: "💎"
    }
});

// ==========================================
// UTILITÁRIOS
// ==========================================

function medal(position) {
    switch (position) {
        case 1:
            return "🥇";

        case 2:
            return "🥈";

        case 3:
            return "🥉";

        default:
            return "#" + position;
    }
}

function formatValue(row, type) {
    switch (type) {
        case "money":
            return formatMoney(row.value);

        case "level":
            return (
                "Nível " +
                row.level +
                " • " +
                row.xp +
                " XP"
            );

        case "gems":
            return (
                Number(row.value).toLocaleString("pt-BR") +
                " 💎"
            );

        default:
            return String(row.value);
    }
}

// Evita que nomes de jogadores sejam interpretados
// como formatação Markdown dentro do embed.
function safeName(value) {
    return String(value)
        .replace(/\\/g, "\\\\")
        .replace(/([*_`~|>])/g, "\\$1")
        .replace(/@/g, "@\u200b")
        .replace(/\n/g, " ")
        .slice(0, 80);
}

function displayName(userId, currentUserId) {
    if (String(userId) === String(currentUserId)) {
        return getPlayerName(userId) || "Você";
    }

    const savedName = getPlayerName(userId);

    if (savedName) {
        return savedName;
    }

    // Ainda sem nome salvo (a pessoa nunca usou um comando da
    // Helena): vale a menção, que a VSync mostra como o nome real.
    return null;
}

// ==========================================
// CONSULTAR RANKING
// ==========================================

function getRanking(guildId, type) {
    switch (type) {
        case "money":
            return db.prepare(`
                SELECT
                    user_id,
                    wallet + bank AS value,
                    level,
                    xp
                FROM players
                WHERE guild_id = ?
                ORDER BY
                    value DESC,
                    xp DESC,
                    user_id ASC
            `).all(guildId);

        case "level":
            return db.prepare(`
                SELECT
                    user_id,
                    level AS value,
                    level,
                    xp
                FROM players
                WHERE guild_id = ?
                ORDER BY
                    level DESC,
                    xp DESC,
                    user_id ASC
            `).all(guildId);

        case "gems":
            return db.prepare(`
                SELECT
                    p.user_id,
                    COALESCE(g.gems, 0) AS value,
                    p.level,
                    p.xp
                FROM players AS p
                LEFT JOIN global_users AS g
                    ON g.user_id = p.user_id
                WHERE p.guild_id = ?
                ORDER BY
                    value DESC,
                    p.xp DESC,
                    p.user_id ASC
            `).all(guildId);

        default:
            throw new Error(
                "Tipo de ranking inválido."
            );
    }
}

// ==========================================
// COMANDO /RANKING
// ==========================================

export default {
    name: "ranking",
    aliases: ["top", "rank"],

    description:
        "Consulte os melhores jogadores do servidor",

    options: [
        {
            name: "tipo",
            description: "Escolha a classificação",
            type: "string",
            required: false,

            choices: [
                {
                    name: "Patrimônio",
                    value: "money"
                },
                {
                    name: "Nível",
                    value: "level"
                },
                {
                    name: "Gemas",
                    value: "gems"
                }
            ]
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Este comando precisa ser utilizado em um servidor."
            );
        }

        try {
            // Garantir cadastro e atualizar nome
            getPlayer(guildId, userId);
            savePlayerName(interaction.user);

            // ==============================
            // TIPO DE CLASSIFICAÇÃO
            // ==============================

            const type =
                interaction.data.options?.tipo ||
                "money";

            const config = RANKING_TYPES[type];

            if (!config) {
                return errorEmbed(
                    "Tipo de ranking inválido."
                );
            }

            // ==============================
            // CONSULTA
            // ==============================

            const ranking = getRanking(
                guildId,
                type
            );

            const top = ranking.slice(
                0,
                RANKING_LIMIT
            );

            // ==============================
            // LINHAS DO RANKING
            // ==============================

            const lines = top.map((row, index) => {
                const position = index + 1;

                const currentUser =
                    String(row.user_id) ===
                    String(userId);

                const savedName = displayName(row.user_id, userId);

                // Com nome salvo, o nome em negrito; sem nome, a menção
                // (chip no embed, sem notificar ninguém).
                const name = savedName
                    ? "**" + safeName(savedName) + "**"
                    : mention(row.user_id);

                const marker = currentUser
                    ? " · Você"
                    : "";

                return [
                    medal(position) +
                        " " +
                        name +
                        marker,

                    formatValue(row, type)
                ].join("\n");
            });

            // ==============================
            // POSIÇÃO DO USUÁRIO
            // ==============================

            const ownIndex = ranking.findIndex(
                row =>
                    String(row.user_id) ===
                    String(userId)
            );

            const ownPosition = ownIndex + 1;

            const ownRow = ownIndex >= 0
                ? ranking[ownIndex]
                : null;

            // Só exibir um campo separado quando
            // o usuário estiver fora do TOP 10.
            const fields = [];

            if (
                ownRow &&
                ownPosition > RANKING_LIMIT
            ) {
                fields.push({
                    name: "📍 Sua posição",

                    value: [
                        medal(ownPosition) +
                            " **" +
                            ownPosition +
                            "º lugar**",

                        formatValue(ownRow, type)
                    ].join("\n"),

                    inline: false
                });
            }

            // ==============================
            // RODAPÉ
            // ==============================

            const positionText = ownRow
                ? "Sua posição: #" + ownPosition
                : "Você ainda não está classificado";

            const footer = [
                positionText,

                ranking.length +
                    " jogadores classificados",

                "Use /ranking tipo para alterar"
            ].join(" • ");

            // ==============================
            // EMBED
            // ==============================

            return embedResponse(
                createEmbed({
                    title:
                        "🏆 Helena Ranking",

                    description: [
                        config.emoji +
                            " **Classificação:** " +
                            config.name,

                        "",

                        lines.length
                            ? lines.join("\n\n")
                            : "Nenhum jogador classificado."
                    ].join("\n"),

                    color: HELENA_COLORS.primary,

                    fields,

                    footer
                })
            );

        } catch (error) {
            console.error("[RANKING]", error);

            return errorEmbed(
                "Não foi possível carregar o ranking."
            );
        }
    }
};