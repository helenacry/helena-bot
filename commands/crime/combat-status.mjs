
import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

import { status, now, DUEL_RULES } from "../../services/combat.mjs";

import { getEquippedWeapon } from "../../services/equipment.mjs";

import {
    hpLine,
    durabilityLine,
    protectionText
} from "../../services/combat-view.mjs";

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

            const embed = createEmbed({
                title: "❤️ Estado de combate",

                description: [hpLine(state.hp), ...notes].join("\n\n"),

                color: HELENA_COLORS.primary,

                fields: [
                    { name: "🏆 Vitórias", value: String(state.wins), inline: true },
                    { name: "💀 Derrotas", value: String(state.losses), inline: true },
                    {
                        name: "🛡️ Proteção",
                        value: protectionText(protection),
                        inline: true
                    },
                    {
                        name: "🗡️ Arma",
                        value: weapon
                            ? `${weapon.emoji} ${weapon.name}`
                            : "Nenhuma",
                        inline: true
                    },
                    { name: "🔫 Munição", value: String(state.ammo), inline: true },
                    { name: "🛡️ Defesa", value: `${state.vest} pontos`, inline: true },
                    {
                        name: "🔧 Durabilidade da arma",
                        value: durabilityLine(state.durability),
                        inline: false
                    }
                ],

                footer: "Helena • Combate"
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
