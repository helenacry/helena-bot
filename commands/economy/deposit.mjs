
import {
    deposit,
    getPlayer,
    formatMoney
} from "../../database/economy.mjs";

import {
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

export default {
    name: "depositar",
    aliases: ["dep"],
    description: "Guarda seu dinheiro no banco da Helena",

    options: [
        {
            name: "quantia",
            description: "Quantidade, 'tudo' ou 'all'",
            type: "string",
            required: true
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta ou servidor."
            );
        }

        try {
            const quantia = interaction.data.options?.quantia;

            // Mantém a operação financeira original.
            // O registro da missão de depósito continua
            // sendo realizado pelo serviço economy.mjs.
            const amount = deposit(
                guildId,
                userId,
                quantia
            );

            // Consulta os saldos atualizados.
            const player = getPlayer(
                guildId,
                userId
            );

            return embedResponse(
                ledgerEmbed({
                    section: "Banco",
                    title: "🏦 Depósito feito",

                    say: "Dinheiro na carteira não fica a salvo de ladrão. No banco fica.",

                    rows: [
                        ["Depositado", formatMoney(amount)],
                        null,
                        ["Carteira", formatMoney(player.wallet)],
                        ["Banco", formatMoney(player.bank)],
                        ["Patrimônio", formatMoney(player.wallet + player.bank)]
                    ],

                    note: "A missão de depósito foi atualizada: `/missoes`.",

                    color: HELENA_COLORS.economy,
                    mood: "dinheiro",

                    footer: "O banco não pode ser roubado"
                })
            );

        } catch (error) {
            console.error("[DEPOSITAR]", error);

            return errorEmbed(
                error.message ||
                "Não foi possível realizar o depósito."
            );
        }
    }
};