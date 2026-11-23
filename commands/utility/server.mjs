import { canManageGuild } from "../../services/platform/guild-settings.mjs";

import { NOT_ADMIN } from "../../services/panels/server-panel.mjs";

import { buildServer } from "../../services/panels/server-view.mjs";

import {
    embedResponse,
    errorEmbed,
    warningEmbed
} from "../../utils/embed.mjs";

// ==========================================
// COMANDO /SERVIDOR
// ==========================================

// Os ajustes do servidor (hoje, os drops no chat), só para quem gerencia o servidor. O Discord só manda as permissões
// de quem usa nos comandos de barra e nos botões, então pelo prefixo h o comando pede o comando de barra. O painel
// e os botões ficam em services/panels/server-view.mjs e server-panel.mjs.

export default {
    name: "servidor",
    description: "Ajuste os drops e o canal deste servidor (para admins)",

    async execute(interaction) {
        const guildId = interaction.guildId;

        if (!guildId) {
            return errorEmbed("Este comando precisa ser utilizado em um servidor.");
        }

        if (interaction.member?.permissions === null || interaction.member?.permissions === undefined) {
            return warningEmbed("Use o comando de barra", "Para mexer nos ajustes do servidor, use `/servidor` (o Discord só confirma as permissões nos comandos de barra).");
        }

        if (!canManageGuild(interaction.member.permissions)) {
            return warningEmbed("Sem permissão", NOT_ADMIN);
        }

        const view = buildServer({ guildId });

        const response = embedResponse(view.embed);

        response.data.components = view.components;

        response.data.layout = view.layout;

        return response;
    }
};
