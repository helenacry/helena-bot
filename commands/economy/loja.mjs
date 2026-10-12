
import {
    ITEMS,
    ITEM_CATEGORIES,
    getCategoryName
} from "../../config/items.mjs";

import {
    getPlayer,
    formatMoney
} from "../../database/economy.mjs";

import {
    createEmbed,
    embedResponse,
    errorEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// ==========================================
// INFORMAÇÕES DAS ARMAS
// ==========================================

function getWeaponInfo(item) {
    if (item.category !== "weapon") {
        return "";
    }

    const weaponType =
        item.weaponType === "firearm"
            ? "Arma de fogo"
            : "Arma branca";

    const damage = Number(item.damage);

    const damageText =
        Number.isFinite(damage) && damage >= 0
            ? String(damage)
            : "Não informado";

    return `\n⚔️ Dano: ${damageText} • ${weaponType}`;
}

// ==========================================
// COMANDO /LOJA
// ==========================================

export default {
    name: "loja",

    description: "Consulte os itens disponíveis na loja",

    options: [
        {
            name: "categoria",
            description: "Filtrar itens por categoria",
            type: "string",
            required: false,

            choices: Object.entries(
                ITEM_CATEGORIES
            ).map(([value, name]) => ({
                name,
                value
            }))
        }
    ],

    async execute(interaction) {
        const guildId = interaction.guildId;
        const userId = interaction.user?.id;

        if (!guildId || !userId) {
            return errorEmbed(
                "Não foi possível identificar sua conta."
            );
        }

        try {
            const player = getPlayer(
                guildId,
                userId
            );

            const category =
                interaction.data?.options?.categoria;

            if (
                category &&
                !Object.hasOwn(ITEM_CATEGORIES, category)
            ) {
                return errorEmbed(
                    "Categoria inválida."
                );
            }

            // ==================================
            // FILTRAR PRODUTOS
            // ==================================

            const items = ITEMS.filter(item =>
                Number.isSafeInteger(item.buyPrice) &&
                item.buyPrice > 0 &&
                (!category || item.category === category)
            );

            const fields = [];
            const groups = new Map();

            // ==================================
            // AGRUPAR POR CATEGORIA
            // ==================================

            for (const item of items) {
                if (!groups.has(item.category)) {
                    groups.set(item.category, []);
                }

                groups.get(item.category).push(item);
            }

            // ==================================
            // CONSTRUIR CAMPOS DA LOJA
            // ==================================

            for (const [key, entries] of groups) {
                const lines = entries.map(item => {
                    const sellPrice = item.sellable
                        ? formatMoney(item.sellPrice)
                        : "Indisponível";

                    return [
                        `${item.emoji} **${item.name}**`,
                        `💰 Compra: ${formatMoney(item.buyPrice)}`,
                        `💵 Venda: ${sellPrice}`,
                        `📦 Limite: ${item.maxStack}`,
                        `🆔 \`${item.id}\``
                    ].join("\n") + getWeaponInfo(item);
                });

                let chunk = "";

                for (const line of lines) {
                    const next = chunk
                        ? `${chunk}\n\n${line}`
                        : line;

                    if (next.length > 1000 && chunk) {
                        fields.push({
                            name: "📂 " + getCategoryName(key),
                            value: chunk,
                            inline: false
                        });

                        chunk = line;
                    } else {
                        chunk = next;
                    }
                }

                if (chunk) {
                    fields.push({
                        name: "📂 " + getCategoryName(key),
                        value: chunk,
                        inline: false
                    });
                }
            }

            // ==================================
            // LOJA VAZIA
            // ==================================

            if (fields.length === 0) {
                fields.push({
                    name: "📦 Nenhum item disponível",
                    value:
                        "Não há produtos à venda nesta categoria.",
                    inline: false
                });
            }

            // ==================================
            // CRIAR EMBED
            // ==================================

            const embed = createEmbed({
                title: "🛒 Helena Loja",

                description:
                    "📂 **Categoria:** " +
                    (
                        category
                            ? getCategoryName(category)
                            : "Todas"
                    ) +
                    "\n👛 **Sua carteira:** " +
                    formatMoney(player.wallet) +
                    "\n\nConfira nossos produtos disponíveis.",

                color: HELENA_COLORS.economy,

                fields: [
                    ...fields,
                    {
                        name: "🛍️ Como negociar?",
                        value:
                            "Use `/comprar` para adquirir itens.\n" +
                            "Use `/vender` para vender itens permitidos.",
                        inline: false
                    }
                ],

                footer:
                    "Helena • Seu próximo item está aqui."
            });

            return embedResponse(embed);

        } catch (error) {
            console.error(
                "[LOJA]",
                error
            );

            return errorEmbed(
                "Não foi possível carregar a loja."
            );
        }
    }
};