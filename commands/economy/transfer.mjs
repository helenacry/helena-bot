
import {
    transfer,
    getPlayer,
    formatMoney
} from "../../database/economy.mjs";

import { mention } from "../../services/mentions.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

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
            // ou objeto de usuário retornado pela VSync.
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
                createEmbed({
                    title: "💸 Helena Pay",

                    description:
                        "### Transferência realizada!\n\n" +
                        "Seu pagamento foi processado com sucesso.",

                    color: HELENA_COLORS.success,

                    fields: [
                        {
                            name: "👤 Destinatário",
                            // Menção: vira chip no embed, em vez do ID puro.
                            value: mention(targetId),
                            inline: false
                        },
                        {
                            name: "💰 Valor transferido",
                            value: `**${formatMoney(amount)}**`,
                            inline: true
                        },
                        {
                            name: "👛 Carteira restante",
                            value: `**${formatMoney(player.wallet)}**`,
                            inline: true
                        },
                        {
                            name: "🔒 Status",
                            value: "Pagamento concluído.",
                            inline: false
                        }
                    ],

                    footer:
                        "Helena Pay • Transferências entre jogadores"
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