
import { db } from "../../database/connection.mjs";

import { resolveUser } from "../platform/user-lookup.mjs";

import { withAccount } from "../social/userinfo-account.mjs";

import { SEARCH_VALUE } from "../social/userinfo-components.mjs";

import { buildUserinfoDetail } from "../social/userinfo-view.mjs";

import { observeTarget, readHistory } from "../social/userinfo-history.mjs";

import { PRIVACY_MENU_VALUE, privacyView } from "../social/userinfo-privacy.mjs";

import {
    DECLARED_KINDS,
    clearDeclared,
    parseDeclaredDate,
    setDeclared,
    withDeclared
} from "../social/userinfo-declared.mjs";

import { dateField } from "../social/userinfo-format.mjs";

import {
    openModal,
    textField
} from "./modals.mjs";

import {
    notYours,
    priv,
    runCommand,
    sameUser,
    update,
    warn
} from "./panel-kit.mjs";

// ==========================================
// USERINFO: MENUS
// ==========================================

// Quem já joga neste servidor (jogadores com nome salvo), os mais recentes primeiro. É o que o
// segundo menu lista: um menu de texto não tem seletor de pessoas, e a lista de membros inteira não
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

// O formulário de uma data informada (userinfo:declare:<dono>:<tipo>; o envio é tratado abaixo).
function declareForm(ownerId, kind) {
    return openModal({
        customId: `userinfo:declare:${ownerId}:${kind}`,
        title: kind === "nitro" ? "Desde quando você assina o Nitro?" : "Desde quando você impulsiona?",
        fields: [
            textField({
                id: "data",
                label: "Data (dd/mm/aaaa) e hora, se souber",
                placeholder: "07/03/2026  ou  07/03/2026 09:18",
                required: false,
                maxLength: 20
            })
        ]
    });
}

/** O envio do formulário: guarda a data (ou, vazio, tira) e volta à tela de privacidade. */
export function handleDeclareModal(interaction) {
    const [, , ownerId, kind] = String(interaction.data?.customId ?? "").split(":");

    if (!sameUser(interaction, ownerId)) {
        return notYours();
    }

    if (!DECLARED_KINDS.includes(kind)) {
        return warn("Formulário desconhecido", "Esse formulário não é reconhecido.");
    }

    const raw = String((interaction.data?.fields ?? []).find(field => field.customId === "data")?.value ?? "").trim();

    const label = kind === "nitro" ? "Nitro" : "impulso";

    if (!raw) {
        setDeclared(ownerId, kind, null);

        return update(privacyView(ownerId, "status", { notice: `✅ Tirei a data do ${label}.` }));
    }

    const parsed = parseDeclaredDate(raw, kind);

    if (!parsed.ok) {
        return warn("Data inválida", parsed.reason);
    }

    setDeclared(ownerId, kind, parsed.time, parsed.exact);

    return update(privacyView(ownerId, "status", {
        notice: `✅ Guardei: ${label} desde ${dateField(parsed.time, { time: parsed.exact })}. Aparece no seu /userinfo, marcado como informado.`
    }));
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

    // ----------------------------------
    // OS BOTÕES DE "MEU HISTÓRICO" (ocultar, mostrar, apagar)
    // ----------------------------------

    if (action === "priv") {
        if (!["ocultar", "mostrar", "apagar"].includes(targetId)) {
            return warn("Botão desconhecido", "Esse botão não é reconhecido.");
        }

        return update(privacyView(ownerId, targetId));
    }

    // ----------------------------------
    // OS BOTÕES DAS DATAS INFORMADAS (Nitro, impulso, limpar)
    // ----------------------------------

    if (action === "decl") {
        if (targetId === "limpar") {
            clearDeclared(ownerId);

            return update(privacyView(ownerId, "status", { notice: "✅ Apaguei as datas que você tinha informado." }));
        }

        if (!DECLARED_KINDS.includes(targetId)) {
            return warn("Botão desconhecido", "Esse botão não é reconhecido.");
        }

        return declareForm(ownerId, targetId);
    }

    const choice = interaction.data?.values?.[0];

    if (!choice) {
        return warn("Escolha uma opção", "Abra o menu e escolha uma das opções.");
    }

    // ----------------------------------
    // MAIS INFORMAÇÕES
    // ----------------------------------

    if (action === "more") {
        // "Meu histórico": só no próprio cartão, abre a tela de privacidade com os três botões
        if (choice === PRIVACY_MENU_VALUE) {
            if (String(targetId) !== String(ownerId)) {
                return warn("Só no seu cartão", "O histórico só pode ser mexido por quem ele é: abra o seu `/userinfo`.");
            }

            const view = privacyView(ownerId, "status");

            return priv({ type: "message", data: { embeds: [view.embed], components: view.components } });
        }

        const found = await resolveUser(interaction.guildId, targetId);

        if (found.status !== "found") {
            return warn("Pessoa não encontrada", "Não achei essa pessoa neste servidor agora.");
        }

        // o banner, as flags completas e a etiqueta só existem no perfil completo da conta: busca só
        // para as telas que precisam deles
        const needsAccount = ["banner", "colors", "badges", "nitro", "oldbanners"].includes(choice);

        // as datas de Nitro e de impulso que a própria pessoa informou (o Discord não entrega a bots)
        const person = withDeclared(needsAccount ? await withAccount(found.user) : found.user);

        // as telas de histórico: anota o que mudou agora (só se a pessoa usa a Helena) e lê o que há
        let history;

        if (["names", "oldavatars", "oldbanners"].includes(choice)) {
            observeTarget(person);

            history = readHistory(person.id);
        }

        const embed = buildUserinfoDetail(choice, person, Date.now(), { history });

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
