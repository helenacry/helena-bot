
import {
    parseAmount,
    formatMoney
} from "../../database/economy.mjs";

import {
    getLaunderingStatus,
    startLaundering,
    unlockPrivate,
    settleDue
} from "../../services/laundering.mjs";

import { LAUNDERING_CONFIG } from "../../config/crime.mjs";

import { GameBlocked } from "../../utils/game-error.mjs";

import { formatDuration } from "../../utils/time.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    warningEmbed,
    successEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// Tipos aceitos no comando e a lavanderia correspondente.
const KIND_BY_OPTION = {
    publica: "public",
    privada: "private"
};

const percent = rate => Math.round(rate * 100) + "%";

// ==========================================
// SITUAÇÃO
// ==========================================

function statusResponse(status) {
    const { kinds } = LAUNDERING_CONFIG;

    const fields = [
        {
            name: "🧺 Dinheiro sujo",
            value: "**" + formatMoney(status.dirtyMoney) + "**",
            inline: true
        },
        {
            name: "⏰ Recarga",
            value: status.cooldownRemaining > 0
                ? formatDuration(status.cooldownRemaining)
                : "🟢 Disponível",
            inline: true
        }
    ];

    if (status.active) {
        fields.push({
            name: "🔄 Lavagem em andamento",
            value:
                kinds[status.active.kind].name + " • " +
                formatMoney(status.active.amount) +
                "\nTermina em **" +
                formatDuration(status.active.remaining) + "**",
            inline: false
        });
    }

    fields.push(
        {
            name: "🏭 Pública",
            value:
                "Devolve " + percent(kinds.public.rate.min) +
                " a " + percent(kinds.public.rate.max) + "\n" +
                formatMoney(kinds.public.perMinute) + "/min • " +
                "recarga de " + formatDuration(kinds.public.cooldown) +
                "\nUma por vez no servidor" +
                (
                    status.publicBusyRemaining > 0
                        ? " (ocupada por " +
                          formatDuration(status.publicBusyRemaining) + ")"
                        : ""
                ),
            inline: false
        },
        {
            name: "🔐 Privada",
            value:
                "Devolve " + percent(kinds.private.rate.min) +
                " a " + percent(kinds.private.rate.max) + "\n" +
                formatMoney(kinds.private.perMinute) + "/min • " +
                "recarga de " + formatDuration(kinds.private.cooldown) +
                "\n" +
                (
                    status.privateUnlocked
                        ? "✅ Liberada neste servidor"
                        : "🔒 Exige " +
                          LAUNDERING_CONFIG.privateUnlockGems +
                          " gemas, uma única vez: `/lavagem valor:desbloquear`"
                ),
            inline: false
        },
        {
            name: "📋 Como usar",
            value:
                "`/lavagem valor:<reais> tipo:<publica|privada>`\n" +
                "Cada lavagem aceita de " +
                formatMoney(LAUNDERING_CONFIG.minAmount) + " a " +
                formatMoney(LAUNDERING_CONFIG.maxAmount) +
                " e custa " + LAUNDERING_CONFIG.energyCost +
                " de energia.",
            inline: false
        }
    );

    return embedResponse(
        createEmbed({
            title: "🧼 Lavagem de dinheiro",

            description:
                "Dinheiro sujo não serve para compras, depósitos " +
                "ou transferências. Lave-o para recebê-lo limpo " +
                "na carteira.",

            color: HELENA_COLORS.economy,

            fields,

            footer: "Helena • Lavagens em andamento pausam se você for preso."
        })
    );
}

// ==========================================
// COMANDO
// ==========================================

