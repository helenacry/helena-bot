import { getPlayer } from "../../database/economy.mjs";

import {
    equipTitle,
    unequipTitle
} from "../progress/achievements.mjs";

import { buildTitles } from "../progress/titles-view.mjs";

import {
    notYours,
    sameUser,
    update,
    warn
} from "./panel-kit.mjs";

// ==========================================
// TÍTULOS: CLIQUES
// ==========================================

// customId: tit:eq:<dono>:<página>:<conquista>, tit:rem:<dono>:<página> e tit:pg:<dono>:<página>. Só quem abriu a
// tela mexe nela. Equipar e tirar refazem a mesma tela, na mesma página, com uma linha de aviso no topo.
export function handleTitlesClick(interaction) {
    const [, action, ownerId, pageText, achievementId] = String(
        interaction.data?.customId || ""
    ).split(":");

    if (!sameUser(interaction, ownerId)) {
        return notYours();
    }

    const guildId = interaction.guildId;

    if (!guildId) {
        return null;
    }

    const page = Math.max(1, Math.trunc(Number(pageText)) || 1);

    try {
        getPlayer(guildId, ownerId);

        if (action === "pg") {
            return update(buildTitles({ guildId, userId: ownerId, page }));
        }

        if (action === "eq") {
            const result = equipTitle(guildId, ownerId, String(achievementId ?? "").toLowerCase());

            if (!result.success) {
                return warn("Título", result.reason);
            }

            return update(buildTitles({
                guildId,
                userId: ownerId,
                page,
                notice: `✨ Título equipado: **${result.title}**. Ele aparece no seu /perfil.`
            }));
        }

        if (action === "rem") {
            const removed = unequipTitle(guildId, ownerId);

            return update(buildTitles({
                guildId,
                userId: ownerId,
                page,
                notice: removed
                    ? "🏷️ Título removido. A conquista continua sua e dá para equipar de novo."
                    : "Você não tinha título equipado."
            }));
        }

        return warn("Botão desconhecido", "Esse botão não é reconhecido.");

    } catch (error) {
        console.error("[TITULOS]", error);

        return warn("Títulos", "Não foi possível mexer nos seus títulos: " + error.message);
    }
}
