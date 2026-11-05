
import { randomUUID } from "node:crypto";

import { reactToRobbery } from "../crime/robbery.mjs";

import { ROBBERY_CONFIG } from "../../config/crime.mjs";

import {
    button,
    row,
    sameUser,
    update,
    warn
} from "./panel-kit.mjs";

// ==========================================
// BOTÃO REAGIR DO /ROUBAR
// ==========================================

// Depois de toda tentativa de roubo, quem foi alvo e está armado recebe, na própria resposta do
// roubo, o botão Reagir. Ele vale por ROBBERY_CONFIG.reaction.windowSeconds e dá UMA chance: o
// tiro (reactToRobbery, em services/crime/robbery.mjs) gasta 1 bala e, se acertar, fere o
// ladrão. Só a vítima reage; quem clica sem ser ela recebe um aviso privado e o botão segue
// valendo.
//
//   rob:rea:<oferta>    a reação (o ID da oferta é sorteado e vive só na memória)
//
// As ofertas ficam na memória: duram 30 segundos, então nem vale gravar no banco. Se o bot
// reiniciar nesse meio tempo, o botão responde que o tempo acabou.

const pending = new Map();

// Teto de ofertas guardadas ao mesmo tempo (um servidor muito ativo não enche a memória).
const MAX_PENDING = 2_000;

const windowMs = () => ROBBERY_CONFIG.reaction.windowSeconds * 1000;

// "30 segundos" (formatDuration abreviaria para 30s)
const windowText = () => `${ROBBERY_CONFIG.reaction.windowSeconds} segundos`;

function sweep(now) {
    for (const [token, offer] of pending) {
        if (offer.expires <= now) {
            pending.delete(token);
        }
    }

    // passou do teto: descarta as mais antigas
    for (const token of pending.keys()) {
        if (pending.size <= MAX_PENDING) {
            break;
        }

        pending.delete(token);
    }
}

// Registra a oferta e devolve os componentes do botão para pôr na resposta do roubo.
//   embeds  o que a mensagem do roubo mostra: o clique a reescreve com o resultado do tiro.
export function offerReaction({
    guildId,
    thiefId,
    victimId,
    thiefName,
    victimName,
    embeds,
    now = Date.now()
}) {
    sweep(now);

    const token = randomUUID().replace(/-/g, "").slice(0, 12);

    pending.set(token, {
        guildId: String(guildId),
        thiefId: String(thiefId),
        victimId: String(victimId),
        thiefName,
        victimName,
        embeds,
        expires: now + windowMs()
    });

    return {
        token,
        components: [row(button(`rob:rea:${token}`, "Reagir", "🔫", "danger"))]
    };
}

// O texto do aviso que acompanha o botão, mencionando a vítima.
export const reactionNotice = victimId =>
    `🔫 <@${victimId}>, você está armado: tem **${windowText()}** para reagir.`;

// Quantas ofertas estão abertas (para os testes).
export const pendingReactions = () => pending.size;

export function resetReactions() {
    pending.clear();
}

// ==========================================
// A FRASE DO RESULTADO
// ==========================================

function outcomeLine(shot, offer) {
    const { victimName, thiefName } = offer;

    if (shot.outcome === "hit") {
        return (
            `💥 **${victimName}** reagiu e **acertou** o tiro em **${thiefName}**! ` +
            `Ferimento ${shot.injury}: -${shot.hpLost} HP (restam ${shot.hp}). ` +
            "Quem foi baleado precisa do hospital: `/curar`." +
            (shot.spentAmmo ? " (-1 bala)" : "")
        );
    }

    if (shot.outcome === "miss") {
        return (
            `🔫 **${victimName}** reagiu, mas **errou** o tiro (${shot.chance}% de chance com ${shot.weapon.name}).` +
            (shot.spentAmmo ? " (-1 bala)" : "")
        );
    }

    return (
        `🩹 **${thiefName}** está com a vida baixa demais para roubar: ` +
        "o tiro nem saiu e a bala foi poupada."
    );
}

// ==========================================
// CLIQUE
// ==========================================

// customId: rob:rea:<oferta>
export function handleRobClick(interaction, { now = Date.now(), rng } = {}) {
    const [, action, token] = String(interaction.data?.customId || "").split(":");

    if (action !== "rea") {
        return warn("Botão desconhecido", "Esse botão não é reconhecido.");
    }

    const offer = pending.get(token);

    if (!offer) {
        return warn(
            "Tempo esgotado",
            "Esse botão já foi usado ou o tempo para reagir passou."
        );
    }

    // Só a vítima reage. Quem clica por engano não gasta a chance dela.
    if (!sameUser(interaction, offer.victimId)) {
        return warn(
            "Não é com você",
            "Só quem foi alvo do roubo pode reagir."
        );
    }

    if (now > offer.expires) {
        pending.delete(token);

        return warn(
            "Tempo esgotado",
            `Os ${windowText()} para reagir já passaram.`
        );
    }

    let shot;

    try {
        shot = reactToRobbery(offer.guildId, offer.victimId, offer.thiefId, rng ? { rng } : {});

    } catch (error) {
        if (error?.name === "GameBlocked") {
            return warn(error.title, error.message);
        }

        console.error("[REAGIR]", error);

        return warn("Não foi possível reagir", error.message);
    }

    // uma chance por roubo
    pending.delete(token);

    const [first, ...rest] = offer.embeds;

    return update({
        embeds: [
            { ...first, description: `${first.description}\n\n${outcomeLine(shot, offer)}` },
            ...rest
        ],

        // o botão some
        components: []
    });
}
