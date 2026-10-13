
import { formatMoney, getPlayer } from "../database/economy.mjs";

import {
    resolveUser,
    lookupProblem,
    normalizeName
} from "./user-lookup.mjs";

import {
    openModal,
    textField,
    readFields
} from "./modals.mjs";

import {
    handleShopClick,
    handleShopModal,
    handleInventoryClick,
    handleInventoryModal
} from "./shop-panels.mjs";

import {
    handleUseClick,
    handleUseModal
} from "./use-panel.mjs";

import { handleMarketClick } from "./market-panel.mjs";

import {
    handleHelpClick,
    handleHelpModal
} from "./help-panel.mjs";

import {
    button,
    row,
    warn,
    notYours,
    runCommand
} from "./panel-kit.mjs";

import { LAUNDERING_CONFIG } from "../config/crime.mjs";

// ==========================================
// PAINÉIS COM BOTÕES E MODAIS
// ==========================================

// Alguns comandos mostram um painel: botões que abrem um formulário
// (modal). O envio do formulário roda o comando de sempre com as
// opções preenchidas, então as regras (limites, prisão, recargas)
// continuam num lugar só.
//
//   banco:dep|sac|trf:<dono>                 /saldo
//   lavagem:publica|privada|liberar:<dono>   /lavagem
//   bio:editar:<dono>                        /bio
//   loja:...                                 /loja        (shop-panels.mjs)
//   inv:...                                  /inventario  (shop-panels.mjs)
//   bolsa:atualizar|fechar:<dono>            /bolsa       (market-panel.mjs)
//   ajuda:...                                /ajuda       (help-panel.mjs)
//
// O ID do dono vai no customId: os botões pessoais só funcionam
// para quem abriu o painel. O envio do modal leva o customId do
// modal (sem o dono): a VSync só entrega o envio para quem o abriu.

const BIO_MAX_LENGTH = 160;

// ==========================================
// BOTÕES (usados pelos comandos)
// ==========================================

export function bankPanel(userId) {
    return [row(
        button(`banco:dep:${userId}`, "Depositar", "🏦", "success"),
        button(`banco:sac:${userId}`, "Sacar", "💵", "primary"),
        button(`banco:trf:${userId}`, "Transferir", "💸")
    )];
}

export function launderingPanel(userId, { privateUnlocked }) {
    return [row(
        button(`lavagem:publica:${userId}`, "Lavar (pública)", "🏭", "primary"),

        privateUnlocked
            ? button(`lavagem:privada:${userId}`, "Lavar (privada)", "🔐", "success")
            : button(`lavagem:liberar:${userId}`, "Liberar privada", "🔒")
    )];
}

export function bioPanel(userId) {
    return [row(
        button(`bio:editar:${userId}`, "Editar bio", "✏️", "primary")
    )];
}

// ==========================================
// CLIQUE NUM BOTÃO OU MENU
// ==========================================

// Devolve a resposta (abrir o modal, atualizar a tela ou um aviso)
// ou null se o componente não é de nenhum painel.
export function handlePanelClick(interaction) {
    const [area, action, ownerId] = String(
        interaction.data?.customId || ""
    ).split(":");

    // A loja e o inventário têm as próprias regras de dono.
    if (area === "loja") {
        return handleShopClick(interaction);
    }

    if (area === "inv") {
        return handleInventoryClick(interaction);
    }

    if (area === "uso") {
        return handleUseClick(interaction);
    }

    if (area === "bolsa") {
        return handleMarketClick(interaction);
    }

    if (area === "ajuda") {
        return handleHelpClick(interaction);
    }

    const userId = interaction.user?.id;

    const personal = ["banco", "lavagem", "bio"].includes(area);

    if (personal && String(userId) !== String(ownerId)) {
        return notYours();
    }

    if (area === "banco") {
        const amount = textField({
            id: "quantia",
            label: "Quantia (reais, tudo ou all)",
            placeholder: "Ex.: 500 ou tudo",
            maxLength: 20
        });

        if (action === "dep") {
            return openModal({
                customId: "banco:dep",
                title: "Depositar no banco",
                fields: [amount]
            });
        }

        if (action === "sac") {
            return openModal({
                customId: "banco:sac",
                title: "Sacar do banco",
                fields: [amount]
            });
        }

        if (action === "trf") {
            return openModal({
                customId: "banco:trf",
                title: "Transferir dinheiro",
                fields: [
                    textField({
                        id: "destinatario",
                        label: "Destinatário",
                        placeholder: "Nome, @menção ou ID",
                        maxLength: 80
                    }),
                    amount
                ]
            });
        }
    }

    if (area === "lavagem") {
        const { minAmount, maxAmount, privateUnlockGems } =
            LAUNDERING_CONFIG;

        if (action === "publica" || action === "privada") {
            return openModal({
                customId: `lavagem:${action}`,
                title: action === "publica"
                    ? "Lavar na lavanderia pública"
                    : "Lavar na lavanderia privada",
                fields: [textField({
                    id: "valor",
                    label: "Valor sujo (reais, tudo ou all)",
                    placeholder:
                        "De " + formatMoney(minAmount) +
                        " a " + formatMoney(maxAmount),
                    maxLength: 20
                })]
            });
        }

        if (action === "liberar") {
            return openModal({
                customId: "lavagem:liberar",
                title: "Liberar lavanderia privada",
                fields: [textField({
                    id: "confirmacao",
                    label: "Digite LIBERAR para confirmar",
                    placeholder:
                        "Custa " + privateUnlockGems +
                        " gemas, uma única vez neste servidor",
                    maxLength: 20
                })]
            });
        }
    }

    if (area === "bio" && action === "editar") {
        const current = String(
            getPlayer(interaction.guildId, userId).bio ?? ""
        ).slice(0, BIO_MAX_LENGTH);

        return openModal({
            customId: "bio:editar",
            title: "Editar bio",
            fields: [textField({
                id: "texto",
                label: "Sua bio (até 160 caracteres)",
                style: "paragraph",
                placeholder: "Conte um pouco sobre você",
                maxLength: BIO_MAX_LENGTH,
                ...(current ? { value: current } : {})
            })]
        });
    }

    return ["banco", "lavagem", "bio"].includes(area)
        ? warn("Botão desconhecido", "Esse botão não é reconhecido.")
        : null;
}

