
import { db } from "../../database/connection.mjs";

import { resolveUser } from "../platform/user-lookup.mjs";

import { SEARCH_VALUE } from "../social/userinfo-components.mjs";

import { buildUserinfoDetail } from "../social/userinfo-view.mjs";

import { bannerImage, squareAvatar } from "../social/userinfo-image.mjs";

import { plain, safe } from "../social/userinfo-format.mjs";

import { uploadVSyncAttachment } from "../platform/vsync-attachments.mjs";

import {
    openModal,
    textField
} from "./modals.mjs";

import {
    notYours,
    priv,
    runCommand,
    sameUser,
    warn
} from "./panel-kit.mjs";

// ==========================================
// USERINFO: MENUS
// ==========================================

// Quem já joga neste servidor (jogadores com nome salvo), os mais recentes primeiro. É o que o
// segundo menu lista: a VSync não tem um seletor de pessoas, e a lista de membros inteira não
// cabe nas 25 opções de um menu.
export function knownMembers(guildId, { limit = 24 } = {}) {
    return db.prepare(`
        SELECT p.user_id AS id, n.display_name AS name, p.level AS level
        FROM players p
        JOIN player_names n ON n.user_id = p.user_id
        WHERE p.guild_id = ?
        ORDER BY n.updated_at DESC, p.user_id ASC
        LIMIT ?
    `).all(guildId, limit);
}

// O formulário da opção "Procurar por @usuário..." (o envio é tratado em panels.mjs).
function searchForm(ownerId) {
    return openModal({
        customId: `userinfo:buscar:${ownerId}`,
        title: "Ver outra pessoa",
        fields: [
            textField({
                id: "usuario",
                label: "@usuário ou menção",
                placeholder: "Ex.: mariasilva ou @mariasilva",
                maxLength: 60
            })
        ]
    });
}

// Resposta privada com um embed.
const privateEmbed = embed => priv({
    type: "message",
    data: { embeds: [embed] }
});

// O avatar e o banner vão como imagem anexada (500x500 e até 960x540), não como link em embed:
// o embed mostra a foto enorme e achatada. Anexo não vale em resposta privada (a API recusa),
// então esta resposta é uma mensagem normal do canal. Se a imagem não puder ser baixada ou
// enviada, cai no embed privado com o link, como antes.
async function imageReply(interaction, user, kind) {
    const url = kind === "avatar" ? user.avatarUrl : user.bannerUrl;

    const fallback = () => {
        const embed = buildUserinfoDetail(kind, user);

        return embed
            ? privateEmbed(embed)
            : warn("Sem esse detalhe", "Essa informação não existe para esta pessoa.");
    };

    if (!url) {
        return fallback();
    }

    try {
        const bytes = kind === "avatar" ? await squareAvatar(url) : await bannerImage(url);

        if (!bytes) {
            return fallback();
        }

        const safeId = String(user.id).replace(/[^a-zA-Z0-9_-]/g, "_");

        const attachment = await uploadVSyncAttachment({
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            bytes,
            filename: `${kind}-${safeId}.png`,
            contentType: "image/png"
        });

        if (!attachment?.reference) {
            return fallback();
        }

        const name = safe(plain(user.nickname || user.displayName || user.username || "Usuário", 80));

        return {
            type: "message",

            data: {
                body: (kind === "avatar" ? "🖼️ **Avatar de " : "🌌 **Banner de ") + name + "**",
                attachments: [attachment.reference]
            }
        };

    } catch (error) {
        console.warn("[USERINFO] Não consegui enviar a imagem:", error.message);

        return fallback();
    }
}

// customId: userinfo:more:<dono>:<alvo> ou userinfo:other:<dono> (a escolha vem em data.values).
// Assíncrono: busca a pessoa na API e roda o /userinfo dela.
export async function handleUserinfoComponent(interaction, comandos) {
    const [, action, ownerId, targetId] = String(
        interaction.data?.customId || ""
    ).split(":");

    if (!sameUser(interaction, ownerId)) {
        return notYours();
    }

    const choice = interaction.data?.values?.[0];

    if (!choice) {
        return warn("Escolha uma opção", "Abra o menu e escolha uma das opções.");
    }

    // ----------------------------------
    // MAIS INFORMAÇÕES
    // ----------------------------------

    if (action === "more") {
        const found = await resolveUser(interaction.guildId, targetId);

        if (found.status !== "found") {
            return warn("Pessoa não encontrada", "Não achei essa pessoa neste servidor agora.");
        }

        const person = { ...found.user, ...found.user.raw };

        if (choice === "avatar" || choice === "banner") {
            return imageReply(interaction, person, choice);
        }

        const embed = buildUserinfoDetail(choice, person);

        return embed
            ? privateEmbed(embed)
            : warn("Sem esse detalhe", "Essa informação não existe para esta pessoa.");
    }

    // ----------------------------------
    // OUTROS MEMBROS
    // ----------------------------------

    if (action === "other") {
        if (choice === SEARCH_VALUE) {
            return searchForm(ownerId);
        }

        // o cartão da pessoa escolhida, só para quem pediu (a mensagem do comando menciona a
        // pessoa no body, e aqui ninguém deve ser notificado)
        return runCommand(
            comandos,
            "userinfo",
            { usuario: `<@${choice}>` },
            interaction,
            { ephemeral: true }
        );
    }

    return warn("Menu desconhecido", "Esse menu não é reconhecido.");
}
