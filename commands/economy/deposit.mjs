
import {
    deposit,
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
                createEmbed({
                    title: "🏦 Helena Bank",

                    description:
                        "### Depósito realizado!\n\n" +
                        "Seu dinheiro foi guardado no banco com sucesso.",

                    color: HELENA_COLORS.success,

                    fields: [
                        {
                            name: "💵 Valor depositado",
                            value: `**${formatMoney(amount)}**`,
                            inline: false
                        },
                        {
                            name: "👛 Carteira",
                            value: `**${formatMoney(player.wallet)}**`,
                            inline: true
                        },
                        {
                            name: "🏛️ Banco",
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
                            name: "📜 Missões diárias",
                            value:
                                "Seu progresso de depósito foi atualizado!\n" +
                                "Use `/missoes` para consultar suas recompensas.",
                            inline: false
                        }
                    ],

                    footer:
                        "Helena Bank • Seu dinheiro, seu futuro."
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