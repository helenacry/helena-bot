
import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

import { status, now } from "../../services/combat/combat.mjs";

import { HOSPITAL_RULES } from "../../services/combat/hospital.mjs";

import { duration } from "../../utils/duration-text.mjs";

import { formatDuration } from "../../utils/time.mjs";

// ==========================================
// COMANDO /PROTECAOPVP
// ==========================================

// A proteção contra duelos vem de se curar no hospital (/curar).

export default {
    name: "protecaopvp",
    description: "Mostra quanto falta da sua proteção contra duelos",
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

            const remaining = Math.max(0, state.protected_until - now());

            const protectedNow = remaining > 0;

            const embed = createEmbed({
                title: "🛡️ Proteção contra duelos",

                description: protectedNow
                    ? `Você está protegido por **${formatDuration(remaining)}**.\n\n` +
                      "Nesse tempo ninguém pode te desafiar, e você também não pode desafiar."
                    : "Você está **sem proteção**.\n\n" +
                      "Ela vem ao se curar no hospital: o `/curar` dá " +
                      `**${duration(HOSPITAL_RULES.protectionSeconds)}** de proteção.`,

                color: protectedNow ? HELENA_COLORS.success : HELENA_COLORS.neutral,

                footer: "Helena • Combate"
            });

            return embedResponse(embed);

        } catch (error) {
            console.error("[PROTECAOPVP]", error);

            return errorEmbed(
                "Não foi possível consultar a sua proteção."
            );
        }
    }
};
