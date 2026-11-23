import { formatMoney } from "../../database/economy.mjs";

import { DROP_CONFIG } from "../../config/drops.mjs";

import { setDropViews } from "./drops.mjs";

import { button, row } from "../panels/panel-kit.mjs";

import {
    createEmbed,
    HELENA_COLORS
} from "../../utils/embed.mjs";

// ==========================================
// AS TELAS DOS DROPS
// ==========================================

// A mensagem que aparece no chat (sem dizer o que tem dentro: a graça é pegar), a que sobra quando alguém leva e a
// que sobra quando ninguém pega a tempo. O botão é drop:pegar:<id> (services/panels/drops-panel.mjs).

const seconds = Math.round(DROP_CONFIG.expireMs / 1000);

export function dropMessage(drop) {
    return {
        body: "",

        embeds: [createEmbed({
            section: "Drop",
            title: "🎁 Um presente apareceu!",
            description: `Seja a primeira pessoa a apertar o botão.\nO presente some em **${seconds} segundos**.`,
            color: HELENA_COLORS.economy,
            mood: "festa",
            footer: "Quem já usou a Helena neste servidor pode pegar"
        })],

        components: [row(button(`drop:pegar:${drop.id}`, "Pegar!", "🎁", "success"))]
    };
}

export function expiredMessage() {
    return {
        body: "",

        embeds: [createEmbed({
            section: "Drop",
            title: "💨 O presente sumiu",
            description: "Ninguém pegou a tempo.",
            color: HELENA_COLORS.wait,
            mood: "dormindo",
            footer: "O próximo aparece quando a conversa esquentar"
        })],

        components: []
    };
}

// O que a pessoa levou, em uma frase.
export function prizeText(delivery) {
    if (delivery.kind === "item") {
        return `${delivery.item.emoji} **${delivery.item.name}** ×${delivery.quantity}`;
    }

    if (delivery.kind === "converted") {
        // o mesmo texto das caixas (/abrir), que já tem tradução
        return `💵 **${formatMoney(delivery.money)}** (não coube na mochila e virou dinheiro)`;
    }

    return `💵 **${formatMoney(delivery.money)}**`;
}

// A mensagem do drop depois de levado (o clique troca a mensagem por esta).
export function claimedMessage({ userId, delivery }) {
    return {
        embeds: [createEmbed({
            section: "Drop",
            title: "🎉 O presente foi pego!",
            // duas linhas: quem levou e o que levou (cada uma é traduzida por si)
            description: `<@${userId}> levou:
${prizeText(delivery)}`,
            color: HELENA_COLORS.success,
            mood: "feliz",
            footer: delivery.item?.id === "mystery_box" && delivery.kind === "item" ? "Abra a caixa com /abrir" : "Parabéns!"
        })],

        components: []
    };
}

// Registra as duas telas no serviço (ele não importa daqui: este arquivo é quem sabe de embed).
setDropViews({ buildDrop: dropMessage, buildExpired: expiredMessage });
