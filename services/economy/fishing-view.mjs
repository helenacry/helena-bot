import {
    FISHING_CONFIG,
    FISHING_TIERS
} from "../../config/fishing.mjs";

import { formatMoney } from "../../database/economy.mjs";

import {
    embedResponse,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

import { signed } from "../../utils/receipt.mjs";

import { formatDuration } from "../../utils/time.mjs";

import { eventNotes } from "./events.mjs";

// ==========================================
// A RESPOSTA DE /PESCAR
// ==========================================

// Recebe o que fish() (services/economy/fishing.mjs) devolveu e monta a tela. Fica fora do comando para os quatro
// resultados (pescou, esperando, sem vara, sem energia) terem a tela testada.

const WAIT_FOOTER = `Dá para pescar de novo em ${formatDuration(FISHING_CONFIG.cooldown)}`;

// Uma frase por tipo de resultado: o lixo tem graça, o peixe raro tem festa.
function sayFor(result) {
    const { item, entry } = result;

    if (!item) {
        return "A isca voltou vazia. Hoje os peixes não estão com fome.";
    }

    const tier = FISHING_TIERS[entry.tier];

    const found = `${item.emoji} **${item.name}**`;

    if (entry.tier === "junk") {
        return `Você fisgou ${found}. Pelo menos limpou o rio.`;
    }

    if (entry.tier === "legendary") {
        return `Não é possível! Você pescou ${found}!\n> ${tier.emoji} ${tier.label}`;
    }

    if (entry.tier === "epic" || entry.tier === "rare") {
        return `Que pescaria! Você fisgou ${found}!\n> ${tier.emoji} ${tier.label}`;
    }

    return `Você lançou a linha e pegou ${found}.`;
}

export function fishedResponse(result) {
    const { item, entry } = result;

    const rows = [];

    if (item) {
        rows.push(["Vale", formatMoney(item.sellPrice)]);
    }

    rows.push(
        ["Experiência", signed(result.xp, result.xp + " XP")],
        ["Energia", signed(-FISHING_CONFIG.energyCost, FISHING_CONFIG.energyCost + " (" + result.energy + "/" + result.max + ")")]
    );

    if (result.sold) {
        rows.push(null, ["Vendido na hora", signed(result.money, formatMoney(result.money))], ["Carteira", formatMoney(result.wallet)]);
    }

    const level = result.leveledUp
        ? "\n> 🎉 **Subiu para o nível " + result.level + "!**"
        : "";

    const note = result.sold
        ? `Você já tem ${item.maxStack} de ${item.name}, então ele foi vendido na hora. Venda os que tem com /vender.`
        : item
            ? "Venda o que pescar com /vender."
            : "";

    const big = entry.tier === "legendary" || entry.tier === "epic" || entry.tier === "rare";

    return embedResponse(
        ledgerEmbed({
            section: "Pescaria",
            title: item ? "🎣 Pescaria" : "🎣 Nada mordeu",

            say: sayFor(result) + eventNotes(["fishLuck", "xp"]).map(line => "\n" + line).join("") + level,

            rows,

            note,

            color: item ? HELENA_COLORS.success : HELENA_COLORS.wait,
            mood: result.leveledUp || big ? "festa" : item ? "feliz" : "triste",

            footer: WAIT_FOOTER
        })
    );
}

// As recusas esperadas.
export function blockedResponse(result) {
    if (result.status === "no_rod") {
        return embedResponse(
            ledgerEmbed({
                section: "Pescaria",
                title: `${result.rod.emoji} Falta a vara`,
                say: `Para pescar você precisa de uma ${result.rod.emoji} **${result.rod.name}** no inventário.`,
                rows: [
                    ["Preço na loja", formatMoney(result.rod.buyPrice)]
                ],
                note: "Compre na /loja, na prateleira Ferramentas.",
                color: HELENA_COLORS.warning,
                mood: "alerta",
                footer: "Depois é só usar /pescar"
            })
        );
    }

    if (result.status === "wait") {
        return embedResponse(
            ledgerEmbed({
                section: "Pescaria",
                title: "⏳ A linha ainda está na água",
                say: "Dá para pescar de novo em **" + formatDuration(result.remaining) + "**.",
                color: HELENA_COLORS.wait,
                mood: "dormindo",
                footer: "Enquanto isso: /trabalhar, /daily ou /missoes"
            })
        );
    }

    // sem energia
    return embedResponse(
        ledgerEmbed({
            section: "Pescaria",
            title: "🪫 Sem energia para pescar",
            say: "Descanse um pouco antes de lançar a linha de novo.",
            rows: [
                ["Custo", result.cost + " de energia"],
                ["Você tem", result.energy + "/" + result.max],
                ["Faltam", String(result.missing)]
            ],
            color: HELENA_COLORS.warning,
            mood: "dormindo",
            footer: "/energia mostra quando ela volta"
        })
    );
}

// Escolhe a tela para o que fish() devolveu.
export function fishingResponse(result) {
    return result.status === "ok" ? fishedResponse(result) : blockedResponse(result);
}
