
import { formatMoney, getPlayer } from "../database/economy.mjs";

import { prisonBlock } from "./prison.mjs";

import {
    resolveUser,
    lookupProblem,
    normalizeName,
    safeText
} from "./user-lookup.mjs";

import {
    openModal,
    textField,
    readFields
} from "./modals.mjs";

import { ITEMS } from "../config/items.mjs";

import { LAUNDERING_CONFIG } from "../config/crime.mjs";

import { warningEmbed } from "../utils/embed.mjs";

// ==========================================
// PAINÉIS COM BOTÕES E MODAIS
// ==========================================

// Alguns comandos mostram um painel: botões que abrem um formulário
// (modal). O envio do formulário roda o comando de sempre com as
// opções preenchidas, então as regras (limites, prisão, recargas)
// continuam num lugar só.
//
//   banco:dep|sac|trf:<dono>             /saldo
//   lavagem:publica|privada|liberar:<dono>   /lavagem
//   bio:editar:<dono>                    /bio
//   loja:comprar                         /loja
//
// O ID do dono vai no customId: os botões pessoais só funcionam
// para quem abriu o painel. O envio do modal leva o customId do
// modal (sem o dono): a VSync só entrega o envio para quem o abriu.

const BIO_MAX_LENGTH = 160;

const button = (customId, label, emoji, style = "secondary") => ({
    type: "button",
    customId,
    label,
    emoji,
    style
});

const row = (...components) => ({ type: "row", components });

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

export function shopPanel() {
    return [row(
        button("loja:comprar", "Comprar", "🛒", "success")
    )];
}

// ==========================================
// RESPOSTAS
// ==========================================

// Marca uma resposta de mensagem como privada (só quem agiu vê).
function priv(response) {
    return response?.type === "message"
        ? { ...response, data: { ...response.data, ephemeral: true } }
        : response;
}

const warn = (title, message) => priv(warningEmbed(title, message));

const notYours = () => warn(
    "Esse painel é de outra pessoa",
    "Use o comando para abrir o seu próprio painel."
);

// ==========================================
// EXECUTAR UM COMANDO A PARTIR DO MODAL
// ==========================================

async function runCommand(
    comandos,
    name,
    options,
    interaction,
    { ephemeral = true } = {}
) {
    const comando = comandos.get(name);

    if (!comando) {
        return warn("Indisponível", "Esse comando não está disponível.");
    }

    // Preso não movimenta dinheiro: vale também pelos modais.
    const blocked = prisonBlock(
        name,
        interaction.guildId,
        interaction.user?.id
    );

    if (blocked) {
        return priv(blocked);
    }

    const result = await comando.execute({
        id: interaction.id,
        type: "command",
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        user: interaction.user,
        data: { name, options }
    });

    return ephemeral ? priv(result) : result;
}

// ==========================================
// ITEM DA LOJA POR NOME OU ID
// ==========================================

// Aceita o ID ou o nome, sem diferenciar maiúsculas nem acentos.
// Prefere igual > começa com > contém, como a busca de usuários.
function findShopItem(text) {
    const wanted = normalizeName(text);

    if (!wanted) {
        return [];
    }

    let best = Infinity;

    const ranked = [];

    for (const item of ITEMS) {
        if (!Number.isSafeInteger(item.buyPrice) || item.buyPrice <= 0) {
            continue;
        }

        let rank = Infinity;

        for (const name of [item.id, item.name].map(normalizeName)) {
            if (name === wanted) {
                rank = Math.min(rank, 1);

            } else if (name.startsWith(wanted)) {
                rank = Math.min(rank, 2);

            } else if (wanted.length >= 2 && name.includes(wanted)) {
                rank = Math.min(rank, 3);
            }
        }

        if (rank < Infinity) {
            ranked.push({ item, rank });

            best = Math.min(best, rank);
        }
    }

    return ranked
        .filter(entry => entry.rank === best)
        .map(entry => entry.item);
}

// ==========================================
// CLIQUE NUM BOTÃO
// ==========================================

// Devolve a resposta (abrir o modal ou um aviso) ou null se o botão
// não é de nenhum painel.
export function handlePanelClick(interaction) {
    const [area, action, ownerId] = String(
        interaction.data?.customId || ""
    ).split(":");

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

    if (area === "loja" && action === "comprar") {
        return openModal({
            customId: "loja:comprar",
            title: "Comprar item",
            fields: [
                textField({
                    id: "item",
                    label: "Item (nome ou ID)",
                    placeholder: "Ex.: revolver ou Revólver",
                    maxLength: 60
                }),
                textField({
                    id: "quantidade",
                    label: "Quantidade (1 a 99)",
                    value: "1",
                    required: false,
                    maxLength: 2
                })
            ]
        });
    }

    return ["banco", "lavagem", "bio", "loja"].includes(area)
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

    if (!["banco", "lavagem", "bio", "loja"].includes(area)) {
        return null;
    }

    const guildId = interaction.guildId;

    if (!guildId || !interaction.user?.id) {
        return warn("Indisponível", "Isso só funciona em um servidor.");
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

    // ----------------------------------
    // LOJA
    // ----------------------------------

    if (area === "loja" && action === "comprar") {
        const query = (fields.item ?? "").trim();

        if (!query) {
            return warn("Faltou o item", "Diga o nome ou o ID do item.");
        }

        const matches = findShopItem(query);

        if (matches.length === 0) {
            return warn(
                "Item não encontrado",
                "Não encontrei nenhum item à venda com **" +
                safeText(query) + "**.\n\nUse `/loja` para ver os itens."
            );
        }

        if (matches.length > 1) {
            return warn(
                "Mais de um item encontrado",
                "Vários itens combinam com **" + safeText(query) +
                "**:\n\n" +
                matches.slice(0, 5).map(item => "• " + item.name).join("\n") +
                "\n\nSeja mais específico."
            );
        }

        const rawQuantity = (fields.quantidade ?? "").trim();

        const quantity = rawQuantity === "" ? 1 : Number(rawQuantity);

        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
            return warn("Quantidade inválida", "Use um número inteiro de 1 a 99.");
        }

        return runCommand(
            comandos,
            "comprar",
            { item: matches[0].id, quantidade: quantity },
            interaction
        );
    }

    return warn("Formulário desconhecido", "Esse formulário não é reconhecido.");
}
