
import { formatMoney } from "../../database/economy.mjs";

import { getPlayerMissions } from "./missions.mjs";

import { button, row } from "../panels/panel-kit.mjs";

import {
    container,
    divider,
    section,
    subtext,
    text
} from "../../utils/components-v2.mjs";

import {
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { plural } from "../../utils/plural.mjs";

import { signed } from "../../utils/receipt.mjs";

// ==========================================
// TELAS DAS MISSÕES
// ==========================================

// A lista das missões do dia. As prontas têm o botão Resgatar (miss:resgatar:<dono>:<missão>,
// em services/panels/missions-panel.mjs). O resgate também continua pelo comando:
// /missoes resgatar:<missão>.

export function progressBar(progress, target) {
    const size = 10;

    const ratio = target > 0
        ? Math.max(0, Math.min(1, progress / target))
        : 0;

    const filled = Math.floor(ratio * size);

    return (
        "█".repeat(filled) +
        "░".repeat(size - filled)
    );
}

const isReady = mission => mission.progress >= mission.target && !mission.claimed;

const rewardText = mission => `${formatMoney(mission.reward)} + ${mission.xp} XP`;

// A frase que abre a lista depois de um resgate.
export function claimNotice(result) {
    const { mission } = result;

    return (
        `🎉 **${mission.emoji} ${mission.name}** resgatada: ` +
        `**+${formatMoney(mission.reward)}** e **+${mission.xp} XP**` +
        (result.leveledUp ? " · 🎊 Você subiu de nível!" : "")
    );
}

// As duas abas: as diárias e as semanais. O V2 tem no máximo 40 componentes e cada missão é uma seção de 4, então
// uma aba mostra um tipo só; os botões trocam de aba (miss:tab:<dono>:<tipo>).
const TABS = Object.freeze({
    daily: Object.freeze({
        label: "Diárias",
        emoji: "☀️",
        title: "📜 Missões do dia",
        intro: "Complete os objetivos do dia e resgate as recompensas. As missões reiniciam à **meia-noite UTC**.",
        note: "As missões reiniciam à meia-noite UTC."
    }),

    weekly: Object.freeze({
        label: "Semanais",
        emoji: "📅",
        title: "📅 Missões da semana",
        intro: "As semanais pagam mais e pedem constância. Elas reiniciam na **segunda-feira, à meia-noite UTC**.",
        note: "As semanais reiniciam na segunda-feira, à meia-noite UTC."
    })
});

// Devolve { embed, components, layout }. "notice" é uma linha de aviso no topo (o resgate); "tab" é "daily" ou
// "weekly".
export function buildMissions({ guildId, userId, notice = null, tab = "daily" }) {
    const kind = Object.hasOwn(TABS, tab) ? tab : "daily";

    const copy = TABS[kind];

    const all = getPlayerMissions(guildId, userId);

    const missions = all.filter(mission => mission.period === kind);

    // o que está pronto em CADA aba: a outra aba também avisa
    const readyOf = list => list.filter(isReady);

    const ready = readyOf(missions);

    const readyElsewhere = readyOf(all.filter(mission => mission.period !== kind)).length;

    const color = ready.length > 0
        ? HELENA_COLORS.success
        : HELENA_COLORS.missions;

    const statusOf = mission => mission.claimed
        ? "✅ resgatada"
        : mission.progress >= mission.target
            ? "🎉 pronta para resgatar"
            : "⏳ em andamento";

    // ==================================
    // AS ABAS (botões)
    // ==================================

    const tabButtons = Object.entries(TABS).map(([value, entry]) => {
        const pending = readyOf(all.filter(mission => mission.period === value)).length;

        return button(
            `miss:tab:${userId}:${value}`,
            pending > 0 ? `${entry.label} (${pending})` : entry.label,
            entry.emoji,
            value === kind ? "primary" : "secondary",
            { disabled: value === kind }
        );
    });

    // ==================================
    // CLÁSSICO
    // ==================================

    const fields = missions.map(mission => ({
        name: mission.emoji + " " + mission.name,

        value: [
            mission.description,
            progressBar(mission.progress, mission.target) +
                " **" + mission.progress + "/" + mission.target + "** · " + rewardText(mission),
            "-# " + statusOf(mission) + " · id `" + mission.id + "`"
        ].join("\n"),

        inline: false
    }));

    const embed = ledgerEmbed({
        section: "Missões",
        title: copy.title,

        say:
            (notice ? notice + "\n" : "") +
            (ready.length > 0
                ? "🎁 **" + plural(ready.length, "recompensa pronta", "recompensas prontas") + "** para resgatar."
                : "Cumpra os objetivos e resgate as recompensas."),

        note: copy.note,

        color,
        mood: ready.length > 0 ? "festa" : "feliz",

        fields,

        footer: "Resgate com /missoes resgatar"
    });

    // Um botão por missão pronta (o resgate da lista, sem digitar o ID).
    const claimButtons = ready.map(mission => button(
        `miss:resgatar:${userId}:${mission.id}`,
        `Resgatar: ${mission.name}`.slice(0, 80),
        "🎁",
        "success"
    ));

    // ==================================
    // V2: uma seção por missão, o botão ao lado
    // ==================================

    const accessoryOf = mission => {
        if (isReady(mission)) {
            return button(`miss:resgatar:${userId}:${mission.id}`, "Resgatar", "🎁", "success");
        }

        return mission.claimed
            ? button(`miss:noop:${userId}:${mission.id}`, "Resgatada", "✅", "secondary", { disabled: true })
            : button(
                `miss:noop:${userId}:${mission.id}`,
                `${mission.progress}/${mission.target}`,
                "⏳",
                "secondary",
                { disabled: true }
            );
    };

    const layout = [
        container([
            text("-# HELENA · MISSÕES"),

            text("## " + copy.title),

            ...(notice ? [text(notice)] : []),

            text(copy.intro),

            divider(),

            ...missions.map(mission => section(
                [
                    `**${mission.emoji} ${mission.name}**`,

                    `${mission.description}\n` +
                    `${progressBar(mission.progress, mission.target)} ` +
                    `**${mission.progress}/${mission.target}** · 💰 ${rewardText(mission)}`
                ],
                accessoryOf(mission)
            )),

            divider(),

            text(
                ready.length > 0
                    ? `🎁 **${ready.length}** ${ready.length === 1 ? "recompensa pronta" : "recompensas prontas"} para resgatar`
                    : readyElsewhere > 0
                        ? "🎁 Há recompensa pronta na outra aba"
                        : "🎁 Nenhuma recompensa pronta agora"
            ),

            row(...tabButtons)
        ], { color }),

        subtext("Também dá para resgatar com /missoes resgatar")
    ];

    return {
        embed,
        components: [
            ...(claimButtons.length > 0 ? [row(...claimButtons)] : []),
            row(...tabButtons)
        ],
        layout
    };
}

// O resgate feito pelo comando (/missoes resgatar): o aviso de conclusão, como sempre foi.
export function buildClaimResult(result) {
    const { mission } = result;

    return ledgerEmbed({
        section: "Missões",
        title: "🎉 Missão concluída",

        say:
            mission.emoji + " **" + mission.name + "** resgatada." +
            (result.leveledUp ? "\n> 🎊 **Você também subiu de nível!**" : ""),

        rows: [
            ["Recompensa", signed(mission.reward, formatMoney(mission.reward))],
            ["Experiência", signed(mission.xp, mission.xp + " XP")],
            null,
            ["Carteira", formatMoney(result.wallet)],
            ["Nível", result.level + " · " + result.xp.toLocaleString("pt-BR") + " XP"]
        ],

        color: HELENA_COLORS.success,
        mood: "festa",

        footer: "Uma missão de cada vez"
    });
}

// O que dizer quando o resgate não acontece (título e texto de aviso). null se foi resgatada.
export function claimProblem(result) {
    const { mission } = result;

    switch (result.status) {
        case "unknown":
            return {
                title: "Missão não encontrada",
                message: "A missão selecionada não foi encontrada."
            };

        case "incomplete":
            return {
                title: "Missão incompleta",

                message:
                    mission.emoji +
                    " **" +
                    mission.name +
                    "**\n\n" +
                    "**" +
                    progressBar(result.progress, mission.target) +
                    "**\n" +
                    "📊 **Progresso:** " +
                    result.progress +
                    "/" +
                    mission.target +
                    "\n\nConclua o objetivo antes de resgatar."
            };

        case "claimed":
            return {
                title: "Recompensa já resgatada",

                message:
                    "Você já recebeu a recompensa da missão **" +
                    mission.name +
                    "** neste período."
            };

        default:
            return null;
    }
}
