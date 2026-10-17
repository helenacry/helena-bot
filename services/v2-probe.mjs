
import { createEmbed, embedResponse } from "../utils/embed.mjs";

import { isOwner } from "./developer.mjs";

import { button, row, priv } from "./panel-kit.mjs";

// ==========================================
// SONDA DOS COMPONENTES V2 (SÓ PARA O DONO)
// ==========================================

// A documentação da VSync mostra os blocos de layout (text, separator, section,
// thumbnail, container), mas não diz como eles convivem com `body`, embeds,
// mensagens privadas e o `update`. O /devv2 manda uma mensagem de cada jeito
// para a gente ver o que a API aceita e como o app desenha, antes de converter
// qualquer painel de verdade.

export const V2_PROBE_MODES = Object.freeze({
    puro: "só componentes de layout",
    corpo: "layout + texto no body",
    embed: "layout + embed",
    tudo: "layout + body + embed",
    privado: "layout numa resposta privada"
});

function layout(note, owner, thumbnailUrl) {
    return [
        {
            type: "container",
            accentColor: "#8755DA",
            components: [
                { type: "text", content: `## 🧪 Teste de Components V2\n${note}` },
                { type: "separator", divider: true, spacing: "small" },
                {
                    type: "section",
                    texts: ["**Seção com botão**", "O botão ao lado troca esta mensagem (update)."],
                    accessory: button(`devv2:atualizar:${owner}`, "Atualizar", null, "primary")
                },
                ...(thumbnailUrl
                    ? [{
                        type: "section",
                        texts: ["**Seção com miniatura**", "A miniatura é o seu avatar."],
                        accessory: { type: "thumbnail", url: thumbnailUrl, description: "Seu avatar" }
                    }]
                    : []),
                { type: "separator", divider: false, spacing: "large" },
                row(
                    button(`devv2:classico:${owner}`, "Voltar ao clássico", "↩️"),
                    button(`devv2:sem-efeito:${owner}`, "Botão na linha", "🔘", "success")
                )
            ]
        },
        { type: "text", content: "-# texto fora do container" }
    ];
}

export function probeResponse(mode, user) {
    const owner = String(user?.id ?? "");
    const thumbnailUrl = String(user?.avatarUrl ?? "").startsWith("https://") ? user.avatarUrl : null;

    const data = { components: layout(`Modo: **${mode}** (${V2_PROBE_MODES[mode]}).`, owner, thumbnailUrl) };

    if (mode === "corpo" || mode === "tudo") {
        data.body = "Este texto está no `body` da mensagem.";
    }

    if (mode === "embed" || mode === "tudo") {
        data.embeds = [createEmbed({ title: "Embed junto do layout", description: "Se você vê isto, a API aceita as duas coisas." })];
    }

    const response = { type: "message", data };

    return mode === "privado" ? priv(response) : response;
}

export function handleProbeClick(interaction) {
    const [, action, owner] = String(interaction.data?.customId ?? "").split(":");

    const user = interaction.user;

    if (!isOwner(user?.id) || String(user?.id) !== owner) {
        return priv(embedResponse(createEmbed({
            title: "🔒 Acesso restrito",
            description: "Este teste é exclusivo do dono da Helena."
        })));
    }

    if (action === "atualizar") {
        return {
            type: "update",
            data: { components: layout(`Atualizado às **${new Date().toLocaleTimeString("pt-BR")}** pelo botão da seção.`, owner, null) }
        };
    }

    if (action === "classico") {
        return {
            type: "update",
            data: {
                body: "",
                embeds: [createEmbed({ title: "Mensagem clássica", description: "Voltou para embed + botões." })],
                components: [row(button(`devv2:atualizar:${owner}`, "Layout V2 de novo", "🧪", "primary"))]
            }
        };
    }

    return priv(embedResponse(createEmbed({
        title: "Clique recebido",
        description: "Os botões dentro do layout chegam como interações normais."
    })));
}
