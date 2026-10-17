
import { formatMoney } from "../../database/economy.mjs";

import {
    getLaunderingStatus,
    settleDue
} from "../../services/crime/laundering.mjs";

import { getPrison } from "../../services/crime/prison.mjs";

import { LAUNDERING_CONFIG } from "../../config/crime.mjs";

import { formatDuration } from "../../utils/time.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

const BAR_SIZE = 10;

// Barra de progresso: 0.3 -> "▰▰▰▱▱▱▱▱▱▱ 30%".
function progressBar(progress) {
    const clamped = Math.min(1, Math.max(0, progress));

    const filled = Math.round(clamped * BAR_SIZE);

    return (
        "▰".repeat(filled) +
        "▱".repeat(BAR_SIZE - filled) +
        " " + Math.round(clamped * 100) + "%"
    );
}

export default {
    name: "lavageminfo",
    aliases: ["lavstatus"],
    description: "Veja o tempo da lavagem de dinheiro em andamento",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta ou servidor."
            );
        }

        try {
            // Credita antes o que já terminou, para não
            // mostrar como "em andamento" uma lavagem concluída.
            settleDue(undefined, { guildId, userId });

            const status = getLaunderingStatus(guildId, userId);

            // ==================================
            // NENHUMA LAVAGEM
            // ==================================

            if (!status.active) {
                return embedResponse(
                    createEmbed({
                        title: "🧼 Nenhuma lavagem em andamento",

                        description:
                            "Você não tem dinheiro sendo lavado agora.",

                        color: HELENA_COLORS.primary,

                        fields: [
                            {
                                name: "🧺 Dinheiro sujo",
                                value:
                                    "**" +
                                    formatMoney(status.dirtyMoney) +
                                    "**",
                                inline: true
                            },
                            {
                                name: "⏰ Próxima lavagem",
                                value: status.cooldownRemaining > 0
                                    ? "Em " + formatDuration(
                                        status.cooldownRemaining
                                    )
                                    : "🟢 Disponível",
                                inline: true
                            }
                        ],

                        footer:
                            "Helena • Use /lavagem para iniciar uma."
                    })
                );
            }

            // ==================================
            // LAVAGEM EM ANDAMENTO
            // ==================================

            const { active } = status;

            const spec = LAUNDERING_CONFIG.kinds[active.kind];

            // Estimativa que não revela o valor já sorteado.
            const estimateMin = Math.floor(
                active.amount * spec.rate.min
            );

            const estimateMax = Math.floor(
                active.amount * spec.rate.max
            );

            // Duração da lavagem em si, sem prisão no meio.
            const totalDuration =
                Math.ceil(active.amount / spec.perMinute) *
                LAUNDERING_CONFIG.batchSeconds;

            // Preso, a lavagem fica em pausa: o término foi
            // adiado pelo tempo da pena, então o que falta de
            // lavagem é o restante menos o que falta de prisão.
            const prison = getPrison(guildId, userId);

            const jailLeft = prison ? prison.remaining : 0;

            const workLeft = Math.max(
                0,
                active.remaining - jailLeft
            );

            const progress = 1 - workLeft / totalDuration;

            const fields = [
                {
                    name: "🏭 Lavanderia",
                    value: "**" + spec.name + "**",
                    inline: true
                },
                {
                    name: "💸 Valor sujo",
                    value: "**" + formatMoney(active.amount) + "**",
                    inline: true
                },
                {
                    name: "📈 Retorno esperado",
                    value:
                        formatMoney(estimateMin) + " a " +
                        formatMoney(estimateMax),
                    inline: true
                },
                {
                    name: "⏳ Termina em",
                    value:
                        "**" + formatDuration(active.remaining) + "**",
                    inline: true
                },
                {
                    name: "📊 Progresso",
                    value: progressBar(progress),
                    inline: false
                }
            ];

            if (prison) {
                fields.push({
                    name: "⛓️ Lavagem pausada",
                    value:
                        "Você está preso por mais **" +
                        formatDuration(jailLeft) +
                        "**. A lavagem só continua depois da pena " +
                        "e ainda faltam **" +
                        formatDuration(workLeft) +
                        "** de lavagem.",
                    inline: false
                });
            }

            return embedResponse(
                createEmbed({
                    title: prison
                        ? "⏸️ Lavagem pausada"
                        : "🧼 Lavagem em andamento",

                    description: prison
                        ? "Seu dinheiro está parado até você sair da cadeia."
                        : "Seu dinheiro está sendo lavado. Quando " +
                          "terminar, o valor limpo cai na carteira " +
                          "e eu aviso no canal.",

                    color: prison
                        ? HELENA_COLORS.warning
                        : HELENA_COLORS.economy,

                    fields,

                    footer:
                        "Helena • O valor final é sorteado a cada minuto de lavagem."
                })
            );

        } catch (error) {
            console.error("[LAVAGEMINFO]", error);

            return errorEmbed(
                "Não foi possível consultar a lavagem: " +
                error.message
            );
        }
    }
};
