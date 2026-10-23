
import {
    embedResponse,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { stamp } from "../../utils/receipt.mjs";

export default {
    name: "testembed",
    description: "Testa o sistema visual da Helena",

    async execute(interaction) {
        const username =
            interaction.user?.displayName ||
            interaction.user?.username ||
            "Jogador";

        return embedResponse(
            ledgerEmbed({
                section: "Teste",
                title: "💜 Visual da Helena",

                say: `Olá, **${username}**! ${stamp("tudo certo")}`,

                rows: [
                    ["Economia", "ativa"],
                    ["Inventário", "ativo"],
                    ["Progressão", "ativa"]
                ],

                color: HELENA_COLORS.primary,
                mood: "feliz",

                footer: "Um comando só para conferir o desenho das respostas"
            })
        );
    }
};