export default {
    name: "lavagem",
    aliases: ["lavar", "lav"],
    description: "Lave seu dinheiro sujo e receba-o limpo",

    options: [
        {
            name: "valor",
            description:
                "Valor em reais, 'tudo' ou 'desbloquear' (opcional)",
            type: "string",
            required: false
        },
        {
            name: "tipo",
            description: "Lavanderia pública ou privada",
            type: "string",
            required: false,
            choices: [
                { name: "Pública", value: "publica" },
                { name: "Privada", value: "privada" }
            ]
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const channelId = interaction.channelId ?? null;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta ou servidor."
            );
        }

        try {
            // Credita antes o que já terminou, para que a
            // situação mostrada esteja sempre atualizada.
            settleDue(undefined, { guildId, userId });

            const options = interaction.data?.options ?? {};

            const valor = String(options.valor ?? "")
                .trim()
                .toLowerCase();

            // Sem valor: mostra a situação.
            if (!valor) {
                return statusResponse(
                    getLaunderingStatus(guildId, userId)
                );
            }

            // Liberar a lavanderia privada.
            if (valor === "desbloquear") {
                const { cost } = unlockPrivate(guildId, userId);

                return successEmbed(
                    "Lavanderia privada liberada",
                    "Você pagou **" + cost + " gemas** e agora pode " +
                    "usar a lavanderia privada neste servidor."
                );
            }

            const kind = KIND_BY_OPTION[
                String(options.tipo ?? "publica")
                    .trim()
                    .toLowerCase()
            ];

            if (!kind) {
                return errorEmbed(
                    "Tipo inválido. Use `publica` ou `privada`."
                );
            }

            let amount;

            if (valor === "tudo") {
                const { dirtyMoney } = getLaunderingStatus(
                    guildId,
                    userId
                );

                amount = Math.min(
                    dirtyMoney,
                    LAUNDERING_CONFIG.maxAmount
                );

                if (amount <= 0) {
                    return warningEmbed(
                        "Sem dinheiro sujo",
                        "Você não tem dinheiro sujo para lavar. " +
                        "Use `/crime` para conseguir."
                    );
                }

            } else {
                // Valor digitado errado é engano do jogador,
                // não falha do bot: vira aviso, sem log de erro.
                try {
                    amount = parseAmount(
                        valor,
                        Number.MAX_SAFE_INTEGER
                    );

                } catch (error) {
                    return warningEmbed(
                        "Valor inválido",
                        error.message + "\n\n" +
                        "Exemplo: `/lavagem valor:5000 tipo:publica`"
                    );
                }
            }

            const result = startLaundering(guildId, userId, {
                amount,
                kind,
                channelId
            });

            const spec = LAUNDERING_CONFIG.kinds[kind];

            return embedResponse(
                createEmbed({
                    title: "🧼 Lavagem iniciada",

                    description:
                        "Seu dinheiro está sendo lavado. Quando " +
                        "terminar, o valor limpo cai direto na " +
                        "carteira e eu aviso neste canal.",

                    color: HELENA_COLORS.success,

                    fields: [
                        {
                            name: "🏭 Lavanderia",
                            value: "**" + spec.name + "**",
                            inline: true
                        },
                        {
                            name: "💸 Valor sujo",
                            value: "**" + formatMoney(result.amount) + "**",
                            inline: true
                        },
                        {
                            name: "⏳ Duração",
                            value: "**" + formatDuration(result.duration) + "**",
                            inline: true
                        },
                        {
                            name: "📈 Retorno esperado",
                            value:
                                percent(spec.rate.min) + " a " +
                                percent(spec.rate.max),
                            inline: true
                        },
                        {
                            name: "⚡ Energia",
                            value:
                                "-" + LAUNDERING_CONFIG.energyCost +
                                " (restam " + result.energy + "/" +
                                result.energyMax + ")",
                            inline: true
                        },
                        {
                            name: "⏰ Recarga",
                            value: formatDuration(result.cooldown),
                            inline: true
                        }
                    ],

                    footer:
                        "Helena • Se você for preso, a lavagem pausa."
                })
            );

        } catch (error) {
            if (error instanceof GameBlocked) {
                return warningEmbed(error.title, error.message);
            }

            console.error("[LAVAGEM]", error);

            return errorEmbed(
                "Não foi possível concluir a operação: " +
                error.message
            );
        }
    }
};
