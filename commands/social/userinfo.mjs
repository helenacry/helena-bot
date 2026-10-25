
import {
    incrementUserinfoViews
} from "../../services/social/userinfo-views.mjs";

import {
    resolveUser,
    lookupProblem
} from "../../services/platform/user-lookup.mjs";

import {
    buildUserinfoEmbed
} from "../../services/social/userinfo-view.mjs";

import {
    withAccount
} from "../../services/social/userinfo-account.mjs";

import {
    observeTarget
} from "../../services/social/userinfo-history.mjs";

import {
    privacyAction,
    privacyResponse
} from "../../services/social/userinfo-privacy.mjs";

import {
    userinfoComponents
} from "../../services/social/userinfo-components.mjs";

import {
    knownMembers
} from "../../services/panels/userinfo-panel.mjs";

import { warningEmbed } from "../../utils/embed.mjs";

// ==========================================
// UTILITÁRIOS
// ==========================================

function errorResponse(message) {
    return {
        type: "message",
        data: {
            body: "❌ " + message,
            ephemeral: true
        }
    };
}

// De quem são as informações? Sem argumento, de quem usou o comando.
// Com texto, procura a pessoa no servidor só pelo @usuário (que é
// único) ou por menção/ID: apelidos e nomes de exibição não entram na
// busca, como no /perfil.
//
// As informações de quem usou o comando. Tanto o comando de barra quanto a mensagem do
// prefixo h trazem o membro (entrada no servidor, cargos, impulso, castigo) junto da conta.
// Só se o membro faltar (conversa privada ou uma resposta incompleta) busca na API.
async function selfProfile(interaction) {
    const base = interaction.user;
    const member = interaction.member;

    if (member?.joinedAt !== undefined && member?.joinedAt !== null) {
        return { ...base, ...member };
    }

    if (!interaction.guildId || !base?.id) {
        return { ...base };
    }

    try {
        const found = await resolveUser(
            interaction.guildId,
            String(base.id)
        );

        if (found.status === "found") {
            return { ...base, ...found.user };
        }

    } catch (error) {
        console.warn(
            "[USERINFO] Não consegui buscar o seu membro na API:",
            error.message
        );
    }

    return { ...base };
}

// Devolve { user, self } ou { response } com o aviso a mostrar.
async function findTarget(interaction) {
    const query = String(
        interaction.data?.options?.usuario ?? ""
    ).trim();

    if (!query) {
        return { user: await selfProfile(interaction), self: true };
    }

    if (!interaction.guildId) {
        return {
            response: warningEmbed(
                "Indisponível",
                "Procurar outra pessoa só funciona em um servidor."
            )
        };
    }

    const found = await resolveUser(
        interaction.guildId,
        query,
        { by: "username" }
    );

    const problem = lookupProblem(
        found,
        query,
        { by: "username" }
    );

    if (problem) {
        return {
            response: warningEmbed(problem.title, problem.message)
        };
    }

    // Se a busca achou você mesmo, segue como as suas informações.
    if (found.user.id === String(interaction.user?.id)) {
        return { user: await selfProfile(interaction), self: true };
    }

    // A busca já trouxe o membro completo (insígnias, datas, cargos),
    // sem precisar de outra chamada à API.
    return {
        user: found.user,
        self: false
    };
}

// ==========================================
// COMANDO /USERINFO
// ==========================================

export default {
    name: "userinfo",
    aliases: ["ui"],
    description: "Veja as informações e insígnias de um usuário do Discord",
    options: [
        {
            name: "usuario",
            description:
                "@usuário ou menção (vazio = você). Ou ocultar, mostrar, apagar: o seu histórico",
            type: "string",
            required: false
        }
    ],

    async execute(interaction) {
        try {
            // ==================================
            // O PRÓPRIO HISTÓRICO (ocultar, mostrar, apagar)
            // ==================================
            // As palavras ocultar, mostrar e apagar no lugar do @usuário (`hui ocultar`) abrem a tela de
            // privacidade do histórico da própria pessoa; o mesmo tem o item "Meu histórico" do menu.
            const action = privacyAction(interaction.data?.options?.usuario);

            if (action) {
                return privacyResponse(String(interaction.user?.id ?? ""), action);
            }

            // ==================================
            // IDENTIFICAÇÃO
            // ==================================
            const target = await findTarget(interaction);

            if (target.response) {
                return target.response;
            }

            const { self } = target;

            const user = target.user;

            if (!user?.id) {
                return errorResponse(
                    "Não consegui identificar o usuário selecionado."
                );
            }

            // ==================================
            // CONTADOR DE VISUALIZAÇÕES
            // ==================================
            let views = null;

            try {
                views = await incrementUserinfoViews(user.id);
            } catch (viewsError) {
                console.warn(
                    "[USERINFO] Contador indisponível:",
                    viewsError
                );
            }

            // ==================================
            // CARTÃO
            // ==================================

            // O perfil completo da conta (banner, flags completas, etiqueta de servidor) para o Nitro e as
            // insígnias; se a API falhar, o cartão sai com o que já temos.
            const account = await withAccount(user);

            // quem usa a Helena ganha uma linha no histórico se o nome, a foto ou o banner mudou
            observeTarget(account);

            const embed = buildUserinfoEmbed({
                user: account,
                actorName:
                    interaction.user?.displayName ||
                    interaction.user?.username,
                actorAvatar: interaction.user?.avatarUrl,
                views
            });

            // ==================================
            // RESPOSTA
            // ==================================
            return {
                type: "message",
                data: {
                    // A mensagem menciona o dono das informações: você,
                    // nas suas, ou a pessoa pesquisada, nas de outra.
                    body: self
                        ? "<@" + user.id + ">"
                        : "Informações de <@" + user.id + ">",
                    embeds: [embed],

                    // Os dois menus embaixo do cartão: mais informações desta pessoa e ver
                    // outros membros. Só quem usou o comando mexe neles.
                    components: userinfoComponents({
                        ownerId: String(interaction.user?.id ?? ""),
                        user,
                        members: knownMembers(interaction.guildId)
                    })
                }
            };
        } catch (error) {
            console.error("[USERINFO]", error);
            return errorResponse(
                "Não foi possível carregar as informações deste usuário."
            );
        }
    }
};
