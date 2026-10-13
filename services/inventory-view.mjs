
import {
    ITEM_CATEGORIES,
    getCategoryName
} from "../config/items.mjs";

import { formatMoney } from "../database/economy.mjs";

import {
    getInventory,
    getInventoryStats
} from "./inventory.mjs";

import { getEquippedWeapon } from "./equipment.mjs";

import {
    getMarket,
    sellPriceOf,
    isHot
} from "./market.mjs";

import {
    createEmbed,
    HELENA_COLORS
} from "../utils/embed.mjs";

import { button, row } from "./panel-kit.mjs";

// ==========================================
// VISÃO DO INVENTÁRIO
// ==========================================

// Mesmo desenho da loja: menu de prateleiras (categorias), 12 itens
// por página, Anterior/Próxima/Atualizar e um botão para descartar.
//
//   inv:cat:<dono>                    menu de prateleiras
//   inv:pg:<dono>:<categoria>:<n>     página n (também atualiza)
//   inv:drop:<dono>                   descartar (abre o modal)
//   inv:ok:<dono>:<itemId>:<qtd>      confirma o descarte
//   inv:cancel:<dono>                 cancela o descarte

export const INVENTORY_PAGE_SIZE = 12;

export const ALL_SHELVES = "todas";

// Prateleiras com itens, com a contagem de cada uma.
export function inventoryShelves(inventory) {
    const list = [{
        value: ALL_SHELVES,
        label: "Todas",
        count: inventory.length
    }];

    for (const [value, label] of Object.entries(ITEM_CATEGORIES)) {
        const count = inventory.filter(entry => entry.category === value).length;

        if (count > 0) {
            list.push({ value, label, count });
        }
    }

    return list;
}

export const isShelf = value =>
    value === ALL_SHELVES || Object.hasOwn(ITEM_CATEGORIES, value);

