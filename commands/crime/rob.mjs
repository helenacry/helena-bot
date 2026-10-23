
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
    embedResponse,
    errorEmbed,
    warningEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { signed } from "../../utils/receipt.mjs";

// ==========================================
// RESULTADOS
// ==========================================

// Menções em embeds não notificam ninguém, então o alvo pode ser
// citado pelo nome sem receber um aviso.

function successResponse(result, targetName) {
    const rows = [
        ["Levou no total", formatMoney(result.amount)],
        ["Limpo na carteira", signed(result.clean, formatMoney(result.clean))],
        ["Dinheiro sujo", signed(result.dirty, formatMoney(result.dirty))],
        null,
        ["Arma", result.weapon.name + " (" + result.chance + "%)"],
        ["Energia", signed(-ROBBERY_CONFIG.energyCost, ROBBERY_CONFIG.energyCost + " (" + result.energy + "/" + result.energyMax + ")")]
    ];

    if (result.spentAmmo) {
        rows.push(["Munição", "-1 bala"]);
    }

    if (result.injury) {
        rows.push(["Ferimento", signed(-result.hpLost, result.hpLost + " HP (restam " + result.hp + ")")]);
    }

    return embedResponse(
        ledgerEmbed({
            section: "Crime",
            title: "💰 Roubo bem-sucedido",

            say:
                "Você assaltou **" + targetName +
                "** e fugiu com a grana. Metade veio limpa e " +
                "metade é dinheiro sujo." +
                (result.injury ? "\n> 🩸 Você saiu ferido da fuga (" + result.injury + ")." : ""),

            rows,

            color: HELENA_COLORS.money,
            mood: "mascara",

            footer: "Lave o dinheiro sujo com /lavagem"
        })
    );
}

function failureResponse(result, targetName) {
    const rows = [
        ["Chance da arma", result.chance + "%"],
        ["Energia", signed(-ROBBERY_CONFIG.energyCost, ROBBERY_CONFIG.energyCost + " (" + result.energy + "/" + result.energyMax + ")")]
    ];

    if (result.retaliated) {
        rows.push(["Revide", signed(-result.hpLost, result.hpLost + " HP (restam " + result.hp + ")")]);
    }

    const say = result.poor
        ? "**" + targetName + "** tem pouco dinheiro na carteira " +
          "(" + formatMoney(ROBBERY_CONFIG.minTargetWallet) +
          " ou menos). Não valia o risco, e a tentativa ainda " +
          "gastou sua energia."
        : "Você não conseguiu pegar o dinheiro de **" + targetName +
          "**." +
          (
              result.retaliated
                  ? "\n> 💥 **" + targetName + "** estava armado e revidou!"
                  : ""
          );

    return embedResponse(
        ledgerEmbed({
            section: "Crime",
            title: "🚨 O roubo deu errado",

            say,

            rows,

            color: HELENA_COLORS.error,
            mood: "triste",

            footer: "Próximo roubo em " + formatDuration(ROBBERY_CONFIG.cooldown)
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
