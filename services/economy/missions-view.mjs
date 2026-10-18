
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
    createEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

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

// Devolve { embed, components, layout }. "notice" é uma linha de aviso no topo (o resgate).
export function buildMissions({ guildId, userId, notice = null }) {
    const missions = getPlayerMissions(guildId, userId);

    const ready = missions.filter(isReady);

    const color = ready.length > 0
        ? HELENA_COLORS.success
        : HELENA_COLORS.missions;

    const statusOf = mission => mission.claimed
        ? "✅ Resgatada"
        : mission.progress >= mission.target
            ? "🎉 Pronta para resgatar"
            : "⏳ Em andamento";

    // ==================================
    // CLÁSSICO
    // ==================================

    const fields = missions.map(mission => ({
        name: mission.emoji + " " + mission.name,

        value: [
            mission.description,
            "",
            "**" + progressBar(mission.progress, mission.target) + "**",
            "📊 **Progresso:** " + mission.progress + "/" + mission.target,
            "💰 **Recompensa:** " + rewardText(mission),
            "**Status:** " + statusOf(mission),
            "🆔 `" + mission.id + "`"
        ].join("\n"),

        inline: false
    }));

    fields.push({
        name: "🎁 Recompensas disponíveis",
        value: "**" + ready.length + "**",
        inline: true
    });

    const embed = createEmbed({
        title: "📜 Helena Missões",

        description:
            (notice ? notice + "\n\n" : "") +
            "Complete seus objetivos diários e resgate recompensas.\n\n" +
            "As missões reiniciam à **meia-noite UTC**.",

        color,

        fields,

        footer:
            "Helena • Use /missoes resgatar para receber sua recompensa."
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
            text("## 📜 Helena Missões"),

            ...(notice ? [text(notice)] : []),

            text(
                "Complete os objetivos do dia e resgate as recompensas. " +
                "As missões reiniciam à **meia-noite UTC**."
            ),

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
                    : "🎁 Nenhuma recompensa pronta agora"
            )
        ], { color }),

        subtext("Helena • Também dá para resgatar com /missoes resgatar")
    ];

    return {
        embed,
        components: claimButtons.length > 0 ? [row(...claimButtons)] : [],
        layout
    };
}

// O resgate feito pelo comando (/missoes resgatar): o aviso de conclusão, como sempre foi.
export function buildClaimResult(result) {
    const { mission } = result;

    return createEmbed({
        title: "🎉 Missão concluída!",

        description:
            mission.emoji +
            " **" +
            mission.name +
            "**\n\n" +
            "Sua recompensa foi resgatada com sucesso!" +
            (
                result.leveledUp
                    ? "\n\n🎊 **Você também subiu de nível!**"
                    : "\n\nContinue completando suas missões!"
            ),

        color: HELENA_COLORS.success,

        fields: [
            {
                name: "💰 Recompensa",
                value: "**+" + formatMoney(mission.reward) + "**",
                inline: true
            },
            {
                name: "✨ Experiência",
                value: "**+" + mission.xp + " XP**",
                inline: true
            },
            {
                name: "👛 Carteira atual",
                value: formatMoney(result.wallet),
                inline: false
            },
            {
                name: "⭐ Nível atual",
                value: String(result.level),
                inline: true
            },
            {
                name: "📊 XP total",
                value: String(result.xp),
                inline: true
            }
        ],

        footer: "Helena • Uma conquista de cada vez."
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
