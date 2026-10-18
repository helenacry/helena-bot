
import { buildCooldowns } from "../economy/cooldowns-view.mjs";

import { notYours, sameUser, update } from "./panel-kit.mjs";

// ==========================================
// BOTÃO ATUALIZAR DO /COOLDOWNS
// ==========================================

// Só quem abriu a tela atualiza. Refaz a mesma tela com a hora de agora.
export function handleCooldownsClick(interaction) {
    const [, action, ownerId] = String(interaction.data?.customId ?? "").split(":");

    if (!sameUser(interaction, ownerId)) {
        return notYours();
    }

    if (action !== "atualizar" || !interaction.guildId) {
        return null;
    }

    return update(buildCooldowns({
        guildId: interaction.guildId,
        user: interaction.user
    }));
}
