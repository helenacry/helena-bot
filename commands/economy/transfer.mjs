
import {
    transfer,
    getPlayer,
    formatMoney
} from "../../database/economy.mjs";

import { mention } from "../../services/platform/mentions.mjs";

import {
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { signed } from "../../utils/receipt.mjs";

export default {
    name: "transferir",
    aliases: ["pagar"],
    description: "Transfere dinheiro para outro jogador",

    options: [
        {
            name: "usuario",
            description: "Jogador que receberá o dinheiro",
            type: "user",
            required: true
        },
        {
            name: "quantia",
            description: "Quantidade que deseja transferir",
            type: "string",
            required: true
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const senderId = interaction.user?.id;

        if (!guildId || !senderId) {
            return errorEmbed(
                "Não foi possível identificar sua conta ou servidor."
            );
        }

        try {
            const options = interaction.data.options ?? {};

            // Mantém compatibilidade com ID direto
            // ou objeto de usuário retornado pelo Discord.
            const target = options.usuario;

            const targetId =
                typeof target === "string"
                    ? target
                    : target?.id;

            if (!targetId) {
                return errorEmbed(
                    "Não foi possível identificar o destinatário."
                );
            }

            if (targetId === senderId) {
                return errorEmbed(
                    "Você não pode transferir dinheiro para si mesmo."
                );
            }

            // Mantém a operação financeira original.
            const amount = transfer(
                guildId,
                senderId,
                targetId,
                options.quantia
            );

            const player = getPlayer(
                guildId,
                senderId
            );

            // Monta a resposta visual.
            return embedResponse(
                ledgerEmbed({
                    section: "Pagamentos",
                    title: "💸 Transferência feita",

                    // Menção: vira chip no embed, em vez do ID puro (e não notifica).
                    say: "Você pagou " + mention(targetId) + ".",

                    rows: [
                        ["Enviado", signed(-amount, formatMoney(amount))],
                        null,
                        ["Carteira", formatMoney(player.wallet)]
                    ],

                    color: HELENA_COLORS.economy,
                    mood: "dinheiro",

                    footer: "Transferências não têm volta"
                })
            );

        } catch (error) {
            console.error("[TRANSFERIR]", error);

            return errorEmbed(
                error.message ||
                "Não foi possível realizar a transferência."
            );
        }
    }
};