import { getItem } from "../../config/items.mjs";

import { BOX_TIERS } from "../../config/boxes.mjs";

import { formatMoney } from "../../database/economy.mjs";

import {
    embedResponse,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { plural } from "../../utils/plural.mjs";

import { signed } from "../../utils/receipt.mjs";

// ==========================================
// A RESPOSTA DE /ABRIR
// ==========================================

// Recebe o que openBoxes (services/economy/boxes.mjs) devolveu e monta o recibo. Fica fora do comando para os
// dois tipos (pacote fixo e caixa sorteada) terem a tela testada, mesmo a caixa ainda não abrindo pelo /abrir.

// Uma linha por tipo de prêmio que saiu: "🟢 3× 💵 R$ 270,00" ou "🔵 ☕ Café ×4".
function prizeLine(entry) {
    const tier = BOX_TIERS[entry.prize.tier];

    const times = entry.count > 1 ? `${entry.count}× ` : "";

    if (entry.prize.money) {
        return `${tier.emoji} ${times}💵 **${formatMoney(entry.money)}**`;
    }

    const item = getItem(entry.prize.item);

    const parts = [];

    if (entry.items > 0) {
        parts.push(`${item.emoji} **${item.name}** ×${entry.items}`);
    }

    if (entry.converted > 0) {
        parts.push(
            `💵 **${formatMoney(entry.money)}** ` +
            `(${entry.converted > 1 ? `${entry.converted} não couberam` : "não coube"} na mochila e ` +
            `${entry.converted > 1 ? "viraram" : "virou"} dinheiro)`
        );
    }

    return `${tier.emoji} ${parts.join(" + ")}`;
}

const receivedLine = ({ item, quantity }) => `${item.emoji} **${item.name}** ×${quantity}`;

export function openedResponse(result) {
    const single = result.opened === 1;

    // PACOTE: o conteúdo de sempre
    if (result.kind === "fixed") {
        return embedResponse(
            ledgerEmbed({
                section: "Itens",
                title: single ? "🎁 Pacote aberto" : "🎁 Pacotes abertos",

                say:
                    (
                        single
                            ? `Você abriu ${result.item.emoji} **${result.item.name}** e recebeu:`
                            : `Você abriu **${result.opened}** pacotes. Recebeu:`
                    ) +
                    "\n" +
                    result.received.map(entry => "> " + receivedLine(entry)).join("\n"),

                rows: [
                    ["Ainda tem", plural(result.remaining, "pacote")]
                ],

                color: HELENA_COLORS.success,
                mood: "feliz",

                footer: "Compre mais pacotes na /loja"
            })
        );
    }

    // CAIXA: o que o sorteio deu
    const best = result.prizes[0].prize.tier;

    return embedResponse(
        ledgerEmbed({
            section: "Itens",
            title: single ? "🎁 Caixa aberta" : "🎁 Caixas abertas",

            say:
                (
                    single
                        ? `Você abriu ${result.item.emoji} **${result.item.name}** e encontrou:`
                        : `Você abriu **${result.opened}** caixas. Saiu:`
                ) +
                "\n" +
                result.prizes.map(entry => "> " + prizeLine(entry)).join("\n"),

            rows: [
                ...(result.money > 0 ? [["Dinheiro", signed(result.money, formatMoney(result.money))]] : []),
                ...(result.money > 0 ? [null] : []),
                ["Carteira", formatMoney(result.wallet)],
                ["Ainda tem", plural(result.remaining, "caixa")]
            ],

            note: result.lost > 0
                ? `A carteira chegou ao limite: ${formatMoney(result.lost)} se perderam.`
                : "",

            color: HELENA_COLORS.economy,
            mood: best === "legendary" || best === "epic"
                ? "festa"
                : result.money > 0 ? "dinheiro" : "feliz"
        })
    );
}
