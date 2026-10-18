
import { formatMoney } from "../../database/economy.mjs";

import {
    container,
    divider,
    headerBlock,
    text,
    thumbnail
} from "../../utils/components-v2.mjs";

import {
    createEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// ==========================================
// TELA DO /SALDO
// ==========================================

// O clássico é o embed de sempre. O V2 mostra o mesmo conteúdo em blocos: o avatar ao lado
// do título, as contas em linhas, o patrimônio em letra grande e os botões embaixo.
// "controls" são as linhas de botões (bankPanel).
export function buildBalance({ player, username = "Jogador", avatarUrl, controls = [] }) {
    const total = player.wallet + player.bank;

    // Dinheiro sujo só aparece para quem tem. Não entra no patrimônio: precisa ser lavado.
    const dirty = player.dirty_money > 0;

    const embed = createEmbed({
        title: "🏦 Helena Bank",

        description:
            `**Conta de ${username}**\n\n` +
            "Confira abaixo sua situação financeira.",

        color: HELENA_COLORS.economy,

        fields: [
            { name: "👛 Carteira", value: `**${formatMoney(player.wallet)}**`, inline: true },
            { name: "🏛️ Banco", value: `**${formatMoney(player.bank)}**`, inline: true },
            { name: "💎 Gemas", value: `**${player.gems}**`, inline: true },
            { name: "⭐ Nível", value: `**${player.level}**`, inline: true },
            { name: "✨ Experiência", value: `**${player.xp} XP**`, inline: true },

            ...(dirty
                ? [{ name: "🧺 Dinheiro sujo", value: `**${formatMoney(player.dirty_money)}**`, inline: true }]
                : []),

            { name: "━━━━━━━━━━━━━━━━", value: "​", inline: false },

            { name: "💰 Patrimônio total", value: `**${formatMoney(total)}**`, inline: false }
        ],

        footer: "Helena • Seu progresso, sua conquista."
    });

    const accounts = [
        `**👛 Carteira:** ${formatMoney(player.wallet)}`,
        `**🏛️ Banco:** ${formatMoney(player.bank)}`,
        `**💎 Gemas:** ${player.gems}`,
        ...(dirty ? [`**🧺 Dinheiro sujo:** ${formatMoney(player.dirty_money)}`] : [])
    ];

    const layout = [
        container([
            ...headerBlock(
                [
                    "## 🏦 Helena Bank",
                    `**Conta de ${username}**\n⭐ Nível ${player.level} · ✨ ${player.xp} XP`
                ],
                thumbnail(avatarUrl)
            ),
            divider(),
            text(accounts.join("\n")),
            divider(),
            text(`-# 💰 Patrimônio total\n# ${formatMoney(total)}`),
            ...controls
        ], { color: HELENA_COLORS.economy })
    ];

    return { embed, layout };
}
