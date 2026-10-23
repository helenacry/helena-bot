
import {
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { status, now, DUEL_RULES } from "../../services/combat/combat.mjs";

import { getEquippedWeapon } from "../../services/combat/equipment.mjs";

import {
    hpLine,
    durabilityLine,
    protectionText
} from "../../services/combat/combat-view.mjs";

// ==========================================
// COMANDO /STATUSCOMBATE
// ==========================================

// O resumo de combate: vida, histórico de duelos, equipamento e proteção.

export default {
    name: "statuscombate",
    description: "Mostra sua vida, vitórias, derrotas e equipamento",
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

            const weapon = getEquippedWeapon(guildId, userId);

            const protection = Math.max(0, state.protected_until - now());

            const notes = [];

            if (state.hp < DUEL_RULES.minHp) {
                notes.push(
                    `⚠️ Com menos de **${DUEL_RULES.minHp}** de vida você não duela. ` +
                    "Use `/curar`."
                );
            }

            const embed = ledgerEmbed({
                section: "Combate",
                title: "❤️ Estado de combate",

                say:
                    "❤️ " + hpLine(state.hp) + "\n" +
                    "🔧 " + durabilityLine(state.durability) +
                    notes.map(note => "\n> " + note).join(""),

                rows: [
                    ["Vitórias", String(state.wins)],
                    ["Derrotas", String(state.losses)],
                    null,
                    ["Arma", weapon ? weapon.name : "nenhuma"],
                    ["Munição", String(state.ammo)],
                    ["Defesa", `${state.vest} pontos`],
                    ["Proteção", protectionText(protection)]
                ],

                color: state.hp < DUEL_RULES.minHp ? HELENA_COLORS.warning : HELENA_COLORS.primary,
                mood: "bravo",

                footer: "Os duelos começam com /atacar"
            });

            return embedResponse(embed);

        } catch (error) {
            console.error("[STATUSCOMBATE]", error);

            return errorEmbed(
                "Não foi possível consultar o seu estado de combate."
            );
        }
    }
};
