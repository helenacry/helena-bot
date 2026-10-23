
import { formatMoney } from "../../database/economy.mjs";

import {
    container,
    divider,
    headerBlock,
    text,
    thumbnail
} from "../../utils/components-v2.mjs";

import {
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { receipt } from "../../utils/receipt.mjs";

// ==========================================
// TELA DO /SALDO
// ==========================================

// O extrato da pessoa: carteira, banco, gemas e, só para quem tem, o dinheiro sujo. O dinheiro
// sujo não entra no patrimônio: precisa ser lavado. O clássico é um embed com o recibo; o V2
// mostra o mesmo em blocos, com o avatar ao lado do título e o patrimônio em letra grande.
// "controls" são as linhas de botões (bankPanel).
export function buildBalance({ player, username = "Jogador", avatarUrl, controls = [] }) {
    const total = player.wallet + player.bank;

    const dirty = player.dirty_money > 0;

    const accounts = [
        ["Carteira", formatMoney(player.wallet)],
        ["Banco", formatMoney(player.bank)],
        ["Gemas", String(player.gems)],
        ...(dirty ? [["Dinheiro sujo", formatMoney(player.dirty_money)]] : [])
    ];

    const level = `nível **${player.level}** · ${player.xp.toLocaleString("pt-BR")} XP`;

    const embed = ledgerEmbed({
        section: "Banco",
        title: `🏦 Extrato de ${username}`,
        say: level,
        rows: [...accounts, null, ["Patrimônio", formatMoney(total)]],
        note: dirty ? "O dinheiro sujo não entra no patrimônio. Lave com `/lavagem`." : "",
        color: HELENA_COLORS.economy,
        thumbnail: avatarUrl,
        mood: "dinheiro",
        footer: "Os botões depositam, sacam e transferem"
    });

    const layout = [
        container([
            ...headerBlock(
                [
                    "-# HELENA · BANCO",
                    `## 🏦 Extrato de ${username}`,
                    `-# ${level}`
                ],
                thumbnail(avatarUrl)
            ),
            divider(),
            text(receipt(accounts)),
            divider(),
            text(`-# 💰 Patrimônio total\n# ${formatMoney(total)}`),
            ...controls
        ], { color: HELENA_COLORS.economy })
    ];

    return { embed, layout };
}
