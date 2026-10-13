
import {
    ITEMS,
    ITEM_CATEGORIES,
    getCategoryName,
    getCategoryEmoji
} from "../config/items.mjs";

import { formatMoney, getPlayer } from "../database/economy.mjs";

import { getInventory } from "./inventory.mjs";

import {
    getMarket,
    buyPriceOf,
    priceItem,
    marketLine,
    formatPercent
} from "./market.mjs";

import {
    createEmbed,
    HELENA_COLORS
} from "../utils/embed.mjs";

import { button, row } from "./panel-kit.mjs";

// ==========================================
// VISÃO DA LOJA
// ==========================================

// A loja é um painel. Abre numa vitrine com as prateleiras (categorias);
// cada prateleira lista 5 itens por página, com botão Anterior/Próxima e
// um botão por item (que abre o modal de quantidade). Toda a navegação
// está nos customIds, então nada fica guardado em memória.
//
//   loja:home:<dono>                  vitrine inicial
//   loja:cat:<dono>                   menu de prateleiras
//   loja:pg:<dono>:<categoria>:<n>    página n da prateleira
//   loja:item:<dono>:<itemId>         comprar este item (abre o modal)
//   loja:nome:<dono>                  comprar por nome (abre o modal)
//   loja:vender:<dono>                vender (abre o modal)
//   loja:fechar:<dono>                fecha o painel

export const SHOP_PAGE_SIZE = 5;

// Mais que isso por compra o comando não aceita.
export const MAX_PURCHASE = 99;

export const ALL_CATEGORIES = "todas";

const ALL_EMOJI = "🛍️";

const KEYCAPS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];

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

    // O combate usa 10 quando a arma não define o dano.
    const damage = Number(item.damage || 10);

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

// Categorias que têm itens à venda, com a contagem e o menor preço
// de cada uma. A primeira é sempre "Todas".
export function shopCategories(market = null) {
    const all = ITEMS.filter(isBuyable);

    const entry = (value, label, emoji, items) => ({
        value,
        label,
        emoji,
        count: items.length,
        minPrice: items.length
            ? Math.min(...items.map(item => buyPriceOf(item, market)))
            : 0
    });

    const list = [entry(ALL_CATEGORIES, "Todas", ALL_EMOJI, all)];

    for (const [value, label] of Object.entries(ITEM_CATEGORIES)) {
        const items = all.filter(item => item.category === value);

        if (items.length > 0) {
            list.push(entry(value, label, getCategoryEmoji(value), items));
        }
    }

    return list;
}

export const isShopCategory = value =>
    shopCategories().some(category => category.value === value);

// ==========================================
// DADOS DO JOGADOR
// ==========================================

// Carteira, gemas e quanto o jogador já tem de cada item: o que a
// vitrine precisa saber sobre quem está olhando.
export function shopContext(guildId, userId) {
    const player = getPlayer(guildId, userId);

    const owned = {};

    for (const entry of getInventory(guildId, userId)) {
        owned[entry.item_id] = entry.quantity;
    }

    return {
        wallet: player.wallet,
        gems: player.gems ?? 0,
        owned,
        market: getMarket(guildId)
    };
}

// A linha do mercado no topo da loja (nada com a bolsa desligada). O
// detalhe do índice e do item em alta está no /bolsa.
const marketLines = market => market ? [marketLine(market)] : [];

const plural = (count, one, many) =>
    `${count} ${count === 1 ? one : many}`;

const walletLine = (wallet, gems) =>
    `👛 **Carteira:** ${formatMoney(wallet)}  •  💎 **Gemas:** ${gems}`;

// O que a carteira e o limite do item permitem: quantas unidades dá
// para comprar agora e a frase que aparece no cartão.
export function affordability(item, wallet, owned = 0) {
    const room = Number.isFinite(item.maxStack)
        ? item.maxStack - owned
        : Infinity;

    if (room <= 0) {
        return {
            max: 0,
            text: "📦 Limite do item atingido"
        };
    }

    const max = Math.min(
        MAX_PURCHASE,
        Math.floor(wallet / item.buyPrice),
        room
    );

    if (max < 1) {
        return {
            max: 0,
            text: `🔒 Faltam **${formatMoney(item.buyPrice - wallet)}**`
        };
    }

    return {
        max,
        text: `✅ Você pode comprar até **${max}**`
    };
}

// ==========================================
// COMPONENTES COMUNS
// ==========================================

function categoryMenu(ownerId, selected, market = null) {
    return row({
        type: "select",
        customId: `loja:cat:${ownerId}`,
        placeholder: "📂 Escolha uma prateleira",
        minValues: 1,
        maxValues: 1,
        options: shopCategories(market).map(entry => ({
            label: `${entry.emoji} ${entry.label} (${entry.count})`,
            value: entry.value,
            description: `A partir de ${formatMoney(entry.minPrice)}`,
            default: entry.value === selected
        }))
    });
}

const toolButtons = ownerId => [
    button(`loja:nome:${ownerId}`, "Por nome", "🔎", "primary"),
    button(`loja:vender:${ownerId}`, "Vender", "💰", "success"),
    button(`loja:fechar:${ownerId}`, "Fechar", "✖️", "danger")
];

