
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
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { plural } from "../../utils/plural.mjs";

import { table } from "../../utils/receipt.mjs";

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

                // ● o seu cargo, ○ liberado para você, × ainda bloqueado.
                const mark = job =>
                    job.id === player.job_id ? "●" : player.level >= job.level ? "○" : "×";

                const block = jobs => table(
                    jobs.map(job => [mark(job), "nv " + job.level, job.name, formatMoney(job.salary)]),
                    { align: ["l", "r", "l", "r"] }
                );

                // Três degraus, cada um num campo (cabe no limite de cada campo do embed).
                const steps = [
                    ["🌱 Começo", JOBS.filter(job => job.level <= 11)],
                    ["💼 Carreira", JOBS.filter(job => job.level > 11 && job.level <= 34)],
                    ["👑 Topo", JOBS.filter(job => job.level > 34)]
                ];

                return embedResponse(
                    ledgerEmbed({
                        section: "Carreira",
                        title: "💼 Empregos",

                        say:
                            "Você é **" + (currentJob?.name || "sem cargo") + "**, nível **" + player.level + "**" +
                            (currentJob ? ", e cada expediente rende **" + formatMoney(currentJob.salary) + "**." : ".") +
                            "",

                        note: "`●` seu cargo · `○` liberado · `×` bloqueado",

                        fields: steps.map(([name, jobs]) => ({ name, value: block(jobs), inline: false })),

                        color: HELENA_COLORS.primary,
                        thumbnail: interaction.user?.avatarUrl,
                        mood: "feliz",

                        footer: "Para trocar: /empregos cargo:nome"
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
                return embedResponse(
                    ledgerEmbed({
                        section: "Carreira",
                        title: "🔒 Emprego bloqueado",
                        say: "**" + job.name + "** ainda está fora do seu alcance.",
                        rows: [
                            ["Nível exigido", String(job.level)],
                            ["Seu nível", String(player.level)],
                            ["Faltam", plural(job.level - player.level, "nível", "níveis")]
                        ],
                        color: HELENA_COLORS.warning,
                        mood: "alerta",
                        footer: "Trabalhar rende experiência"
                    })
                );
            }

            if (player.job_id === job.id) {
                return embedResponse(
                    ledgerEmbed({
                        section: "Carreira",
                        title: "💼 Você já tem esse emprego",
                        say: "Você já trabalha como **" + job.name + "**.",
                        color: HELENA_COLORS.warning,
                        mood: "alerta",
                        footer: "/empregos mostra os outros cargos"
                    })
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
                ledgerEmbed({
                    section: "Carreira",
                    title: "🎉 Novo emprego",

                    say: "Você agora é **" + job.name + "**. O salário novo vale a partir do próximo `/trabalhar`.",

                    rows: [
                        ["Cargo", job.name],
                        ["Salário", formatMoney(job.salary)],
                        ["Nível exigido", String(job.level)]
                    ],

                    color: HELENA_COLORS.success,
                    mood: "festa",

                    footer: "Um novo capítulo na sua carreira"
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