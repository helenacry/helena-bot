
import { listWanted } from "../../services/crime/wanted.mjs";

import { WANTED_PAGE_SIZE } from "../../config/crime.mjs";

import { safeText } from "../../services/platform/user-lookup.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

export default {
    name: "procurados",
    aliases: ["wanted"],
    description: "Veja quem tem ficha criminal no servidor",

    options: [
        {
            name: "pagina",
            description: "Número da página (opcional)",
            type: "integer",
            required: false
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;

        if (!guildId) {
            return errorEmbed(
                "Este comando só funciona em um servidor."
            );
        }

        try {
            const wanted = listWanted(
                guildId,
                interaction.data?.options?.pagina
            );

            if (wanted.total === 0) {
                return embedResponse(
                    createEmbed({
                        title: "🚨 Procurados",

                        description:
                            "Ninguém tem ficha criminal neste servidor. " +
                            "A ficha cresce a cada crime, roubo ou " +
                            "lavagem iniciada.",

                        color: HELENA_COLORS.success,

                        footer: "Helena • Servidor tranquilo."
                    })
                );
            }

            const lines = wanted.entries.map(entry =>
                "**" + entry.position + ".** " +
                safeText(entry.name) + " — " +
                entry.record +
                (entry.record === 1 ? " registro" : " registros") +
                (entry.jailed ? " ⛓️ preso" : "")
            );

            return embedResponse(
                createEmbed({
                    title: "🚨 Procurados",

                    description:
                        lines.join("\n") + "\n\n" +
                        wanted.total + " " +
                        (wanted.total === 1 ? "pessoa" : "pessoas") +
                        " com ficha criminal.",

                    color: HELENA_COLORS.warning,

                    footer:
                        "Helena • Página " + wanted.page + " de " +
                        wanted.pages +
                        (
                            wanted.pages > 1
                                ? " • /procurados pagina:" +
                                  Math.min(wanted.page + 1, wanted.pages)
                                : ""
                        ) +
                        " • " + WANTED_PAGE_SIZE + " por página"
                })
            );

        } catch (error) {
            console.error("[PROCURADOS]", error);

            return errorEmbed(
                "Não foi possível listar os procurados: " +
                error.message
            );
        }
    }
};
