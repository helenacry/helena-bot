
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

import { calculateLevel } from "../progress/experience.mjs";

import { globalRanking } from "./global-ranking.mjs";

// ==========================================
// TELA DO /RANKING
// ==========================================

// Três classificações (patrimônio, nível e gemas) com os 10 primeiros, em dois alcances: o do
// servidor (o padrão) e o global, que junta todos os servidores (global-ranking.mjs; o primeiro do XP
// global é quem o status do bot mostra). Os botões de baixo trocam de classificação e de alcance na
// mesma mensagem (ranking-panel.mjs):
//
//   rank:tipo:<dono>:<tipo>          classificação do servidor
//   rank:tipo:<dono>:<tipo>:g        classificação global
//   rank:escopo:<dono>:<s|g>:<tipo>  troca o alcance (e leva o tipo, se ele existir no novo)

export const RANKING_LIMIT = 10;

// Os dois alcances do ranking. "s" e "g" são o que vai nos customIds.
export const RANKING_SCOPES = Object.freeze({
    server: { code: "s", name: "Neste servidor", emoji: "🏠" },
    global: { code: "g", name: "Global", emoji: "🌐" }
});

// As classificações do ranking global: o nível vira "XP total" (a soma entre os servidores).
export const GLOBAL_RANKING_TYPES = Object.freeze({
    xp: {
        name: "XP total",
        emoji: "✨"
    },

    money: {
        name: "Patrimônio",
        emoji: "💰"
    },

    gems: {
        name: "Gemas",
        emoji: "💎"
    }
});

// Ao trocar de alcance, o tipo vai junto: patrimônio e gemas existem nos dois; o nível do servidor
// é o XP total do global (e vice-versa).
export function typeForScope(type, scope) {
    const types = scope === "global" ? GLOBAL_RANKING_TYPES : RANKING_TYPES;

    if (types[type]) return type;

    if (scope === "global" && type === "level") return "xp";
    if (scope !== "global" && type === "xp") return "level";

    return scope === "global" ? "xp" : "money";
}

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
        case "xp": {
            const xp = Number(row.value);

            return (
                xp.toLocaleString("pt-BR") +
                " XP • nível " +
                calculateLevel(xp)
            );
        }

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
    // Helena): vale a menção, que o Discord mostra como o nome real.
    return getPlayerName(userId) || null;
}

// ==========================================
// CONSULTA
// ==========================================

function getRanking(guildId, type, scope = "server") {
    if (scope === "global") {
        return globalRanking(type);
    }

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
export function buildRanking({ guildId, userId, type = "money", scope = "server" }) {
    const isGlobal = scope === "global";

    const config = (isGlobal ? GLOBAL_RANKING_TYPES : RANKING_TYPES)[type];

    if (!config) {
        throw new Error("Tipo de ranking inválido.");
    }

    const ranking = getRanking(guildId, type, scope);

    // Os botões e o texto do alcance global (o servidor segue como sempre foi).
    const suffix = isGlobal ? ":g" : "";
    const where = isGlobal ? " global" : "";

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
            ? (isGlobal ? "Sua posição global: #" : "Sua posição: #") + ownPosition
            : "Você ainda não está classificado",

        "os botões trocam a classificação" + (isGlobal ? " e o alcance" : "")
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
            name: isGlobal ? "📍 Sua posição global" : "📍 Sua posição",

            value: medal(ownPosition) + " **" + ownPosition + "º lugar** — " + formatValue(ownRow, type),

            inline: false
        }]
        : [];

    const embed = createEmbed({
        section: "Ranking",
        title: "🏆 Ranking" + where + " · " + config.name,

        description: [
            config.emoji + " **" + plural(ranking.length, "jogador classificado", "jogadores classificados") +
                (isGlobal ? " em todos os servidores" : "") + "**",

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
        ...Object.entries(isGlobal ? GLOBAL_RANKING_TYPES : RANKING_TYPES).map(([value, entry]) => button(
            `rank:tipo:${userId}:${value}${suffix}`,
            entry.name,
            entry.emoji,
            value === type ? "primary" : "secondary",
            { disabled: value === type }
        ))
    );

    // E o alcance: neste servidor ou em todos (o atual fica desligado).
    const scopes = row(
        ...Object.entries(RANKING_SCOPES).map(([value, entry]) => button(
            `rank:escopo:${userId}:${entry.code}:${type}`,
            entry.name,
            entry.emoji,
            value === scope ? "primary" : "secondary",
            { disabled: value === scope }
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

            text(`## 🏆 Ranking${where} · ${config.name}`),

            text(`${config.emoji} ${plural(ranking.length, "jogador classificado", "jogadores classificados")}${isGlobal ? " em todos os servidores" : ""}`),

            divider(),

            text(v2Lines.length ? v2Lines.join("\n") : "Nenhum jogador classificado."),

            ...(outside
                ? [
                    divider(),
                    text(`📍 **Sua posição${where}:** ${ownPosition}º lugar — ${formatValue(ownRow, type)}`)
                ]
                : []),

            divider(),

            controls,

            scopes
        ], { color: HELENA_COLORS.primary }),

        subtext(footer)
    ];

    return {
        embed,
        components: [controls, scopes],
        layout
    };
}
