
import { formatMoney } from "../../database/economy.mjs";

import { attemptRobbery } from "../../services/crime/robbery.mjs";

import {
    resolveUser,
    lookupProblem,
    safeText,
    shownName
} from "../../services/platform/user-lookup.mjs";

import { ROBBERY_CONFIG } from "../../config/crime.mjs";

import { GameBlocked } from "../../utils/game-error.mjs";

import { formatDuration } from "../../utils/time.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    warningEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// ==========================================
// RESULTADOS
// ==========================================

// Menções em embeds não notificam ninguém, então o alvo pode ser
// citado pelo nome sem receber um aviso.

function successResponse(result, targetName) {
    const fields = [
        {
            name: "💸 Total levado",
            value: "**" + formatMoney(result.amount) + "**",
            inline: true
        },
        {
            name: "👛 Limpo na carteira",
            value: "**+" + formatMoney(result.clean) + "**",
            inline: true
        },
        {
            name: "🧺 Dinheiro sujo",
            value: "**+" + formatMoney(result.dirty) + "**",
            inline: true
        },
        {
            name: "🔫 Arma",
            value:
                result.weapon.emoji + " " + result.weapon.name +
                " (" + result.chance + "% de chance)" +
                (result.spentAmmo ? "\n1 bala gasta" : ""),
            inline: true
        },
        {
            name: "⚡ Energia",
            value:
                "-" + ROBBERY_CONFIG.energyCost +
                " (restam " + result.energy + "/" +
                result.energyMax + ")",
            inline: true
        }
    ];

    if (result.injury) {
        fields.push({
            name: "🩸 Ferimento na fuga",
            value:
                "Ferimento **" + result.injury + "**: " +
                "**-" + result.hpLost + " HP** (restam " +
                result.hp + ")",
            inline: false
        });
    }

    return embedResponse(
        createEmbed({
            title: "💰 Roubo bem-sucedido!",

            description:
                "Você assaltou **" + targetName +
                "** e fugiu com a grana. Metade veio limpa e " +
                "metade é dinheiro sujo.",

            color: HELENA_COLORS.success,

            fields,

            footer: "Helena • Lave o dinheiro sujo com /lavagem."
        })
    );
}

function failureResponse(result, targetName) {
    const fields = [
        {
            name: "🎯 Chance da arma",
            value: result.chance + "%",
            inline: true
        },
        {
            name: "⚡ Energia",
            value:
                "-" + ROBBERY_CONFIG.energyCost +
                " (restam " + result.energy + "/" +
                result.energyMax + ")",
            inline: true
        }
    ];

    if (result.retaliated) {
        fields.push({
            name: "💥 Revide",
            value:
                "**-" + result.hpLost + " HP** (restam " +
                result.hp + ")",
            inline: false
        });
    }

    const description = result.poor
        ? "**" + targetName + "** tem pouco dinheiro na carteira " +
          "(" + formatMoney(ROBBERY_CONFIG.minTargetWallet) +
          " ou menos). Não valia o risco, e a tentativa ainda " +
          "gastou sua energia."
        : "Você não conseguiu pegar o dinheiro de **" + targetName +
          "**." +
          (
              result.retaliated
                  ? "\n\n**" + targetName + "** estava armado e revidou!"
                  : ""
          );

    return embedResponse(
        createEmbed({
            title: "🚨 O roubo deu errado",

            description,

            color: HELENA_COLORS.error,

            fields,

            footer:
                "Helena • Próximo roubo em " +
                formatDuration(ROBBERY_CONFIG.cooldown) + "."
        })
    );
}

// ==========================================
// COMANDO
// ==========================================

export default {
    name: "roubar",
    aliases: ["assaltar"],
    description: "Roube dinheiro da carteira de outro jogador",

    options: [
        {
            name: "alvo",
            description: "Nome, @menção ou ID de quem você quer roubar",
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
            const query = String(
                interaction.data?.options?.alvo ?? ""
            ).trim();

            if (!query) {
                return warningEmbed(
                    "Faltou o alvo",
                    "Diga quem você quer roubar: `/roubar alvo:<nome>` " +
                    "ou mencione a pessoa."
                );
            }

            const found = await resolveUser(guildId, query);

            const problem = lookupProblem(found, query);

            if (problem) {
                return warningEmbed(problem.title, problem.message);
            }

            if (found.user.bot) {
                return warningEmbed(
                    "Alvo inválido",
                    "Não dá para roubar um bot."
                );
            }

            const targetName = safeText(shownName(found.user));

            const result = attemptRobbery(
                guildId,
                userId,
                found.user.id
            );

            return result.success
                ? successResponse(result, targetName)
                : failureResponse(result, targetName);

        } catch (error) {
            if (error instanceof GameBlocked) {
                return warningEmbed(error.title, error.message);
            }

            console.error("[ROUBAR]", error);

            return errorEmbed(
                "Não foi possível concluir o roubo: " +
                error.message
            );
        }
    }
};
