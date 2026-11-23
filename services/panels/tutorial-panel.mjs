import { formatMoney, getPlayer } from "../../database/economy.mjs";

import { claimTutorial } from "../progress/tutorial.mjs";

import { buildTutorial } from "../progress/tutorial-view.mjs";

import {
    notYours,
    sameUser,
    update,
    warn
} from "./panel-kit.mjs";

// ==========================================
// TUTORIAL: CLIQUES
// ==========================================

// customId: tut:ref:<dono> (reconfere os passos) e tut:claim:<dono> (paga o prêmio). Só quem abriu mexe.
export function handleTutorialClick(interaction) {
    const [, action, ownerId] = String(interaction.data?.customId || "").split(":");

    if (!sameUser(interaction, ownerId)) {
        return notYours();
    }

    const guildId = interaction.guildId;

    if (!guildId) {
        return null;
    }

    try {
        getPlayer(guildId, ownerId);

        if (action === "ref") {
            return update(buildTutorial({ guildId, userId: ownerId }));
        }

        if (action === "claim") {
            const result = claimTutorial(guildId, ownerId);

            if (result.status === "claimed") {
                return warn("Prêmio já recebido", "Você já resgatou o prêmio do tutorial neste servidor.");
            }

            if (result.status === "incomplete") {
                return warn("Ainda faltam passos", `Você fez ${result.completed} de ${result.total}.`);
            }

            return update(buildTutorial({
                guildId,
                userId: ownerId,
                notice:
                    `🎉 Prêmio resgatado: **+${formatMoney(result.money)}** e **+${result.xp} XP**` +
                    (result.leveledUp ? " · 🎊 Você subiu de nível!" : "")
            }));
        }

        return warn("Botão desconhecido", "Esse botão não é reconhecido.");

    } catch (error) {
        console.error("[TUTORIAL]", error);

        return warn("Tutorial", "Não foi possível processar o tutorial: " + error.message);
    }
}
