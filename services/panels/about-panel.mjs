import { SUGGESTION_RULES } from "../../config/about.mjs";

import { suggestions } from "../platform/suggestions.mjs";

import { openModal, readFields, textField } from "./modals.mjs";

import { priv, warn } from "./panel-kit.mjs";

import { successEmbed } from "../../utils/embed.mjs";

import { formatDuration } from "../../utils/time.mjs";

// ==========================================
// /SOBRE: A SUGESTÃO
// ==========================================

// sobre:sugestao (botão) abre o formulário; o envio do formulário (customId sobre:sugestao) leva o texto ao canal
// dos criadores. Qualquer pessoa pode clicar: o formulário é de quem clicou.

export function handleAboutClick(interaction) {
    const [, action] = String(interaction.data?.customId ?? "").split(":");

    if (action !== "sugestao") {
        return warn("Botão desconhecido", "Esse botão não é reconhecido.");
    }

    if (!suggestions.available()) {
        return warn("Indisponível", "As sugestões não estão ligadas agora.");
    }

    return openModal({
        customId: "sobre:sugestao",
        title: "Enviar sugestão",
        fields: [textField({
            id: "texto",
            label: "Sua sugestão",
            style: "paragraph",
            placeholder: "O que a Helena poderia ter ou melhorar?",
            minLength: SUGGESTION_RULES.min,
            maxLength: SUGGESTION_RULES.max
        })]
    });
}

export async function handleAboutModal(interaction) {
    const user = interaction.user;

    const result = await suggestions.submit({
        userId: user?.id,
        name: user?.displayName || user?.username,
        guildId: interaction.guildId,
        text: readFields(interaction).texto
    });

    switch (result.status) {
        case "ok":
            return priv(successEmbed(
                "Sugestão enviada",
                "Obrigada! Os criadores leem todas. Não dá para responder por aqui, então entre no servidor de suporte se quiser conversar."
            ));

        case "short":
            return warn("Sugestão curta demais", `Escreva pelo menos ${result.min} caracteres para a gente entender a ideia.`);

        case "long":
            return warn("Sugestão longa demais", `O limite é de ${result.max} caracteres.`);

        case "wait":
            return warn("Calma um pouquinho", `Dá para mandar outra em **${formatDuration(Math.ceil(result.remainingMs / 1000))}**.`);

        case "blocked":
            return warn("Indisponível", "Você não pode enviar sugestões.");

        case "disabled":
            return warn("Indisponível", "As sugestões não estão ligadas agora.");

        default:
            return warn("Não foi possível enviar", "Tente de novo em alguns minutos.");
    }
}
