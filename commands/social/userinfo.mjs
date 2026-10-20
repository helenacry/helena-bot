
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
    completeUser
} from "../../services/social/userinfo-account.mjs";

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
// único) ou por menção/ID: apelidos e nomes de exibição das
// plataformas não entram na busca, como no /perfil.
//
// As informações de quem usou o comando. O comando de barra traz o membro na
// própria interação (joinedAt, apelido...), mas a mensagem do prefixo traz só o
// autor: sem data de entrada, e sem insígnias nem datas da conta. Nesse caso busca
// o membro na API (GET /guilds/:g/members/:id), a mesma rota das outras pessoas.
// Se a API falhar, segue com o que já tem (a data aparece como não informada).
async function selfProfile(interaction) {
    const base = interaction.user;
    const member = interaction.member;

    // Só a data de entrada vem da interação: o resto do membro tem campos de
    // SERVIDOR com o mesmo nome de campos da CONTA (como pulsingSince), e misturar
    // tudo trocaria um pelo outro.
    const joined =
        member?.joinedAt !== undefined && member?.joinedAt !== null
            ? { joinedAt: member.joinedAt }
            : {};

    const known = { ...base, ...joined };

    // Quem pulsa mas veio sem nada do Pulse na interação precisa do membro da API
    // para mostrar desde quando (e os selos).
    const lacksPulse =
        Boolean(base?.pulsing) &&
        !base?.pulsingSince &&
        !base?.nextPulseBadge;

    if (joined.joinedAt !== undefined && !lacksPulse) {
        return known;
    }

    if (!interaction.guildId || !base?.id) {
        return known;
    }

    try {
        const found = await resolveUser(
            interaction.guildId,
            String(base.id)
        );

        if (found.status === "found") {
            return { ...base, ...found.user, ...found.user.raw, ...joined };
        }

    } catch (error) {
        console.warn(
            "[USERINFO] Não consegui buscar o seu membro na API:",
            error.message
        );
    }

    return known;
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

    // A busca já trouxe o membro completo (insígnias, Pulse,
    // Prisma+, datas), sem precisar de outra chamada à API.
    return {
        user: { ...found.user, ...found.user.raw },
        self: false
    };
}

// ==========================================
// COMANDO /USERINFO
// ==========================================

export default {
    name: "userinfo",
    aliases: ["ui"],
    description: "Veja as informações e insígnias de um usuário do VSync",
    options: [
        {
            name: "usuario",
            description:
                "@usuário ou @menção de quem você quer ver (vazio = você)",
            type: "string",
            required: false
        }
    ],

    async execute(interaction) {
        try {
            // ==================================
            // IDENTIFICAÇÃO
            // ==================================
            const target = await findTarget(interaction);

            if (target.response) {
                return target.response;
            }

            const { self } = target;

            // completa a data do Prisma pelo perfil da conta quando o membro veio sem ela
            const user = await completeUser(target.user);

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
            const embed = buildUserinfoEmbed({
                user,
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
