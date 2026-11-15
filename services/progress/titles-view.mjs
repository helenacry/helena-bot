import {
    ACHIEVEMENT_RARITIES,
    getAchievement,
    getAchievementRarity,
    getAllAchievements
} from "../../config/achievements.mjs";

import {
    checkAchievements,
    getAvailableTitles,
    getEquippedTitle
} from "./achievements.mjs";

import { button, row } from "../panels/panel-kit.mjs";

import {
    container,
    divider,
    section,
    subtext,
    text
} from "../../utils/components-v2.mjs";

import {
    createEmbed,
    embedResponse,
    HELENA_COLORS
} from "../../utils/embed.mjs";

import { plural } from "../../utils/plural.mjs";

// ==========================================
// A TELA DOS TÍTULOS
// ==========================================

// Uma tela só para /titulos, /equipartitulo e /desequipartitulo: os títulos que você já desbloqueou, cinco por página,
// cada um com um botão para equipar. Os botões (services/panels/titles-panel.mjs):
//
//   tit:eq:<dono>:<página>:<conquista>   equipa o título (e a tela se refaz, na mesma página)
//   tit:rem:<dono>:<página>              tira o título equipado
//   tit:pg:<dono>:<página>               troca de página
//   tit:noop:<dono>:<qual>               botão desligado (o indicador de página e o título já equipado); cada um tem o seu ID, o Discord não aceita dois iguais
//
// Só quem abriu a tela mexe nela. O equipar também continua pelo comando: /equipartitulo titulo:<id>.

export const TITLES_PAGE_SIZE = 5;

// Do mais raro ao mais comum: o que a pessoa mais quer mostrar vem primeiro.
const RARITY_ORDER = Object.keys(ACHIEVEMENT_RARITIES).reverse();

function sorted(titles) {
    return [...titles].sort((a, b) =>
        RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) ||
        a.name.localeCompare(b.name, "pt-BR")
    );
}

// Devolve { embed, components, layout }. "notice" é uma linha de aviso no topo (o que acabou de acontecer).
export function buildTitles({ guildId, userId, page = 1, notice = null }) {
    // conquistas que já podem ser desbloqueadas entram antes de a lista ser lida
    checkAchievements(guildId, userId);

    const titles = sorted(getAvailableTitles(guildId, userId));

    const equipped = getEquippedTitle(guildId, userId);

    const total = getAllAchievements().length;

    const pages = Math.max(1, Math.ceil(titles.length / TITLES_PAGE_SIZE));

    const current = Math.min(Math.max(1, Math.trunc(Number(page)) || 1), pages);

    const shown = titles.slice((current - 1) * TITLES_PAGE_SIZE, current * TITLES_PAGE_SIZE);

    const currentLine = equipped ? `✨ Título atual: **${equipped.formatted}**` : "✨ Título atual: nenhum";

    const count = `${plural(titles.length, "título desbloqueado", "títulos desbloqueados")} de ${total}`;

    // "·" separa os pedaços: cada um é traduzido por si (o tradutor divide a linha neles)
    const pageNote = pages > 1 ? ` · página ${current}/${pages}` : "";

    // ==================================
    // SEM NENHUM TÍTULO
    // ==================================

    if (titles.length === 0) {
        const say = "Complete conquistas para receber títulos novos.\nUse `/conquistas` para consultar seu progresso.";

        return {
            embed: createEmbed({
                section: "Títulos",
                title: "🏷️ Nenhum título ainda",
                description: (notice ? notice + "\n\n" : "") + say,
                color: HELENA_COLORS.wait,
                mood: "dormindo",
                footer: "Cada conquista libera um título"
            }),

            components: [],

            layout: [
                container([
                    text("-# HELENA · TÍTULOS"),
                    text("## 🏷️ Nenhum título ainda"),
                    ...(notice ? [text(notice)] : []),
                    text(say)
                ], { color: HELENA_COLORS.wait }),

                subtext("Cada conquista libera um título")
            ]
        };
    }

    // ==================================
    // OS BOTÕES
    // ==================================

    const equippedId = equipped?.achievementId ?? null;

    const equipButton = title => title.id === equippedId
        ? button(`tit:noop:${userId}:eq:${title.id}`, "Equipado", "✅", "success", { disabled: true })
        : button(`tit:eq:${userId}:${current}:${title.id}`, "Equipar", "✨", "primary");

    const navigation = [];

    if (pages > 1) {
        navigation.push(
            button(`tit:pg:${userId}:${current - 1}`, "Anterior", "◀️", "secondary", { disabled: current <= 1 }),
            button(`tit:noop:${userId}:pg`, `${current}/${pages}`, null, "secondary", { disabled: true }),
            button(`tit:pg:${userId}:${current + 1}`, "Próxima", "▶️", "secondary", { disabled: current >= pages })
        );
    }

    if (equippedId) {
        navigation.push(button(`tit:rem:${userId}:${current}`, "Tirar título", "🏷️", "danger"));
    }

    const navigationRow = navigation.length > 0 ? row(...navigation) : null;

    // ==================================
    // CLÁSSICO: a lista no embed e um botão por título da página
    // ==================================

    const lines = shown.map(title => {
        const rarity = getAchievementRarity({ rarity: title.rarity });

        return `${title.formatted} · ${rarity.emoji} ${rarity.name}${title.id === equippedId ? " · ✅ equipado" : ""} · \`${title.id}\``;
    });

    const embed = createEmbed({
        section: "Títulos",
        title: "🏷️ Seus títulos",

        description:
            (notice ? notice + "\n\n" : "") +
            currentLine +
            "\n\n" +
            lines.join("\n") +
            "\n\n-# " + count + pageNote,

        color: equippedId ? HELENA_COLORS.success : HELENA_COLORS.primary,
        mood: equippedId ? "festa" : "feliz",

        footer: "Toque em um título para equipar"
    });

    const titleRow = row(...shown.map(title => title.id === equippedId
        ? button(`tit:noop:${userId}:eq:${title.id}`, title.name.slice(0, 40), title.emoji, "success", { disabled: true })
        : button(`tit:eq:${userId}:${current}:${title.id}`, title.name.slice(0, 40), title.emoji, "primary")
    ));

    // ==================================
    // V2: uma seção por título, o botão ao lado
    // ==================================

    const layout = [
        container([
            text("-# HELENA · TÍTULOS"),

            text("## 🏷️ Seus títulos"),

            ...(notice ? [text(notice)] : []),

            text(currentLine),

            divider(),

            ...shown.map(title => {
                const achievement = getAchievement(title.id);
                const rarity = getAchievementRarity({ rarity: title.rarity });

                return section(
                    [
                        `**${title.formatted}** · ${rarity.emoji} ${rarity.name}`,
                        `🏆 ${achievement.name} · ${achievement.description}`
                    ],
                    equipButton(title)
                );
            }),

            divider(),

            text(`-# ${count}${pageNote}`),

            ...(navigationRow ? [navigationRow] : [])
        ], { color: equippedId ? HELENA_COLORS.success : HELENA_COLORS.primary }),

        subtext("Também dá para equipar com /equipartitulo titulo:<id>")
    ];

    return {
        embed,
        components: navigationRow ? [titleRow, navigationRow] : [titleRow],
        layout
    };
}

// A resposta de um comando: o clássico com os botões, e o desenho do V2 (o clássico o ignora).
export function titlesResponse(view) {
    const response = embedResponse(view.embed);

    if (view.components.length > 0) {
        response.data.components = view.components;
    }

    response.data.layout = view.layout;

    return response;
}
