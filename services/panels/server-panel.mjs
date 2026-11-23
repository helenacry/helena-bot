import { canManageGuild, updateGuildSettings } from "../platform/guild-settings.mjs";

import { buildServer } from "./server-view.mjs";

import { update, warn } from "./panel-kit.mjs";

// ==========================================
// /SERVIDOR: CLIQUES
// ==========================================

// customId: srv:drops:on|off e srv:canal:aqui|todos. Não há "dono" do painel: vale para quem gerencia o servidor
// (Administrador ou Gerenciar servidor), conferido a cada clique pelas permissões que o Discord manda.
export const NOT_ADMIN = "Só quem gerencia o servidor (Administrador ou Gerenciar servidor) pode mudar estes ajustes.";

export function handleServerClick(interaction) {
    const [, action, value] = String(interaction.data?.customId ?? "").split(":");

    const guildId = interaction.guildId;

    if (!guildId) {
        return null;
    }

    if (!canManageGuild(interaction.member?.permissions)) {
        return warn("Sem permissão", NOT_ADMIN);
    }

    try {
        if (action === "drops" && (value === "on" || value === "off")) {
            updateGuildSettings(guildId, { dropsEnabled: value === "on" });

            return update(buildServer({
                guildId,
                notice: value === "on"
                    ? "🔔 Drops ligados. A Helena solta presentes quando a conversa esquentar."
                    : "🔕 Drops desligados."
            }));
        }

        if (action === "canal" && (value === "aqui" || value === "todos")) {
            if (value === "aqui" && !interaction.channelId) {
                return warn("Canal desconhecido", "Não foi possível saber em que canal você está.");
            }

            updateGuildSettings(guildId, { dropsChannelId: value === "aqui" ? interaction.channelId : "" });

            return update(buildServer({
                guildId,
                notice: value === "aqui"
                    ? `📍 Os drops agora aparecem só em <#${interaction.channelId}>.`
                    : "🌐 Os drops podem aparecer em qualquer canal com conversa."
            }));
        }

        return warn("Botão desconhecido", "Esse botão não é reconhecido.");

    } catch (error) {
        console.error("[SERVIDOR]", error);

        return warn("Servidor", "Não foi possível salvar o ajuste: " + error.message);
    }
}
