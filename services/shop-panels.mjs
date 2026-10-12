
import { getItem, ITEMS } from "../config/items.mjs";

import { formatMoney, getPlayer } from "../database/economy.mjs";

import { getItemQuantity } from "./inventory.mjs";

import { prisonBlock } from "./prison.mjs";

import { safeText } from "./user-lookup.mjs";

import {
    openModal,
    textField,
    readFields
} from "./modals.mjs";

import {
    buildShopView,
    buildShopHome,
    buildShopClosed,
    shopContext,
    isShopCategory,
    isBuyable,
    MAX_PURCHASE
} from "./shop-view.mjs";

import {
    buildInventoryView,
    buildDiscardConfirm,
    isShelf
} from "./inventory-view.mjs";

import {
    prepareDiscard,
    discardItem
} from "./discard.mjs";

import {
    findByText,
    notYours,
    parseQuantity,
    priv,
    resolveQuantity,
    runCommand,
    sameUser,
    update,
    warn
} from "./panel-kit.mjs";

import {
    createEmbed,
    HELENA_COLORS
} from "../utils/embed.mjs";

// ==========================================
// LOJA E INVENTÁRIO: CLIQUES E FORMULÁRIOS
// ==========================================

const noop = { type: "defer_update" };

// ==========================================
// TELAS
// ==========================================

function shopScreen(interaction, ownerId, category, page) {
    return update(buildShopView({
        ownerId,
        category,
        page,
        ...shopContext(interaction.guildId, interaction.user.id)
    }));
}

function shopHome(interaction, ownerId) {
    const { wallet, gems } = shopContext(
        interaction.guildId,
        interaction.user.id
    );

    return update(buildShopHome({ ownerId, wallet, gems }));
}

function inventoryScreen(interaction, ownerId, category, page) {
    return update(buildInventoryView({
        ownerId,
        guildId: interaction.guildId,
        userId: interaction.user.id,
        username:
            interaction.user.displayName ||
            interaction.user.username ||
            "Jogador",
        category,
        page
    }));
}

// ==========================================
// FORMULÁRIOS
// ==========================================

function buyByNameModal() {
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
                label: "Quantidade (1 a 99 ou max)",
                value: "1",
                required: false,
                maxLength: 4
            })
        ]
    });
}

function buyItemModal(item) {
    return openModal({
        customId: `loja:comprar:${item.id}`,
        title: `Comprar: ${item.name}`.slice(0, 45),
        fields: [textField({
            id: "quantidade",
            label: `Quantidade (${formatMoney(item.buyPrice)} cada)`.slice(0, 45),
            placeholder: "1 a 99, ou max para o máximo que dá",
            value: "1",
            required: false,
            maxLength: 4
        })]
    });
}

function sellModal() {
    return openModal({
        customId: "loja:vender",
        title: "Vender item",
        fields: [
            textField({
                id: "item",
                label: "Item (nome ou ID)",
                placeholder: "Ex.: maçã",
                maxLength: 60
            }),
            textField({
                id: "quantidade",
                label: "Quantidade (número, metade ou tudo)",
                value: "1",
                required: false,
                maxLength: 6
            })
        ]
    });
}

function discardModal() {
    return openModal({
        customId: "inv:descartar",
        title: "Descartar item",
        fields: [
            textField({
                id: "item",
                label: "Item (nome ou ID)",
                placeholder: "Ex.: maçã",
                maxLength: 60
            }),
            textField({
                id: "quantidade",
                label: "Quantidade (número, metade ou tudo)",
                value: "1",
                required: false,
                maxLength: 6
            })
        ]
    });
}

// ==========================================
// LOJA: CLIQUES
// ==========================================

