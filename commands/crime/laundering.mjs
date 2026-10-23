
import {
    parseAmount,
    formatMoney,
    ALL_AMOUNT_WORDS
} from "../../database/economy.mjs";

import {
    getLaunderingStatus,
    startLaundering,
    unlockPrivate,
    settleDue
} from "../../services/crime/laundering.mjs";

import { LAUNDERING_CONFIG } from "../../config/crime.mjs";

import { launderingPanel } from "../../services/panels/panels.mjs";

import { GameBlocked } from "../../utils/game-error.mjs";

import { formatDuration } from "../../utils/time.mjs";

import {
    embedResponse,
    errorEmbed,
    warningEmbed,
    successEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { receipt, signed } from "../../utils/receipt.mjs";

// Tipos aceitos no comando e a lavanderia correspondente.
const KIND_BY_OPTION = {
    publica: "public",
    privada: "private"
};

const percent = rate => Math.round(rate * 100) + "%";

// ==========================================
// SITUAÇÃO
// ==========================================

function statusResponse(status, userId) {
    const { kinds } = LAUNDERING_CONFIG;

    const rows = [
        ["Dinheiro sujo", formatMoney(status.dirtyMoney)],
        [
            "Recarga",
            status.cooldownRemaining > 0
                ? formatDuration(status.cooldownRemaining)
                : "pronta"
        ]
    ];

    if (status.active) {
        rows.push(
            null,
            ["Lavando", kinds[status.active.kind].name + " · " + formatMoney(status.active.amount)],
            ["Termina em", formatDuration(status.active.remaining)]
        );
    }

    const fields = [
        {
            name: "🏭 Pública",
            value: receipt([
                ["Devolve", percent(kinds.public.rate.min) + " a " + percent(kinds.public.rate.max)],
                ["Velocidade", formatMoney(kinds.public.perMinute) + "/min"],
                ["Recarga", formatDuration(kinds.public.cooldown)],
                ["Vaga", status.publicBusyRemaining > 0 ? "ocupada " + formatDuration(status.publicBusyRemaining) : "livre"]
            ]) + "\n-# Uma por vez no servidor.",
            inline: false
        },
        {
            name: "🔐 Privada",
            value: receipt([
                ["Devolve", percent(kinds.private.rate.min) + " a " + percent(kinds.private.rate.max)],
                ["Velocidade", formatMoney(kinds.private.perMinute) + "/min"],
                ["Recarga", formatDuration(kinds.private.cooldown)]
            ]) + "\n" + (
                status.privateUnlocked
                    ? "-# Liberada neste servidor."
                    : "-# 🔒 Exige " + LAUNDERING_CONFIG.privateUnlockGems +
                      " gemas, uma única vez: `/lavagem valor:desbloquear`"
            ),
            inline: false
        }
    ];

    const response = embedResponse(
        ledgerEmbed({
            section: "Lavagem",
            title: "🧼 Lavagem de dinheiro",

            say:
                "Dinheiro sujo não serve para compras, depósitos " +
                "ou transferências. Lave-o para recebê-lo limpo " +
                "na carteira.",

            rows,

            note:
                "Use `/lavagem valor:<reais> tipo:<publica|privada>`: de " +
                formatMoney(LAUNDERING_CONFIG.minAmount) + " a " +
                formatMoney(LAUNDERING_CONFIG.maxAmount) +
                " por lavagem, " + LAUNDERING_CONFIG.energyCost + " de energia.",

            color: HELENA_COLORS.money,
            mood: "dinheiro",

            fields,

            footer: "Se você for preso, a lavagem pausa"
        })
    );

    // Botões que abrem o formulário de valor (ou a confirmação para
    // liberar a privada). Só o dono do painel consegue usar.
    response.data.components = launderingPanel(userId, status);

    return response;
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
                "Valor em reais, 'tudo'/'all' ou 'desbloquear' (opcional)",
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
                    getLaunderingStatus(guildId, userId),
                    userId
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

            if (ALL_AMOUNT_WORDS.includes(valor)) {
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
                ledgerEmbed({
                    section: "Lavagem",
                    title: "🧼 Lavagem iniciada",

                    say:
                        "Seu dinheiro está sendo lavado. Quando " +
                        "terminar, o valor limpo cai direto na " +
                        "carteira e eu aviso neste canal.",

                    rows: [
                        ["Lavanderia", spec.name],
                        ["Valor sujo", formatMoney(result.amount)],
                        ["Duração", formatDuration(result.duration)],
                        ["Retorno", percent(spec.rate.min) + " a " + percent(spec.rate.max)],
                        null,
                        ["Energia", signed(-LAUNDERING_CONFIG.energyCost, LAUNDERING_CONFIG.energyCost + " (" + result.energy + "/" + result.energyMax + ")")],
                        ["Recarga", formatDuration(result.cooldown)]
                    ],

                    color: HELENA_COLORS.money,
                    mood: "dinheiro",

                    footer: "Se você for preso, a lavagem pausa"
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
