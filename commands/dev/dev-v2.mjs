import { devReply, deny, guard } from "../../utils/developer-response.mjs";

import { option } from "../../services/platform/developer.mjs";

import { V2_PROBE_MODES, probeResponse } from "../../services/platform/v2-probe.mjs";

export default {
    name: "devv2",
    description: "Teste dos componentes de layout V2 (só o dono)",

    options: [
        {
            name: "modo",
            description: `Um de: ${Object.keys(V2_PROBE_MODES).join(", ")} (padrão: puro)`,
            type: "string",
            required: false
        }
    ],

    async execute(interaction) {
        if (!guard(interaction)) {
            return deny();
        }

        const mode = String(option(interaction, "modo") ?? "puro").trim().toLowerCase() || "puro";

        if (!Object.hasOwn(V2_PROBE_MODES, mode)) {
            return devReply(
                "Modo inválido",
                Object.entries(V2_PROBE_MODES).map(([name, text]) => `**${name}**: ${text}`).join("\n")
            );
        }

        return probeResponse(mode, interaction.user);
    }
};
