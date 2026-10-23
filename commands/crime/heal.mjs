
import {
    embedResponse,
    errorEmbed,
    warningEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { signed } from "../../utils/receipt.mjs";

import { formatMoney, getPlayer } from "../../database/economy.mjs";

import { heal, HOSPITAL_RULES } from "../../services/combat/hospital.mjs";

import { hpLine } from "../../services/combat/combat-view.mjs";

import { duration } from "../../utils/duration-text.mjs";

import { reais } from "../../utils/money-text.mjs";

// ==========================================
// COMANDO /CURAR
// ==========================================

// Leva a vida a 100. Cada ponto que falta custa dinheiro da carteira, e quem
// se cura ganha um tempo de proteção contra duelos (regras em services/combat/hospital.mjs).

export default {
    name: "curar",
    description: `Cure sua vida no hospital (${reais(HOSPITAL_RULES.costPerHp)} por ponto)`,
    options: [],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Este comando só pode ser usado em um servidor."
            );
        }

        try {
            const cost = heal(guildId, userId);

            const wallet = getPlayer(guildId, userId).wallet;

            const embed = ledgerEmbed({
                section: "Hospital",
                title: "🏥 Tratamento concluído",

                say: "❤️ " + hpLine(HOSPITAL_RULES.maxHp),

                rows: [
                    ["Custo", signed(-cost, formatMoney(cost))],
                    ["Proteção contra duelos", duration(HOSPITAL_RULES.protectionSeconds)],
                    null,
                    ["Carteira", formatMoney(wallet)]
                ],

                color: HELENA_COLORS.success,
                mood: "feliz",

                footer: "Curado e protegido por um tempo"
            });

            return embedResponse(embed);

        } catch (error) {
            // As mensagens do serviço são avisos ao jogador (vida cheia, sem dinheiro).
            return warningEmbed(
                "Não foi possível se curar",
                error?.message || "Tente de novo em instantes."
            );
        }
    }
};
