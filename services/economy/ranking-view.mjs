
import { db } from "../../database/connection.mjs";

import { formatMoney } from "../../database/economy.mjs";

import { getPlayerName } from "../platform/player-names.mjs";

import { mention } from "../platform/mentions.mjs";

import { button, row } from "../panels/panel-kit.mjs";

import {
    container,
    divider,
    subtext,
    text
} from "../../utils/components-v2.mjs";

import {
    createEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

import { plural } from "../../utils/plural.mjs";

// ==========================================
// TELA DO /RANKING
// ==========================================

// Três classificações (patrimônio, nível e gemas) com os 10 primeiros. Os botões de baixo
// trocam de classificação na mesma mensagem: rank:tipo:<dono>:<tipo> (ranking-panel.mjs).

export const RANKING_LIMIT = 10;

export const RANKING_TYPES = Object.freeze({
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
        .replace(/@/g, "@​")
        .replace(/\n/g, " ")
        .slice(0, 80);
}

function displayName(userId, currentUserId) {
    if (String(userId) === String(currentUserId)) {
        return getPlayerName(userId) || "Você";
    }

    // Ainda sem nome salvo (a pessoa nunca usou um comando da
    // Helena): vale a menção, que a VSync mostra como o nome real.
    return getPlayerName(userId) || null;
}

// ==========================================
// CONSULTA
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
// A TELA
// ==========================================

// Devolve { embed, components, layout }. Lança Error se o tipo não existe.
export function buildRanking({ guildId, userId, type = "money" }) {
    const config = RANKING_TYPES[type];

    if (!config) {
        throw new Error("Tipo de ranking inválido.");
    }

    const ranking = getRanking(guildId, type);

    const top = ranking.slice(0, RANKING_LIMIT);

    // ==============================
    // POSIÇÃO DE QUEM PEDIU
    // ==============================

    const ownIndex = ranking.findIndex(
        entry => String(entry.user_id) === String(userId)
    );

    const ownPosition = ownIndex + 1;

    const ownRow = ownIndex >= 0 ? ranking[ownIndex] : null;

    // Só exibir um campo separado quando quem pediu estiver fora do TOP 10.
    const outside = Boolean(ownRow) && ownPosition > RANKING_LIMIT;

    const footer = [
        ownRow
            ? "Sua posição: #" + ownPosition
            : "Você ainda não está classificado",

        "os botões trocam a classificação"
    ].join(" · ");

    // ==============================
    // CLÁSSICO
    // ==============================

    const lines = top.map((entry, index) => {
        const savedName = displayName(entry.user_id, userId);

        // Com nome salvo, o nome em negrito; sem nome, a menção
        // (chip no embed, sem notificar ninguém).
        const name = savedName
            ? "**" + safeName(savedName) + "**"
            : mention(entry.user_id);

        const marker = String(entry.user_id) === String(userId) ? " · Você" : "";

        return medal(index + 1) + " " + name + marker + " — " + formatValue(entry, type);
    });

    const fields = outside
        ? [{
            name: "📍 Sua posição",

            value: medal(ownPosition) + " **" + ownPosition + "º lugar** — " + formatValue(ownRow, type),

            inline: false
        }]
        : [];

    const embed = createEmbed({
        section: "Ranking",
        title: "🏆 Ranking · " + config.name,

        description: [
            config.emoji + " **" + plural(ranking.length, "jogador classificado", "jogadores classificados") + "**",

            "",

            lines.length
                ? lines.join("\n")
                : "Nenhum jogador classificado."
        ].join("\n"),

        color: HELENA_COLORS.primary,
        mood: "festa",

        fields,

        footer
    });

    // ==============================
    // BOTÕES: trocar de classificação
    // ==============================

    const controls = row(
        ...Object.entries(RANKING_TYPES).map(([value, entry]) => button(
            `rank:tipo:${userId}:${value}`,
            entry.name,
            entry.emoji,
            value === type ? "primary" : "secondary",
            { disabled: value === type }
        ))
    );

    // ==============================
    // V2: uma linha por jogador
    // ==============================

    // Sem nome salvo, o V2 não menciona (uma menção no texto pode notificar a pessoa):
    // vale "Jogador" com o fim do ID.
    const v2Name = (id, saved) => saved
        ? safeName(saved)
        : `Jogador #${String(id).slice(-4)}`;

    const v2Lines = top.map((entry, index) => {
        const own = String(entry.user_id) === String(userId);

        return (
            `${medal(index + 1)} **${v2Name(entry.user_id, displayName(entry.user_id, userId))}**` +
            `${own ? " · Você" : ""} — ${formatValue(entry, type)}`
        );
    });

    const layout = [
        container([
            text("-# HELENA · RANKING"),

            text(`## 🏆 Ranking · ${config.name}`),

            text(`${config.emoji} ${plural(ranking.length, "jogador classificado", "jogadores classificados")}`),

            divider(),

            text(v2Lines.length ? v2Lines.join("\n") : "Nenhum jogador classificado."),

            ...(outside
                ? [
                    divider(),
                    text(`📍 **Sua posição:** ${ownPosition}º lugar — ${formatValue(ownRow, type)}`)
                ]
                : []),

            divider(),

            controls
        ], { color: HELENA_COLORS.primary }),

        subtext(footer)
    ];

    return {
        embed,
        components: [controls],
        layout
    };
}
