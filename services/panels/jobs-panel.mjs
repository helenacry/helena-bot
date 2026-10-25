import { chooseJob } from "../economy/jobs.mjs";

import { formatMoney } from "../../database/economy.mjs";

import { HELENA_COLORS, ledgerEmbed } from "../../utils/embed.mjs";

import { notYours, sameUser, update, warn } from "./panel-kit.mjs";

// ==========================================
// MENU "ESCOLHA UMA PROFISSÃO" DO /EMPREGOS
// ==========================================

// Só quem abriu a tela escolhe. A escolha vale na hora e a mensagem vira a confirmação (sem o menu).
export function handleJobsClick(interaction) {
    const [, action, ownerId] = String(interaction.data?.customId ?? "").split(":");

    if (!sameUser(interaction, ownerId)) {
        return notYours();
    }

    if (action !== "escolher" || !interaction.guildId) {
        return null;
    }

    const picked = interaction.data?.values?.[0];

    const result = chooseJob(interaction.guildId, String(interaction.user.id), picked);

    if (result.status === "unknown") {
        return warn("Emprego não encontrado", "Esse cargo não existe mais. Abra o /empregos de novo.");
    }

    if (result.status === "locked") {
        return warn(
            "Emprego bloqueado",
            `**${result.job.name}** pede nível **${result.job.level}**, e você está no **${result.player.level}**.`
        );
    }

    if (result.status === "same") {
        return warn("Você já tem esse emprego", `Você já trabalha como **${result.job.name}**.`);
    }

    return update({
        embed: ledgerEmbed({
            section: "Carreira",
            title: "🎉 Novo emprego",
            say: `Você agora é **${result.job.name}**. Use \`/trabalhar\` para o primeiro expediente.`,
            rows: [
                ["Cargo", result.job.name],
                ["Salário", formatMoney(result.job.salary)],
                ["Nível exigido", String(result.job.level)]
            ],
            color: HELENA_COLORS.success,
            thumbnail: interaction.user?.avatarUrl,
            mood: "festa",
            footer: "Um novo capítulo na sua carreira"
        }),
        components: []
    });
}
