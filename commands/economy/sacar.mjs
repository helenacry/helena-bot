
import {
    withdraw,
    getPlayer,
    formatMoney
} from "../../database/economy.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

export default {
    name: "sacar",
    description: "Retira dinheiro do banco da Helena",

    options: [
        {
            name: "quantia",
            description: "Quantidade ou 'tudo'",
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
                createEmbed({
                    title: "🏦 Helena Bank",

                    description:
                        "### Saque realizado!\n\n" +
                        "O dinheiro foi transferido do banco " +
                        "para sua carteira com sucesso.",

                    color: HELENA_COLORS.success,

                    fields: [
                        {
                            name: "💵 Valor sacado",
                            value: `**${formatMoney(amount)}**`,
                            inline: false
                        },
                        {
                            name: "👛 Carteira atual",
                            value: `**${formatMoney(player.wallet)}**`,
                            inline: true
                        },
                        {
                            name: "🏛️ Saldo bancário",
                            value: `**${formatMoney(player.bank)}**`,
                            inline: true
                        },
                        {
                            name: "💰 Patrimônio total",
                            value: `**${formatMoney(
                                player.wallet + player.bank
                            )}**`,
                            inline: false
                        },
                        {
                            name: "🔒 Status",
                            value: "Saque concluído com sucesso.",
                            inline: false
                        }
                    ],

                    footer:
                        "Helena Bank • Seu dinheiro, seu futuro."
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