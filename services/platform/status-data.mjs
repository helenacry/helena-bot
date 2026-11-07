
import { db } from "../../database/connection.mjs";

import {
    STATUS_CONFIG
} from "../../config/status.mjs";

// ==========================================
// FORMATAÇÃO
// ==========================================

const numberFormatter = new Intl.NumberFormat("pt-BR");

function formatNumber(value) {
    return numberFormatter.format(value);
}

function formatXP(value) {
    const xp = Number(value);

    if (!Number.isFinite(xp)) {
        return "0";
    }

    if (xp >= 1_000_000) {
        return `${(xp / 1_000_000)
            .toFixed(1)
            .replace(".", ",")}M`;
    }

    if (xp >= 1_000) {
        return `${(xp / 1_000)
            .toFixed(1)
            .replace(".", ",")}k`;
    }

    return formatNumber(xp);
}

// O dinheiro vem em centavos. Compacto para caber no status e no nome de um canal: "R$ 850",
// "R$ 12,3k", "R$ 1,5M", "R$ 2,1B".
export function formatMoneyCompact(cents) {
    const reais = Number(cents) / 100;

    if (!Number.isFinite(reais)) {
        return "R$ 0";
    }

    const compact = (value, suffix) => `R$ ${value.toFixed(1).replace(".", ",")}${suffix}`;

    if (reais >= 1_000_000_000) {
        return compact(reais / 1_000_000_000, "B");
    }

    if (reais >= 1_000_000) {
        return compact(reais / 1_000_000, "M");
    }

    if (reais >= 1_000) {
        return compact(reais / 1_000, "k");
    }

    return `R$ ${formatNumber(Math.floor(reais))}`;
}

export { formatXP };

function limitarTexto(texto, limite) {
    const caracteres = Array.from(String(texto));

    if (caracteres.length <= limite) {
        return texto;
    }

    return caracteres
        .slice(0, limite - 1)
        .join("") + "…";
}

// ==========================================
// RANKING GLOBAL DE XP
// ==========================================

// A tabela players guarda o progresso por
// servidor.
//
// Para o ranking global, somamos o XP de
// cada usuário em todos os servidores.
//
// A consulta é somente leitura: não cria
// jogadores nem modifica o banco.

export function getTopXP() {
    const row = db.prepare(`
        SELECT
            p.user_id,
            SUM(p.xp) AS total_xp,
            pn.display_name

        FROM players AS p

        LEFT JOIN player_names AS pn
            ON pn.user_id = p.user_id

        GROUP BY p.user_id

        ORDER BY
            total_xp DESC,
            p.user_id ASC

        LIMIT 1
    `).get();

    if (!row) {
        return null;
    }

    return {
        userId: String(row.user_id),

        name:
            String(row.display_name || "").trim() ||
            `Jogador ${String(row.user_id).slice(-6)}`,

        xp: Number(row.total_xp || 0)
    };
}

// ==========================================
// RANKING GLOBAL DE DINHEIRO
// ==========================================

// Carteira mais banco de cada usuário, somados em todos os servidores: o primeiro do "money" do
// ranking global (services/economy/global-ranking.mjs), com o mesmo desempate (mais XP, depois o
// menor ID). Só lê; o valor vem em centavos.

export function getTopMoney() {
    const row = db.prepare(`
        SELECT
            p.user_id,
            SUM(p.wallet + p.bank) AS total_money,
            SUM(p.xp) AS total_xp,
            pn.display_name

        FROM players AS p

        LEFT JOIN player_names AS pn
            ON pn.user_id = p.user_id

        GROUP BY p.user_id

        ORDER BY
            total_money DESC,
            total_xp DESC,
            p.user_id ASC

        LIMIT 1
    `).get();

    if (!row) {
        return null;
    }

    return {
        userId: String(row.user_id),

        name:
            String(row.display_name || "").trim() ||
            `Jogador ${String(row.user_id).slice(-6)}`,

        money: Number(row.total_money || 0)
    };
}

// ==========================================
// CONSTRUÇÃO DOS STATUS
// ==========================================

export function getStatusMessages({
    guildCount = null,
    guildCountComplete = false,

    // { ready, total }: os fragmentos (shards) conectados; sem isso, a atividade dos fragmentos some
    shards = null
} = {}) {
    const top = getTopXP();

    const richest = getTopMoney();

    const count = (
        Number.isSafeInteger(guildCount) &&
        guildCount >= 0
    )
        ? guildCount
        : null;

    const clusterText = count === null
        ? `Cluster ${STATUS_CONFIG.clusterId} | aguardando dados`
        : guildCountComplete
            ? `Cluster ${STATUS_CONFIG.clusterId} | [${formatNumber(count)}]`
            : `Cluster ${STATUS_CONFIG.clusterId} | [${formatNumber(count)}]`;

    const serversText = count === null
        ? "Servers: aguardando dados"
        : guildCountComplete
            ? `${formatNumber(count)} servers`
            : `${formatNumber(count)} servers`;

    const topText = top
        ? `Top XP: ${top.name} ${formatXP(top.xp)}`
        : "Top XP: Sem dados";

    const richText = richest
        ? `Top Coins: ${richest.name} ${formatMoneyCompact(richest.money)}`
        : "Top Coins: Sem dados";

    const shardsText = shards && Number.isInteger(shards.total)
        ? `Shards: ${shards.ready}/${shards.total}`
        : null;

    const messages = [
        `Online | ${STATUS_CONFIG.helpCommand}`,

        clusterText,

        serversText,

        ...(shardsText ? [shardsText] : []),

        `Online | site: ${STATUS_CONFIG.site}`,

        topText,

        richText
    ];

    return messages.map(message =>
        limitarTexto(
            message,
            STATUS_CONFIG.maxActivityLength
        )
    );
}