export function buildInventoryView({
    ownerId,
    guildId,
    userId,
    username = "Jogador",
    category = ALL_SHELVES,
    page = 1
}) {
    const inventory = getInventory(guildId, userId);

    const stats = getInventoryStats(guildId, userId);

    const equipped = getEquippedWeapon(guildId, userId)?.id ?? null;

    const market = getMarket(guildId);

    const shelves = inventoryShelves(inventory);

    // Prateleira que ficou vazia (por exemplo, depois de vender tudo)
    // volta para "Todas".
    const shelf = shelves.some(entry => entry.value === category)
        ? category
        : ALL_SHELVES;

    const filtered = (shelf === ALL_SHELVES
        ? inventory
        : inventory.filter(entry => entry.category === shelf))
        .slice()
        .sort((a, b) =>
            getCategoryName(a.category).localeCompare(getCategoryName(b.category), "pt-BR") ||
            a.name.localeCompare(b.name, "pt-BR")
        );

    const pages = Math.max(
        1,
        Math.ceil(filtered.length / INVENTORY_PAGE_SIZE)
    );

    const current = Math.min(
        pages,
        Math.max(1, Math.trunc(Number(page)) || 1)
    );

    const slice = filtered.slice(
        (current - 1) * INVENTORY_PAGE_SIZE,
        current * INVENTORY_PAGE_SIZE
    );

    // ==================================
    // LINHAS
    // ==================================

    const lines = [];

    let lastCategory = null;

    for (const entry of slice) {
        if (shelf === ALL_SHELVES && entry.category !== lastCategory) {
            lines.push(`\n**📂 ${getCategoryName(entry.category)}**`);

            lastCategory = entry.category;
        }

        const mark = entry.item_id === equipped ? "🟢 " : "";

        // O preço de venda de agora (mercado do servidor); 🔥 = item em alta.
        const sells = entry.item?.sellable
            ? ` • 💵 ${formatMoney(sellPriceOf(entry.item, market))}` +
                (isHot(entry.item, market) ? " 🔥" : "")
            : "";

        lines.push(
            `${mark}${entry.emoji} **${entry.name}** ×${entry.quantity}${sells}`
        );
    }

    const label = shelf === ALL_SHELVES
        ? "Todas"
        : getCategoryName(shelf);

    const embed = createEmbed({
        title: "🎒 Helena Inventário",

        description:
            "👤 **Jogador:** " + username + "\n" +
            "📂 **Prateleira:** " + label + "\n" +
            (equipped ? "🟢 = arma equipada\n" : "") +
            (
                filtered.length === 0
                    ? "\n📦 Nenhum item nesta seleção.\n\n" +
                      "Visite `/loja` para adquirir novos itens."
                    : "\n" + lines.join("\n").trim()
            ),

        color: HELENA_COLORS.inventory,

        fields: [
            {
                name: "📦 Itens diferentes",
                value: String(stats.uniqueItems),
                inline: true
            },
            {
                name: "🔢 Quantidade total",
                value: String(stats.totalQuantity),
                inline: true
            }
        ],

        footer: `Helena • Página ${current}/${pages}`
    });

    // ==================================
    // COMPONENTES
    // ==================================

    const components = [
        row({
            type: "select",
            customId: `inv:cat:${ownerId}`,
            placeholder: "📂 Escolha uma prateleira",
            minValues: 1,
            maxValues: 1,
            options: shelves.map(entry => ({
                label: `${entry.label} (${entry.count})`,
                value: entry.value,
                default: entry.value === shelf
            }))
        }),

        row(
            button(
                `inv:pg:${ownerId}:${shelf}:${current - 1}`,
                "Anterior",
                "◀️",
                "secondary",
                { disabled: current <= 1 }
            ),

            button(
                `inv:noop:${ownerId}`,
                `${current}/${pages}`,
                undefined,
                "secondary",
                { disabled: true }
            ),

            button(
                `inv:pg:${ownerId}:${shelf}:${current + 1}`,
                "Próxima",
                "▶️",
                "secondary",
                { disabled: current >= pages }
            ),

            // Atualizar relê os dados na mesma página.
            button(
                `inv:pg:${ownerId}:${shelf}:${current}`,
                "Atualizar",
                "🔄"
            ),

            button(
                `inv:drop:${ownerId}`,
                "Descartar",
                "🗑️",
                "danger",
                { disabled: inventory.length === 0 }
            )
        )
    ];

    return {
        embed,
        components,
        page: current,
        pages,
        shelf,
        entries: slice
    };
}

// ==========================================
// CONFIRMAÇÃO DO DESCARTE
// ==========================================

// prepared vem de prepareDiscard (services/discard.mjs).
export function buildDiscardConfirm({ ownerId, prepared }) {
    const { item, quantity, owned, equipped, disarms } = prepared;

    const warnings = [];

    if (disarms) {
        warnings.push(
            "⚠️ Essa é a sua **arma equipada**: você ficará desarmado."
        );

    } else if (equipped) {
        warnings.push(
            "ℹ️ Sobrarão unidades, então a arma continua equipada."
        );
    }

    const embed = createEmbed({
        title: "🗑️ Descartar itens?",

        description:
            `Você vai destruir **${quantity}× ${item.emoji} ${item.name}**.\n\n` +
            "Isso **não tem reembolso** e **não dá para desfazer**." +
            (warnings.length ? "\n\n" + warnings.join("\n") : ""),

        color: HELENA_COLORS.warning,

        fields: [
            { name: "📦 Você tem", value: String(owned), inline: true },
            { name: "📉 Sobrará", value: String(owned - quantity), inline: true }
        ],

        footer: "Helena • Confirme para descartar."
    });

    return {
        embed,
        components: [
            row(
                button(
                    `inv:ok:${ownerId}:${item.id}:${quantity}`,
                    "Confirmar descarte",
                    "🗑️",
                    "danger"
                ),
                button(`inv:cancel:${ownerId}`, "Cancelar", "✖️")
            )
        ]
    };
}
