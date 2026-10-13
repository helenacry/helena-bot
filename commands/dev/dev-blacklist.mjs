
import {
    devReply,
    deny,
    guard
} from "../../utils/developer-response.mjs";

import { isValidId } from "../../utils/ids.mjs";

import {
    option,
    userId,
    logDev,
    setBlocked,
    unblock,
    isOwner,
    blocked
} from "../../services/developer.mjs";

const ACTIONS = {
    BLOCK: "block",
    UNBLOCK: "unblock"
};

export default {
    name: "devblacklist",

    description: "Bloqueia ou libera um usuário",

    options: [
        {
            name: "acao",
            description: "Bloquear ou liberar",
            type: "string",
            required: true,
            choices: [
                {
                    name: "Bloquear",
                    value: ACTIONS.BLOCK
                },
                {
                    name: "Liberar",
                    value: ACTIONS.UNBLOCK
                }
            ]
        },
        {
            name: "usuario",
            description: "ID do usuário",
            type: "string",
            required: true
        },
        {
            name: "motivo",
            description: "Motivo do bloqueio",
            type: "string",
            required: false
        }
    ],

    async execute(interaction) {
        // Apenas desenvolvedores autorizados.
        if (!guard(interaction)) {
            return deny();
        }

        try {
            const actorId = userId(interaction);

            const targetId = String(
                option(interaction, "usuario") ?? ""
            ).trim();

            const action = option(
                interaction,
                "acao"
            );

            const reason = String(
                option(interaction, "motivo") ??
                "Sem motivo informado"
            ).trim().slice(0, 300) || "Sem motivo informado";

            // ==================================
            // VALIDAÇÕES
            // ==================================

            if (!isValidId(targetId)) {
                throw new Error(
                    "Informe um ID de usuário válido."
                );
            }

            if (
                action !== ACTIONS.BLOCK &&
                action !== ACTIONS.UNBLOCK
            ) {
                throw new Error(
                    "Ação inválida. Utilize block ou unblock."
                );
            }

            if (isOwner(targetId)) {
                throw new Error(
                    "Não é permitido bloquear ou alterar a blacklist de um proprietário."
                );
            }

            // ==================================
            // BLOQUEAR
            // ==================================

            if (action === ACTIONS.BLOCK) {
                if (blocked(targetId)) {
                    return devReply(
                        "⚠️ Blacklist",
                        `O usuário ${targetId} já está bloqueado.`
                    );
                }

                setBlocked(targetId, reason);

                logDev(
                    actorId,
                    "blacklist",
                    `block: ${targetId} | Motivo: ${reason}`
                );

                return devReply(
                    "🚫 Blacklist",
                    `Usuário ${targetId} bloqueado com sucesso.\n\n**Motivo:** ${reason}`
                );
            }

            // ==================================
            // DESBLOQUEAR
            // ==================================

            if (!blocked(targetId)) {
                return devReply(
                    "⚠️ Blacklist",
                    `O usuário ${targetId} não está bloqueado.`
                );
            }

            unblock(targetId);

            logDev(
                actorId,
                "blacklist",
                `unblock: ${targetId}`
            );

            return devReply(
                "✅ Blacklist",
                `Usuário ${targetId} liberado com sucesso.`
            );

        } catch (error) {
            console.error(
                "[DEV BLACKLIST]",
                error
            );

            return devReply(
                "❌ Falha",
                error.message ||
                "Não foi possível executar esta operação.",
                "#EF4444"
            );
        }
    }
};