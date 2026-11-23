import { buildAbout } from "../../services/panels/about-view.mjs";

import { embedResponse } from "../../utils/embed.mjs";

// ==========================================
// COMANDO /SOBRE
// ==========================================

// A versão que está no ar, os números de agora, a novidade mais recente e os links (suporte, site, wiki e
// código). O botão "Sugestão" manda uma ideia aos criadores. Tudo em services/panels/about-view.mjs.

export default {
    name: "sobre",
    description: "Veja a versão, as novidades e os links da Helena",

    async execute() {
        const view = buildAbout();

        const response = embedResponse(view.embed);

        response.data.components = view.components;

        response.data.layout = view.layout;

        return response;
    }
};
