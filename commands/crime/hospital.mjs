
import {
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { formatMoney } from "../../database/economy.mjs";

import { status, now } from "../../services/combat/combat.mjs";

import { HOSPITAL_RULES } from "../../services/combat/hospital.mjs";

import {
    hpLine,
    protectionText
} from "../../services/combat/combat-view.mjs";

// ==========================================
// COMANDO /HOSPITAL
// ==========================================

// Mostra a vida e quanto custaria se curar (/curar faz o tratamento).

export default {
    name: "hospital",
    description: "Mostra sua vida e quanto custa se curar",
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
            const state = status(guildId, userId);

            const missing = HOSPITAL_RULES.maxHp - state.hp;

            const protection = Math.max(0, state.protected_until - now());

            const full = missing <= 0;

            const embed = ledgerEmbed({
                section: "Hospital",
                title: "🏥 Hospital",

                say:
                    "❤️ " + hpLine(state.hp) + "\n" +
                    (full
                        ? "Você está com a vida cheia. Nada a tratar."
                        : "Use `/curar` para se tratar."),

                rows: [
                    [
                        "Custo para curar",
                        full ? "nada" : formatMoney(missing * HOSPITAL_RULES.costPerHp)
                    ],
                    ["Preço por ponto", formatMoney(HOSPITAL_RULES.costPerHp)],
                    ["Proteção contra duelos", protectionText(protection)]
                ],

                color: full ? HELENA_COLORS.success : HELENA_COLORS.warning,
                mood: full ? "feliz" : "triste",

                footer: "O tratamento dá proteção contra duelos"
            });

            return embedResponse(embed);

        } catch (error) {
            console.error("[HOSPITAL]", error);

            return errorEmbed(
                "Não foi possível consultar o hospital."
            );
        }
    }
};