// customId: loja:<ação>:<dono>[:<a>[:<b>]]
// "loja:comprar" (sem dono) é o botão antigo, aberto a todos.
export function handleShopClick(interaction) {
    const [, action, ownerId, a, b] = String(
        interaction.data?.customId || ""
    ).split(":");

    if (action === "comprar" && !ownerId) {
        return buyByNameModal();
    }

    if (!sameUser(interaction, ownerId)) {
        return notYours();
    }

    if (action === "cat") {
        const value = interaction.data?.values?.[0];

        return isShopCategory(value)
            ? shopScreen(interaction, ownerId, value, 1)
            : warn("Categoria inválida", "Escolha uma categoria da lista.");
    }

    if (action === "pg") {
        return isShopCategory(a)
            ? shopScreen(interaction, ownerId, a, Number(b))
            : warn("Categoria inválida", "Abra a loja de novo com `/loja`.");
    }

    if (action === "noop") {
        return noop;
    }

    if (action === "home") {
        return shopHome(interaction, ownerId);
    }

    if (action === "fechar") {
        return update(buildShopClosed());
    }

    if (action === "item") {
        const item = getItem(a);

        return item && isBuyable(item)
            ? buyItemModal(item)
            : warn("Item indisponível", "Esse item não está mais à venda.");
    }

    if (action === "nome") {
        return buyByNameModal();
    }

    if (action === "vender") {
        return sellModal();
    }

    return warn("Botão desconhecido", "Esse botão não é reconhecido.");
}

// ==========================================
// LOJA: ENVIO DOS FORMULÁRIOS
// ==========================================

const lines = list =>
    list.slice(0, 5).map(item => "• " + item.name).join("\n");

// Item pelo nome ou ID, entre os que a loja vende / que são vendáveis.
function findShopItem(text, filter) {
    return findByText(
        ITEMS.filter(filter),
        text,
        item => [item.id, item.name]
    );
}

async function buy(interaction, comandos, item, quantityText) {
    const { guildId } = interaction;
    const userId = interaction.user.id;

    const parsed = parseQuantity(quantityText);

    let quantity;

    if (parsed.kind === "all") {
        // O máximo que dá: pelo saldo, pelo limite do item e por 99.
        const wallet = getPlayer(guildId, userId).wallet;
        const owned = getItemQuantity(guildId, userId, item.id);

        quantity = Math.min(
            MAX_PURCHASE,
            Math.floor(wallet / item.buyPrice),
            item.maxStack - owned
        );

        if (quantity < 1) {
            return warn(
                "Não dá para comprar",
                "Sua carteira não cobre nem uma unidade, ou você já " +
                "tem o limite deste item."
            );
        }

    } else if (
        parsed.kind === "number" &&
        parsed.value <= MAX_PURCHASE
    ) {
        quantity = parsed.value;

    } else {
        return warn(
            "Quantidade inválida",
            "Use um número inteiro de 1 a 99, ou `max`."
        );
    }

    return runCommand(
        comandos,
        "comprar",
        { item: item.id, quantidade: quantity },
        interaction
    );
}

async function sell(interaction, comandos, fields) {
    const query = (fields.item ?? "").trim();

    if (!query) {
        return warn("Faltou o item", "Diga o nome ou o ID do item.");
    }

    const matches = findShopItem(query, item => item.sellable);

    if (matches.length === 0) {
        return warn(
            "Item não encontrado",
            "Não encontrei nenhum item vendável com **" +
            safeText(query) + "**."
        );
    }

    if (matches.length > 1) {
        return warn(
            "Mais de um item encontrado",
            "Vários itens combinam com **" + safeText(query) +
            "**:\n\n" + lines(matches) + "\n\nSeja mais específico."
        );
    }

    const [item] = matches;

    const owned = getItemQuantity(
        interaction.guildId,
        interaction.user.id,
        item.id
    );

    if (owned < 1) {
        return warn(
            "Você não tem esse item",
            `Você não possui ${item.emoji} **${item.name}** para vender.`
        );
    }

    const quantity = resolveQuantity(
        parseQuantity(fields.quantidade),
        owned
    );

    if (
        quantity === null ||
        quantity < 1 ||
        quantity > owned
    ) {
        return warn(
            "Quantidade inválida",
            `Você tem **${owned}**. Use um número de 1 a ${owned}, ` +
            "`metade` ou `tudo`."
        );
    }

    return runCommand(
        comandos,
        "vender",
        { item: item.id, quantidade: quantity },
        interaction
    );
}