// ==========================================
// VITRINE INICIAL
// ==========================================

export function buildShopHome({
    ownerId,
    wallet = 0,
    gems = 0,
    market = null
}) {
    const categories = shopCategories(market);

    const total = categories[0].count;

    const embed = createEmbed({
        title: "🛒 Helena Loja",

        description: [
            walletLine(wallet, gems),
            ...marketLines(market),
            "",
            "Bem-vindo! Escolha uma prateleira no menu abaixo " +
            "ou toque em **Ver tudo**."
        ].join("\n"),

        color: HELENA_COLORS.economy,

        fields: [
            ...categories.slice(1).map(entry => ({
                name: `${entry.emoji} ${entry.label}`,

                value:
                    `${plural(entry.count, "item", "itens")}\n` +
                    `A partir de **${formatMoney(entry.minPrice)}**`,

                inline: true
            })),

            {
                name: "💡 Dicas",

                value: [
                    "Comida e bebida repõem energia: use `/usaritem`.",
                    "Itens que você não precisa? Toque em **Vender**."
                ].join("\n"),

                inline: false
            }
        ],

        footer: `Helena • Loja • ${plural(total, "item", "itens")} à venda`
    });

    return {
        embed,

        components: [
            categoryMenu(ownerId, null, market),

            row(
                button(
                    `loja:pg:${ownerId}:${ALL_CATEGORIES}:1`,
                    "Ver tudo",
                    ALL_EMOJI,
                    "primary"
                ),
                ...toolButtons(ownerId)
            )
        ]
    };
}

// ==========================================
// LOJA FECHADA
// ==========================================

export function buildShopClosed() {
    return {
        embed: createEmbed({
            title: "🛒 Loja fechada",
            description: "Volte sempre! Use `/loja` para abrir de novo.",
            color: HELENA_COLORS.neutral,
            footer: "Helena • Loja"
        }),

        components: []
    };
}

// ==========================================
// PRATELEIRA
// ==========================================

// Monta a tela: embed + componentes. A página é limitada ao que
// existe, então números fora do intervalo não quebram nada.
export function buildShopView({
    ownerId,
    category = ALL_CATEGORIES,
    page = 1,
    wallet = 0,
    gems = 0,
    owned = {},
    market = null
}) {
    const items = buyableItems(category).map(item => priceItem(item, market));

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

    const emoji = category === ALL_CATEGORIES
        ? ALL_EMOJI
        : getCategoryEmoji(category);

    // ==================================
    // EMBED
    // ==================================

    const status = slice.map(item =>
        affordability(item, wallet, owned[item.id] ?? 0)
    );

    const fields = slice.map((item, index) => {
        const have = owned[item.id] ?? 0;

        const sell = item.sellable
            ? formatMoney(item.sellPrice) + (
                item.hot
                    ? ` 🔥 em alta (+${formatPercent(market.hotBonusBp)})`
                    : ""
            )
            : "indisponível";

        const stack = Number.isFinite(item.maxStack)
            ? `/${item.maxStack}`
            : "";

        const lines = [
            `💰 **${formatMoney(item.buyPrice)}**  •  💵 Venda: ${sell}`,
            status[index].text,
            item.description
        ];

        const weapon = weaponInfo(item).trim();

        if (weapon) {
            lines.push(weapon);
        }

        lines.push(
            `🎒 Você tem **${have}**${stack}  •  🆔 \`${item.id}\``
        );

        return {
            name: `${KEYCAPS[index] ?? `${index + 1}.`} ${item.emoji} ${item.name}`,
            value: lines.join("\n"),
            inline: false
        };
    });

    if (fields.length === 0) {
        fields.push({
            name: "📦 Nenhum item disponível",
            value: "Não há produtos à venda nesta prateleira.",
            inline: false
        });
    }

    const embed = createEmbed({
        title: `🛒 Helena Loja • ${emoji} ${label}`,

        description: [
            walletLine(wallet, gems),
            ...marketLines(market),
            `📂 **Prateleira:** ${emoji} ${label} • ` +
            plural(items.length, "item", "itens"),
            "",
            "Toque no número do item para comprar. " +
            "Os verdes cabem na sua carteira."
        ].join("\n"),

        color: HELENA_COLORS.economy,

        fields,

        footer:
            `Helena • Página ${current}/${pages} • ` +
            plural(items.length, "item", "itens")
    });

    // ==================================
    // COMPONENTES
    // ==================================

    const rows = [categoryMenu(ownerId, category, market)];

    if (slice.length > 0) {
        rows.push(row(
            ...slice.map((item, index) => button(
                `loja:item:${ownerId}:${item.id}`,
                `${index + 1}. ${item.name}`.slice(0, 80),
                item.emoji,
                status[index].max > 0 ? "success" : "secondary"
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
        )
    ));

    rows.push(row(
        button(`loja:home:${ownerId}`, "Início", "🏠", "primary"),
        ...toolButtons(ownerId)
    ));

    return {
        embed,
        components: rows,
        page: current,
        pages,
        items: slice
    };
}
