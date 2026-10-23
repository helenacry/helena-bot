
import {
    withdraw,
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
    name: "sacar",
    description: "Retira dinheiro do banco da Helena",

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
            const quantia =
                interaction.data.options?.quantia;

            // Mantém a operação financeira original.
            // O serviço withdraw() realiza as validações
            // e atualiza os valores dentro da transação.
            const amount = withdraw(
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
                    title: "💵 Saque feito",

                    say: "O dinheiro saiu do banco e já está na sua carteira.",

                    rows: [
                        ["Sacado", formatMoney(amount)],
                        null,
                        ["Carteira", formatMoney(player.wallet)],
                        ["Banco", formatMoney(player.bank)],
                        ["Patrimônio", formatMoney(player.wallet + player.bank)]
                    ],

                    color: HELENA_COLORS.economy,
                    mood: "dinheiro",

                    footer: "Dinheiro na carteira pode ser roubado"
                })
            );

        } catch (error) {
            console.error("[SACAR]", error);

            return errorEmbed(
                error.message ||
                "Não foi possível realizar o saque."
            );
        }
    }
};