// customId: loja:comprar[:<itemId>] | loja:vender
export async function handleShopModal(interaction, comandos) {
    const [, action, itemId] = String(
        interaction.data?.customId || ""
    ).split(":");

    const fields = readFields(interaction);

    if (action === "vender") {
        return sell(interaction, comandos, fields);
    }

    if (action !== "comprar") {
        return warn("Formulário desconhecido", "Esse formulário não é reconhecido.");
    }

    // Item fixo (botão numerado) ou digitado (botão "Por nome").
    if (itemId) {
        const item = getItem(itemId);

        if (!item || !isBuyable(item)) {
            return warn("Item indisponível", "Esse item não está mais à venda.");
        }

        return buy(interaction, comandos, item, fields.quantidade);
    }

    const query = (fields.item ?? "").trim();

    if (!query) {
        return warn("Faltou o item", "Diga o nome ou o ID do item.");
    }

    const matches = findShopItem(query, isBuyable);

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
            "**:\n\n" + lines(matches) + "\n\nSeja mais específico."
        );
    }

    return buy(interaction, comandos, matches[0], fields.quantidade);
}

// ==========================================
// INVENTÁRIO: CLIQUES
// ==========================================

function resultScreen({ title, description, color }) {
    return update({
        embed: createEmbed({
            title,
            description,
            color,
            footer: "Helena • Inventário"
        }),
        components: []
    });
}

// customId: inv:<ação>:<dono>[:<a>[:<b>]]
export function handleInventoryClick(interaction) {
    const [, action, ownerId, a, b] = String(
        interaction.data?.customId || ""
    ).split(":");

    if (!sameUser(interaction, ownerId)) {
        return notYours();
    }

    if (action === "cat") {
        const value = interaction.data?.values?.[0];

        return isShelf(value)
            ? inventoryScreen(interaction, ownerId, value, 1)
            : warn("Prateleira inválida", "Escolha uma prateleira da lista.");
    }

    if (action === "pg") {
        return isShelf(a)
            ? inventoryScreen(interaction, ownerId, a, Number(b))
            : warn("Prateleira inválida", "Abra o inventário de novo com `/inventario`.");
    }

    if (action === "noop") {
        return noop;
    }

    if (action === "drop") {
        return discardModal();
    }

    if (action === "cancel") {
        return resultScreen({
            title: "✖️ Descarte cancelado",
            description: "Nada foi descartado.",
            color: HELENA_COLORS.primary
        });
    }

    if (action === "ok") {
        // Preso não descarta itens: vale também no botão.
        const blocked = prisonBlock(
            "descartar",
            interaction.guildId,
            interaction.user?.id
        );

        if (blocked) {
            return priv(blocked);
        }

        const quantity = Number(b);

        if (!Number.isInteger(quantity) || quantity < 1) {
            return warn("Quantidade inválida", "Abra o descarte de novo.");
        }

        try {
            const result = discardItem(
                interaction.guildId,
                interaction.user.id,
                a,
                quantity
            );

            return resultScreen({
                title: "🗑️ Itens descartados",

                description:
                    `Você descartou **${result.removed}× ` +
                    `${result.item.emoji} ${result.item.name}**.\n` +
                    `Restam **${result.remaining}**.`,

                color: HELENA_COLORS.success
            });

        } catch (error) {
            return resultScreen({
                title: "❌ Não foi possível descartar",
                description: error.message,
                color: HELENA_COLORS.error
            });
        }
    }

    return warn("Botão desconhecido", "Esse botão não é reconhecido.");
}

// ==========================================
// INVENTÁRIO: ENVIO DO FORMULÁRIO
// ==========================================

// Depois do formulário vem a confirmação (com botão), como na Alfacusa:
// escolher o item, escolher a quantidade e confirmar.
export function handleInventoryModal(interaction) {
    const fields = readFields(interaction);

    const prepared = prepareDiscard(
        interaction.guildId,
        interaction.user.id,
        fields.item,
        fields.quantidade
    );

    if (!prepared.ok) {
        return warn(prepared.title, prepared.message);
    }

    const view = buildDiscardConfirm({
        ownerId: interaction.user.id,
        prepared
    });

    return priv({
        type: "message",
        data: {
            embeds: [view.embed],
            components: view.components
        }
    });
}
