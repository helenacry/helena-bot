
import { getPlayer } from "../../database/economy.mjs";

import { safeText } from "../platform/user-lookup.mjs";

import { icon } from "../platform/app-emojis.mjs";

import {
    COOLDOWNS,
    getRemaining
} from "../../config/cooldowns.mjs";

import {
    CRIME_CONFIG,
    ROBBERY_CONFIG
} from "../../config/crime.mjs";

import { ensureCrimePlayer } from "../crime/crime-player.mjs";

import { getPrison } from "../crime/prison.mjs";

import { getDailyStatus } from "./daily.mjs";

import { getGemBonusStatus } from "./gem-bonus.mjs";

import { callWait } from "../social/family.mjs";

import { createEmbed, HELENA_COLORS } from "../../utils/embed.mjs";

import {
    container,
    divider,
    headerBlock,
    subtext,
    text,
    thumbnail
} from "../../utils/components-v2.mjs";

import { button, row } from "../panels/panel-kit.mjs";

// ==========================================
// TEMPOS DE RECARGA
// ==========================================

// Uma tela só para o /cooldowns e para o botão "Atualizar": o comando abre, o botão
// refaz a mesma tela com a hora de agora. Dois grupos, como numa lista de afazeres:
// o que é legal (trabalho, daily, gemas e, para casados, o Gozofone) e o que é ilegal (crime, roubo, lavagem e, se
// estiver preso, a cadeia). Uma linha por atividade: ✅ "Pronto para uso" ou ⏳ com o relógio
// do próprio Discord (<t:...:R>, "em 2 horas"), que continua contando sozinho e aparece no
// idioma de quem lê. O "atualizado" do alto usa o mesmo relógio.
//
//   cd:atualizar:<dono>      atualiza esta tela

// Uma linha da lista: o nome em negrito e "Pronto para uso" ou quando libera.
function line(label, remaining, now, mark = "⏳") {
    if (!(remaining > 0)) return `${icon("✅")} **${label}:** Pronto para uso`;

    return `${icon(mark)} **${label}:** <t:${now + Math.ceil(remaining)}:R>`;
}

// Os tempos de cada atividade do jogador neste servidor. Só leitura (menos o registro
// do jogador, que o jogo cria na primeira vez de qualquer jeito).
export function cooldownsOf(guildId, userId, now = Math.floor(Date.now() / 1000)) {
    const player = getPlayer(guildId, userId);

    const crime = ensureCrimePlayer(guildId, userId);

    const prison = getPrison(guildId, userId, now);

    // O Gozofone só existe para quem é casado(a): sem casamento a linha nem aparece.
    const call = callWait(guildId, userId, now);

    return {
        legal: [
            { label: "Trabalhar", remaining: getRemaining(player[COOLDOWNS.work.column], COOLDOWNS.work.duration, now) },
            { label: "Recompensa diária", remaining: getDailyStatus(guildId, userId, now).remaining },
            { label: "Bônus de gemas", remaining: getGemBonusStatus(userId, now).remaining },
            ...(call.married ? [{ label: "Gozofone", remaining: call.remaining }] : [])
        ],

        illegal: [
            { label: "Crime", remaining: getRemaining(crime.last_crime, CRIME_CONFIG.cooldown, now) },
            { label: "Roubar", remaining: getRemaining(crime.last_rob, ROBBERY_CONFIG.cooldown, now) },
            { label: "Lavagem", remaining: Math.max(0, crime.launder_ready_at - now) }
        ],

        prison: prison ? { remaining: prison.remaining } : null
    };
}

export function buildCooldowns({ guildId, user, now = Math.floor(Date.now() / 1000) }) {
    const userId = String(user.id);

    const data = cooldownsOf(guildId, userId, now);

    const legal = data.legal.map(item => line(item.label, item.remaining, now)).join("\n");

    const illegalLines = data.illegal.map(item => line(item.label, item.remaining, now));

    if (data.prison) {
        illegalLines.push(line("Cadeia", data.prison.remaining, now, "🔒"));
    }

    const illegal = illegalLines.join("\n");

    const waiting = [...data.legal, ...data.illegal].filter(item => item.remaining > 0).length + (data.prison ? 1 : 0);

    const updated = `atualizado <t:${now}:R>`;

    // No embed a menção é só visual; num texto do V2 ela notificaria, então lá vai o nome.
    const meta = `<@${userId}> · ${updated}`;

    const metaV2 = `**${safeText(user.displayName || user.username || "Jogador")}** · ${updated}`;

    const note = "Toque em Atualizar para ver os tempos de agora.";

    const color = waiting === 0 ? HELENA_COLORS.success : HELENA_COLORS.wait;

    const refresh = button(`cd:atualizar:${userId}`, "Atualizar", icon("🔄"), "secondary");

    // o clássico: embed com os dois grupos (uma lista cada) e o botão embaixo
    const embed = createEmbed({
        section: "Recargas",
        title: icon("⏱️") + " Tempos de recarga",
        description: meta,
        color,
        thumbnail: user.avatarUrl,
        mood: waiting === 0 ? "feliz" : "dormindo",
        timestamp: false,
        fields: [
            { name: icon("⚖️") + " Legal", value: legal, inline: false },
            { name: icon("🦹") + " Ilegal", value: illegal, inline: false }
        ],
        footer: note
    });

    // o V2: o mesmo conteúdo em blocos, com o avatar ao lado do título
    const layout = [
        container([
            ...headerBlock(["-# HELENA · RECARGAS", `## ${icon("⏱️")} Tempos de recarga`, metaV2], thumbnail(user.avatarUrl)),
            divider(),
            text(`### ${icon("⚖️")} Legal\n${legal}`),
            divider(),
            text(`### ${icon("🦹")} Ilegal\n${illegal}`),
            divider(),
            subtext(note),
            row(refresh)
        ], { color })
    ];

    return {
        embed,
        components: [row(refresh)],
        layout,
        waiting
    };
}
