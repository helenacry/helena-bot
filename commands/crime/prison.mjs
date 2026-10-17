
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
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
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

    const fields = [];

    if (prison) {
        fields.push(
            {
                name: "⏳ Tempo restante",
                value:
                    "**" +
                    formatDuration(prison.remaining) +
                    "**",
                inline: true
            },
            {
                name: "📜 Pena total",
                value: formatDuration(prison.sentence),
                inline: true
            },
            {
                name: "⚖️ Motivo",
                value: prison.reason || "Não informado",
                inline: true
            }
        );
    }

    fields.push(
        {
            name: "🕵️ Crimes",
            value: String(record.crimes),
            inline: true
        },
        {
            name: "✅ Sucessos",
            value:
                record.successes + " (" + rate + ")",
            inline: true
        },
        {
            name: "🚨 Capturas",
            value: String(record.failures),
            inline: true
        },
        {
            name: "💸 Total arrecadado (sujo)",
            value: formatMoney(record.dirty_earned),
            inline: false
        }
    );

    let footer = "Helena • Ficha criminal";

    if (prison) {
        footer = stale
            ? "Helena • Atualização automática encerrada. Use /prisao."
            : "Helena • Atualizado automaticamente.";
    }

    const embed = createEmbed({
        title: prison
            ? "⛓️ Você está preso"
            : "🔓 Você está livre",

        description: prison
            ? "Trabalho, compras, depósitos e outras " +
              "movimentações ficam bloqueados até o fim da pena."
            : "Nenhuma pena em curso. Consultas e " +
              "movimentações estão liberadas.",

        color: prison
            ? HELENA_COLORS.warning
            : HELENA_COLORS.success,

        fields,

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
