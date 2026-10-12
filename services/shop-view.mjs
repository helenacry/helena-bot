
import {
    ITEMS,
    ITEM_CATEGORIES,
    getCategoryName
} from "../config/items.mjs";

import { formatMoney } from "../database/economy.mjs";

import {
    createEmbed,
    HELENA_COLORS
} from "../utils/embed.mjs";

import { button, row } from "./panel-kit.mjs";

// ==========================================
// VISÃO DA LOJA
// ==========================================

// A loja é um painel: menu de categorias, 5 itens numerados por
// página, botões Anterior/Próxima e botões para comprar cada item
// (cada um abre um modal de quantidade). Toda a navegação está nos
// customIds, então nada fica guardado em memória.
//
//   loja:cat:<dono>                   menu de categorias
//   loja:pg:<dono>:<categoria>:<n>    página n da categoria
//   loja:item:<dono>:<itemId>         comprar este item (abre o modal)
//   loja:nome:<dono>                  comprar por nome (abre o modal)
//   loja:vender:<dono>                vender (abre o modal)

export const SHOP_PAGE_SIZE = 5;

export const ALL_CATEGORIES = "todas";

export const isBuyable = item =>
    Number.isSafeInteger(item.buyPrice) && item.buyPrice > 0;

// Informações extras de arma, na linha do item.
export function weaponInfo(item) {
    if (item.category !== "weapon") {
        return "";
    }

    const weaponType = item.weaponType === "firearm"
        ? "Arma de fogo"
        : "Arma branca";

    const damage = Number(item.damage);

    const damageText =
        Number.isFinite(damage) && damage >= 0
            ? String(damage)
            : "Não informado";

    return `\n⚔️ Dano: ${damageText} • ${weaponType}`;
}

// Itens à venda de uma categoria ("todas" = todos).
export function buyableItems(category = ALL_CATEGORIES) {
    return ITEMS.filter(item =>
        isBuyable(item) &&
        (category === ALL_CATEGORIES || item.category === category)
    );
}

// Categorias que têm itens à venda, com a contagem de cada uma.
export function shopCategories() {
    const all = ITEMS.filter(isBuyable);

    const list = [{
        value: ALL_CATEGORIES,
        label: "Todas",
        count: all.length
    }];

    for (const [value, label] of Object.entries(ITEM_CATEGORIES)) {
        const count = all.filter(item => item.category === value).length;

        if (count > 0) {
            list.push({ value, label, count });
        }
    }

    return list;
}

export const isShopCategory = value =>
    shopCategories().some(category => category.value === value);

// Monta a tela: embed + componentes. A página é limitada ao que
// existe, então números fora do intervalo não quebram nada.
export function buildShopView({
    ownerId,
    category = ALL_CATEGORIES,
    page = 1,
    wallet = 0
}) {
    const items = buyableItems(category);

    const pages = Math.max(1, Math.ceil(items.length / SHOP_PAGE_SIZE));

    const current = Math.min(
        pages,
        Math.max(1, Math.trunc(Number(page)) || 1)
    );

    const slice = items.slice(
        (current - 1) * SHOP_PAGE_SIZE,
        current * SHOP_PAGE_SIZE
    );

    const label = category === ALL_CATEGORIES
        ? "Todas"
        : getCategoryName(category);

    // ==================================
    // EMBED
    // ==================================

    const fields = slice.map((item, index) => ({
        name: `${index + 1}. ${item.emoji} ${item.name}`,

        value: [
            `💰 Compra: **${formatMoney(item.buyPrice)}** • ` +
            `💵 Venda: ${item.sellable
                ? formatMoney(item.sellPrice)
                : "indisponível"}`,
            `📦 Limite: ${item.maxStack} • 🆔 \`${item.id}\``,
            item.description
        ].join("\n") + weaponInfo(item),

        inline: false
    }));

    if (fields.length === 0) {
        fields.push({
            name: "📦 Nenhum item disponível",
            value: "Não há produtos à venda nesta categoria.",
            inline: false
        });
    }

    const embed = createEmbed({
        title: "🛒 Helena Loja",

        description:
            "📂 **Categoria:** " + label + "\n" +
            "👛 **Sua carteira:** " + formatMoney(wallet) + "\n\n" +
            "Use os botões numerados para comprar um item, " +
            "**Por nome** para digitar o item ou **Vender** " +
            "para vender o que você tem.",

        color: HELENA_COLORS.economy,

        fields,

        footer:
            `Helena • Página ${current}/${pages} • ` +
            `${items.length} ${items.length === 1 ? "item" : "itens"}`
    });

    // ==================================
    // COMPONENTES
    // ==================================

    const rows = [
        row({
            type: "select",
            customId: `loja:cat:${ownerId}`,
            placeholder: "📂 Escolha uma categoria",
            minValues: 1,
            maxValues: 1,
            options: shopCategories().map(entry => ({
                label: `${entry.label} (${entry.count})`,
                value: entry.value,
                default: entry.value === category
            }))
        })
    ];

    if (slice.length > 0) {
        rows.push(row(
            ...slice.map((item, index) => button(
                `loja:item:${ownerId}:${item.id}`,
                `${index + 1}. ${item.name}`.slice(0, 80),
                item.emoji
            ))
        ));
    }

    rows.push(row(
        button(
            `loja:pg:${ownerId}:${category}:${current - 1}`,
            "Anterior",
            "◀️",
            "secondary",
            { disabled: current <= 1 }
        ),

        button(
            `loja:noop:${ownerId}`,
            `${current}/${pages}`,
            undefined,
            "secondary",
            { disabled: true }
        ),

        button(
            `loja:pg:${ownerId}:${category}:${current + 1}`,
            "Próxima",
            "▶️",
            "secondary",
            { disabled: current >= pages }
        ),

        button(`loja:nome:${ownerId}`, "Por nome", "🔎", "primary"),

        button(`loja:vender:${ownerId}`, "Vender", "💰", "success")
    ));

    return {
        embed,
        components: rows,
        page: current,
        pages,
        items: slice
    };
}
