
import {
    getPlayer,
    formatMoney
} from "../../database/economy.mjs";

import {
    getPrison,
    prisonLiveKey,
    escapeRow
} from "../../services/crime/prison.mjs";

import { ensureCrimePlayer } from "../../services/crime/crime-player.mjs";

import { formatDuration } from "../../utils/time.mjs";

import {
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

// Monta o embed com a situação atual. É chamada na resposta
// inicial e a cada atualização ao vivo, sempre com dados novos.
function buildPrisao(guildId, userId, { stale = false } = {}) {
    const prison = getPrison(guildId, userId);

    const record = ensureCrimePlayer(guildId, userId);

    const rate = record.crimes > 0
        ? Math.round(
            (record.successes / record.crimes) * 100
        ) + "%"
        : "—";

    const rows = [];

    if (prison) {
        rows.push(
            ["Tempo restante", formatDuration(prison.remaining)],
            ["Pena total", formatDuration(prison.sentence)],
            ["Motivo", prison.reason || "não informado"],
            null
        );
    }

    // A ficha criminal.
    rows.push(
        ["Crimes", String(record.crimes)],
        ["Sucessos", record.successes + " (" + rate + ")"],
        ["Capturas", String(record.failures)],
        ["Total arrecadado (sujo)", formatMoney(record.dirty_earned)]
    );

    let footer = "Ficha criminal";

    if (prison) {
        footer = stale
            ? "Atualização automática encerrada. Use /prisao"
            : "Atualizado automaticamente";
    }

    const embed = ledgerEmbed({
        section: "Prisão",
        title: prison
            ? "⛓️ Você está preso"
            : "🔓 Você está livre",

        say: prison
            ? "Trabalho, compras, depósitos e outras " +
              "movimentações ficam bloqueados até o fim da pena."
            : "Nenhuma pena em curso. Consultas e " +
              "movimentações estão liberadas.",

        rows,

        color: prison
            ? HELENA_COLORS.error
            : HELENA_COLORS.success,
        mood: prison ? "preso" : "feliz",

        footer
    });

    return { embed, jailed: Boolean(prison) };
}

export default {
    name: "prisao",
    aliases: ["cadeia"],
    description: "Consulte sua pena e sua ficha criminal",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta ou servidor."
            );
        }

        try {
            getPlayer(guildId, userId);

            const view = buildPrisao(guildId, userId);

            const response = embedResponse(view.embed);

            // Preso: o tempo restante é atualizado na própria
            // mensagem até a pena acabar (services/platform/live-embed.mjs).
            // Livre: não há nada para atualizar.
            if (view.jailed) {
                // Botão para tentar a fuga (só o dono consegue usar).
                response.data.components = [escapeRow(userId)];

                response.live = {
                    key: prisonLiveKey(guildId, userId),

                    render: ({ stale }) => {
                        const next = buildPrisao(
                            guildId,
                            userId,
                            { stale }
                        );

                        return {
                            payload: {
                                embeds: [next.embed],

                                // Solto: tira também o botão de fuga.
                                ...(next.jailed ? {} : { components: [] })
                            },
                            done: !next.jailed
                        };
                    }
                };
            }

            return response;

        } catch (error) {
            console.error("[PRISAO]", error);

            return errorEmbed(
                "Não foi possível consultar a prisão: " +
                error.message
            );
        }
    }
};
