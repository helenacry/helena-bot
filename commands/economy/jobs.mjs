
import { getPlayer, formatMoney } from "../../database/economy.mjs";

import { JOBS } from "../../config/jobs.mjs";

import { buildJobs, chooseJob } from "../../services/economy/jobs.mjs";

import {
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { plural } from "../../utils/plural.mjs";

// ==========================================
// COMANDO /EMPREGOS
// ==========================================

// Sem opção, mostra a lista (liberados, bloqueados e o menu "Escolha uma profissão"); com
// "cargo", assume o emprego direto. A tela e a troca estão em services/economy/jobs.mjs e o menu
// em services/panels/jobs-panel.mjs. O primeiro /trabalhar de quem não tem emprego abre a mesma tela.

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
            const selected = interaction.data.options?.cargo;

            // ==================================
            // LISTAR EMPREGOS
            // ==================================

            if (!selected) {
                const view = buildJobs({ guildId, user: interaction.user });

                const response = embedResponse(view.embed);

                response.data.components = view.components;

                return response;
            }

            // ==================================
            // SELECIONAR EMPREGO
            // ==================================

            const result = chooseJob(guildId, userId, selected);

            if (result.status === "unknown") {
                return errorEmbed(
                    "O emprego selecionado não foi encontrado."
                );
            }

            const { job } = result;

            if (result.status === "locked") {
                const player = getPlayer(guildId, userId);

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

            if (result.status === "same") {
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
