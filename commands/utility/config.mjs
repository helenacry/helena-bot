
import { buildConfigView } from "../../services/panels/config-panel.mjs";

import { embedResponse, errorEmbed } from "../../utils/embed.mjs";

import { priv } from "../../services/panels/panel-kit.mjs";

// ==========================================
// COMANDO /CONFIG
// ==========================================

// O painel de configurações de cada pessoa. Por enquanto, o idioma: português ou inglês
// (services/panels/config-panel.mjs). É um painel pessoal, então só você o vê (pelo prefixo h,
// que não tem mensagem privada, ele sai no canal e só o dono consegue clicar).

export default {
    name: "config",
    description: "Mostra o painel de configurações: o idioma da Helena para você",

    async execute(interaction) {
        const userId = interaction.user?.id;

        if (!userId) {
            return errorEmbed("Não foi possível identificar sua conta.");
        }

        const view = buildConfigView({ ownerId: userId, userId });

        const response = embedResponse(view.embed);

        response.data.components = view.components;

        return priv(response);
    }
};