// ==========================================
// ENVIO DO MODAL
// ==========================================

// Devolve a resposta ou null se o modal não é de nenhum painel.
export async function handleModalSubmit(interaction, comandos) {
    const [area, action] = String(
        interaction.data?.customId || ""
    ).split(":");

    if (!["banco", "lavagem", "bio", "loja", "inv", "uso", "ajuda"].includes(area)) {
        return null;
    }

    const guildId = interaction.guildId;

    if (!guildId || !interaction.user?.id) {
        return warn("Indisponível", "Isso só funciona em um servidor.");
    }

    // ----------------------------------
    // LOJA E INVENTÁRIO
    // ----------------------------------

    if (area === "loja") {
        return handleShopModal(interaction, comandos);
    }

    if (area === "inv") {
        return action === "descartar"
            ? handleInventoryModal(interaction)
            : warn("Formulário desconhecido", "Esse formulário não é reconhecido.");
    }

    if (area === "uso") {
        return action === "varios"
            ? handleUseModal(interaction)
            : warn("Formulário desconhecido", "Esse formulário não é reconhecido.");
    }

    if (area === "ajuda") {
        return handleHelpModal(interaction);
    }

    const fields = readFields(interaction);

    // ----------------------------------
    // BANCO
    // ----------------------------------

    if (area === "banco") {
        const amount = (fields.quantia ?? "").trim();

        if (!amount) {
            return warn("Faltou a quantia", "Informe quanto, ou `tudo`.");
        }

        if (action === "dep") {
            return runCommand(comandos, "depositar", { quantia: amount }, interaction);
        }

        if (action === "sac") {
            return runCommand(comandos, "sacar", { quantia: amount }, interaction);
        }

        if (action === "trf") {
            const query = (fields.destinatario ?? "").trim();

            if (!query) {
                return warn("Faltou o destinatário", "Diga quem vai receber.");
            }

            const found = await resolveUser(guildId, query);

            const problem = lookupProblem(found, query);

            if (problem) {
                return warn(problem.title, problem.message);
            }

            if (found.user.bot) {
                return warn("Destinatário inválido", "Não dá para transferir para um bot.");
            }

            // A transferência é pública: quem recebe precisa ver.
            return runCommand(
                comandos,
                "transferir",
                { usuario: found.user.id, quantia: amount },
                interaction,
                { ephemeral: false }
            );
        }
    }

    // ----------------------------------
    // LAVAGEM
    // ----------------------------------

    if (area === "lavagem") {
        if (action === "publica" || action === "privada") {
            const value = (fields.valor ?? "").trim();

            if (!value) {
                return warn("Faltou o valor", "Informe quanto lavar, ou `tudo`.");
            }

            return runCommand(
                comandos,
                "lavagem",
                { valor: value, tipo: action },
                interaction
            );
        }

        if (action === "liberar") {
            if (normalizeName(fields.confirmacao) !== "liberar") {
                return warn(
                    "Confirmação incorreta",
                    "Para liberar a lavanderia privada, digite **LIBERAR**. Nada foi cobrado."
                );
            }

            return runCommand(
                comandos,
                "lavagem",
                { valor: "desbloquear" },
                interaction
            );
        }
    }

    // ----------------------------------
    // BIO
    // ----------------------------------

    if (area === "bio" && action === "editar") {
        return runCommand(
            comandos,
            "bio",
            { texto: fields.texto ?? "" },
            interaction
        );
    }

    return warn("Formulário desconhecido", "Esse formulário não é reconhecido.");
}
