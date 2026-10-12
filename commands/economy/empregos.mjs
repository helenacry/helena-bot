
import { db } from "../../database/connection.mjs";

import {
    getPlayer,
    formatMoney
} from "../../database/economy.mjs";

import {
    JOBS,
    getJob
} from "../../config/jobs.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    warningEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

export default {
    name: "empregos",
    description: "Consulte os empregos e avance na carreira",

    options: [
        {
            name: "cargo",
            description: "ID do emprego que deseja assumir",
            type: "string",
            required: false,
            choices: JOBS.map(job => ({
                name: job.name,
                value: job.id
            }))
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
            const player = getPlayer(guildId, userId);
            const selected = interaction.data.options?.cargo;

            // ==================================
            // LISTAR EMPREGOS
            // ==================================

            if (!selected) {
                const currentJob = getJob(player.job_id);

                const lines = JOBS.map((job, index) => {
                    const unlocked = player.level >= job.level;

                    const status =
                        job.id === player.job_id
                            ? "👔"
                            : unlocked
                                ? "🔓"
                                : "🔒";

                    return (
                        status + " **" + (index + 1) + ". " +
                        job.name + "**\n" +
                        "Nível " + job.level +
                        " • " + formatMoney(job.salary)
                    );
                });

                const currentName =
                    currentJob?.name || "Não identificado";

                const currentSalary =
                    currentJob
                        ? formatMoney(currentJob.salary)
                        : "Indisponível";

                // Divide a lista para respeitar o limite
                // de caracteres de cada campo do embed.
                const fields = [];

                for (let i = 0; i < lines.length; i += 5) {
                    fields.push({
                        name:
                            "💼 Profissões " +
                            (i + 1) +
                            "–" +
                            Math.min(i + 5, lines.length),

                        value: lines.slice(i, i + 5).join("\n\n"),
                        inline: false
                    });
                }

                return embedResponse(
                    createEmbed({
                        title: "💼 Helena Carreiras",

                        description:
                            "Escolha sua profissão e evolua na carreira.\n\n" +
                            "👔 Atual • 🔓 Disponível • 🔒 Bloqueado",

                        color: HELENA_COLORS.primary,

                        fields: [
                            {
                                name: "⭐ Seu nível",
                                value: String(player.level),
                                inline: true
                            },
                            {
                                name: "👔 Emprego atual",
                                value: currentName,
                                inline: true
                            },
                            {
                                name: "💰 Salário atual",
                                value: currentSalary,
                                inline: true
                            },
                            ...fields,
                            {
                                name: "📌 Como mudar de emprego?",
                                value:
                                    "Use `/empregos` e selecione a opção `cargo`.",
                                inline: false
                            }
                        ],

                        footer:
                            "Helena • Construa sua carreira."
                    })
                );
            }

            // ==================================
            // SELECIONAR EMPREGO
            // ==================================

            const job = JOBS.find(
                item => item.id === selected
            );

            if (!job) {
                return errorEmbed(
                    "O emprego selecionado não foi encontrado."
                );
            }

            if (player.level < job.level) {
                return warningEmbed(
                    "Emprego bloqueado",
                    "**Cargo:** " + job.name + "\n" +
                    "**Nível necessário:** " + job.level + "\n" +
                    "**Seu nível:** " + player.level + "\n\n" +
                    "Faltam **" +
                    (job.level - player.level) +
                    " níveis** para desbloquear esta profissão."
                );
            }

            if (player.job_id === job.id) {
                return warningEmbed(
                    "Emprego atual",
                    "Você já trabalha como **" + job.name + "**."
                );
            }

            const result = db.prepare(`
                UPDATE players
                SET job_id = ?
                WHERE guild_id = ?
                  AND user_id = ?
                  AND level >= ?
            `).run(
                job.id,
                guildId,
                userId,
                job.level
            );

            if (result.changes !== 1) {
                throw new Error(
                    "Não foi possível atualizar seu emprego."
                );
            }

            return embedResponse(
                createEmbed({
                    title: "🎉 Novo emprego registrado!",

                    description:
                        "Parabéns! Você assumiu uma nova profissão.\n\n" +
                        "Seu novo salário será aplicado no próximo `/trabalhar`.",

                    color: HELENA_COLORS.success,

                    fields: [
                        {
                            name: "👔 Novo cargo",
                            value: "**" + job.name + "**",
                            inline: false
                        },
                        {
                            name: "⭐ Nível necessário",
                            value: String(job.level),
                            inline: true
                        },
                        {
                            name: "💰 Salário",
                            value: "**" + formatMoney(job.salary) + "**",
                            inline: true
                        }
                    ],

                    footer:
                        "Helena • Um novo capítulo na sua carreira."
                })
            );

        } catch (error) {
            console.error("[EMPREGOS]", error);

            return errorEmbed(
                "Ocorreu um erro no sistema de empregos."
            );
        }
    }
};