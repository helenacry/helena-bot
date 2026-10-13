
import {
    createEmbed,
    embedResponse,
    HELENA_COLORS
} from "../../utils/embed.mjs";

export default {
    name: "testembed",
    description: "Testa o sistema visual da Helena",

    async execute(interaction) {
        const username =
            interaction.user?.displayName ||
            interaction.user?.username ||
            "Jogador";

        return embedResponse(
            createEmbed({
                title: "💜 Helena",
                description:
                    `Olá, **${username}**!\n\n` +
                    "O novo sistema visual da Helena está funcionando.",

                color: HELENA_COLORS.primary,

                fields: [
                    {
                        name: "💰 Economia",
                        value: "Sistema financeiro ativo.",
                        inline: true
                    },
                    {
                        name: "🎒 Inventário",
                        value: "Itens e loja disponíveis.",
                        inline: true
                    },
                    {
                        name: "⭐ Progressão",
                        value: "Níveis, XP e missões.",
                        inline: false
                    }
                ]
            })
        );
    }
};