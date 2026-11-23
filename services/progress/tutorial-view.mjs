import { formatMoney } from "../../database/economy.mjs";

import { TUTORIAL_REWARD } from "../../config/tutorial.mjs";

import { tutorialStatus } from "./tutorial.mjs";

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

import { progressBar } from "../economy/missions-view.mjs";

// ==========================================
// A TELA DO /TUTORIAL
// ==========================================

// Os primeiros passos, cada um com ✅ ou ⬜ e o comando que o cumpre. Com todos feitos, aparece o botão do prêmio
// (tut:claim:<dono>); tut:ref:<dono> reconfere. Só quem abriu a tela mexe nela (services/panels/tutorial-panel.mjs).
// Devolve { embed, components, layout }. "notice" é uma linha de aviso no topo.

const rewardText = `${formatMoney(TUTORIAL_REWARD.money)} + ${TUTORIAL_REWARD.xp} XP`;

export function buildTutorial({ guildId, userId, notice = null }) {
    const status = tutorialStatus(guildId, userId);

    const readyToClaim = status.finished && !status.claimed;

    const bar = `${progressBar(status.completed, status.total)} **${status.completed}/${status.total}**`;

    const intro = status.claimed
        ? "Você completou todos os primeiros passos e já recebeu o prêmio. Boa sorte por aí!"
        : status.finished
            ? `Tudo feito! Resgate o prêmio: **${rewardText}**.`
            : `Siga os primeiros passos e ganhe **${rewardText}** ao completar todos.`;

    const color = readyToClaim ? HELENA_COLORS.success : HELENA_COLORS.primary;

    // ==================================
    // OS BOTÕES
    // ==================================

    const refresh = button(`tut:ref:${userId}`, "Atualizar", "🔄", "secondary");

    const claim = readyToClaim
        ? button(`tut:claim:${userId}`, "Resgatar prêmio", "🎁", "success")
        : null;

    const buttons = claim ? [claim, refresh] : [refresh];

    // ==================================
    // CLÁSSICO
    // ==================================

    const lines = status.steps.map(step =>
        `${step.done ? "✅" : "⬜"} ${step.emoji} **${step.title}**\n-# ${step.hint}`
    );

    const embed = createEmbed({
        section: "Tutorial",
        title: "🧭 Primeiros passos",

        description:
            (notice ? notice + "\n\n" : "") +
            intro + "\n" + bar + "\n\n" +
            lines.join("\n"),

        color,
        mood: readyToClaim ? "festa" : "feliz",

        footer: "Os passos se marcam sozinhos"
    });

    // ==================================
    // V2: uma seção por passo, o estado ao lado
    // ==================================

    const layout = [
        container([
            text("-# HELENA · TUTORIAL"),

            text("## 🧭 Primeiros passos"),

            ...(notice ? [text(notice)] : []),

            text(intro + "\n" + bar),

            divider(),

            ...status.steps.map(step => section(
                [
                    `**${step.emoji} ${step.title}**`,
                    step.hint
                ],
                step.done
                    ? button(`tut:noop:${userId}:${step.id}`, "Feito", "✅", "success", { disabled: true })
                    : button(`tut:noop:${userId}:${step.id}`, "Falta", "⬜", "secondary", { disabled: true })
            )),

            divider(),

            row(...buttons)
        ], { color }),

        subtext("Os passos se marcam sozinhos")
    ];

    return { embed, components: [row(...buttons)], layout };
}

export function tutorialResponse(view) {
    const response = embedResponse(view.embed);

    response.data.components = view.components;

    response.data.layout = view.layout;

    return response;
}
