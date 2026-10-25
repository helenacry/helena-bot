
import { db } from "../../database/connection.mjs";

import { getPlayer, formatMoney } from "../../database/economy.mjs";

import { JOBS, getJob } from "../../config/jobs.mjs";

import { createEmbed, HELENA_COLORS } from "../../utils/embed.mjs";

import { row } from "../panels/panel-kit.mjs";

// ==========================================
// EMPREGOS: A LISTA, O MENU E A TROCA
// ==========================================

// Uma tela só para o /empregos e para o primeiro /trabalhar: quem ainda não tem emprego vê o que já
// pode assumir, o que falta liberar e um menu para escolher. O desenho segue o /jobs da Alfacusa
// (✅ disponíveis, 🔒 bloqueados, menu "Escolha uma profissão").
//
//   emp:escolher:<dono>      o menu (só quem abriu escolhe)

export const JOB_MENU = "emp";

// "Entregador · R$ 150,00 · nível 1": o que cada linha da lista mostra.
const detail = job => `${formatMoney(job.salary)} · nível ${job.level}`;

// Escolhe o emprego de um jogador. Nada é gravado se o nível não chega (o UPDATE confere de novo,
// então dois cliques ao mesmo tempo não furam a regra).
//
//   unknown   o id não é de nenhum emprego
//   locked    o nível não chega
//   same      já é o emprego dele
//   ok        gravado; "job" é o emprego novo e "previous" o anterior (ou null)
export function chooseJob(guildId, userId, jobId) {
    const job = getJob(jobId);

    if (!job) {
        return { status: "unknown" };
    }

    const player = getPlayer(guildId, userId);

    if (player.level < job.level) {
        return { status: "locked", job, player };
    }

    if (player.job_id === job.id) {
        return { status: "same", job, player };
    }

    const result = db.prepare(`
        UPDATE players
        SET job_id = ?
        WHERE guild_id = ?
          AND user_id = ?
          AND level >= ?
    `).run(job.id, guildId, userId, job.level);

    if (result.changes !== 1) {
        throw new Error("Não foi possível atualizar seu emprego.");
    }

    return { status: "ok", job, player, previous: getJob(player.job_id) };
}

/**
 * A tela de empregos de um jogador.
 *
 *   intro   a frase de cima; sem ela, "Você está sem emprego." ou "Você é <cargo>, nível N."
 *
 * Devolve { embed, components }, com o menu para escolher entre os cargos liberados.
 */
export function buildJobs({ guildId, user, intro = "" }) {
    const userId = String(user.id);

    const player = getPlayer(guildId, userId);

    const current = getJob(player.job_id);

    const open = JOBS.filter(job => player.level >= job.level);
    const locked = JOBS.filter(job => player.level < job.level);

    const status = current
        ? `📌 Você é **${current.name}**, nível **${player.level}**, e cada expediente rende **${formatMoney(current.salary)}**.`
        : `📌 Você está sem emprego. Seu nível é **${player.level}**.`;

    const openLine = job => job.id === current?.id
        ? `⭐ **${job.name}** · ${detail(job)} · seu emprego`
        : `💼 **${job.name}** · ${detail(job)}`;

    const lines = [
        intro,
        status,
        "",
        `### ✅ Disponíveis para você (${open.length})`,
        ...open.map(openLine),
        ...(locked.length
            ? ["", `### 🔒 Ainda bloqueados (${locked.length})`, ...locked.map(job => `🔒 ${job.name} · ${detail(job)}`)]
            : []),
        "",
        "-# Trabalhar rende experiência, e cada nível novo libera cargos melhores."
    ].filter((line, index) => line !== "" || index > 0);

    const embed = createEmbed({
        section: "Carreira",
        title: "💼 Empregos",
        description: lines.join("\n"),
        color: HELENA_COLORS.success,
        thumbnail: user.avatarUrl,
        mood: "feliz",
        timestamp: false,
        footer: current ? "Troque de cargo no menu ou com /empregos cargo:nome" : "Escolha no menu para começar a trabalhar"
    });

    const menu = row({
        type: "select",
        customId: `${JOB_MENU}:escolher:${userId}`,
        placeholder: "Escolha uma profissão",
        minValues: 1,
        maxValues: 1,
        options: open.map(job => ({
            label: job.name,
            value: job.id,
            description: `${formatMoney(job.salary)} por expediente · nível ${job.level}`,
            emoji: "💼",
            default: job.id === current?.id
        }))
    });

    return { embed, components: [menu] };
}
