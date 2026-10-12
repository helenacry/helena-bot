
import {
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
    name: "saldo",
    aliases: ["bal", "carteira"],
    description: "Consulta sua situação financeira",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta ou servidor."
            );
        }

        try {
            const player = getPlayer(guildId, userId);

            const username =
                interaction.user?.displayName ||
                interaction.user?.username ||
                "Jogador";

            const patrimonio = player.wallet + player.bank;

            return embedResponse(
                createEmbed({
                    title: "🏦 Helena Bank",

                    description:
                        `**Conta de ${username}**\n\n` +
                        "Confira abaixo sua situação financeira.",

                    color: HELENA_COLORS.economy,

                    fields: [
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
                            name: "💎 Gemas",
                            value: `**${player.gems}**`,
                            inline: true
                        },
                        {
                            name: "⭐ Nível",
                            value: `**${player.level}**`,
                            inline: true
                        },
                        {
                            name: "✨ Experiência",
                            value: `**${player.xp} XP**`,
                            inline: true
                        },
                        // Dinheiro sujo só aparece para quem tem. Não
                        // entra no patrimônio: precisa ser lavado.
                        ...(player.dirty_money > 0
                            ? [{
                                name: "🧺 Dinheiro sujo",
                                value: `**${formatMoney(player.dirty_money)}**`,
                                inline: true
                            }]
                            : []),
                        {
                            name: "━━━━━━━━━━━━━━━━",
                            value: "\u200B",
                            inline: false
                        },
                        {
                            name: "💰 Patrimônio total",
                            value: `**${formatMoney(patrimonio)}**`,
                            inline: false
                        }
                    ],

                    footer:
                        "Helena • Seu progresso, sua conquista."
                })
            );

        } catch (error) {
            console.error("[SALDO]", error);

            return errorEmbed(
                "Não foi possível consultar sua situação financeira."
            );
        }
    }
};