
import { getPlayer } from "../../database/economy.mjs";

import {
    COOLDOWNS,
    getRemaining,
    formatCooldown
} from "../../config/cooldowns.mjs";

import {
    CRIME_CONFIG,
    ROBBERY_CONFIG
} from "../../config/crime.mjs";

import { ensureCrimePlayer } from "../crime/crime-player.mjs";

import { getPrison } from "../crime/prison.mjs";

import { getDailyStatus } from "./daily.mjs";

import { getGemBonusStatus } from "./gem-bonus.mjs";

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
// o que é legal (trabalho, daily, gemas) e o que é ilegal (crime, roubo, lavagem e, se
// estiver preso, a cadeia). ✅ pronto, ⏳ com o tempo que falta.
//
//   cd:atualizar:<dono>      atualiza esta tela

const READY = "Pronto para uso";

const clock = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    timeStyle: "short"
});

const line = (label, remaining, ready = READY) =>
    remaining > 0
        ? `⏳ **${label}:** \`em ${formatCooldown(remaining)}\``
        : `✅ **${label}:** ${ready}`;

// Os tempos de cada atividade do jogador neste servidor. Só leitura (menos o registro
// do jogador, que o jogo cria na primeira vez de qualquer jeito).
export function cooldownsOf(guildId, userId, now = Math.floor(Date.now() / 1000)) {
    const player = getPlayer(guildId, userId);

    const crime = ensureCrimePlayer(guildId, userId);

    const prison = getPrison(guildId, userId, now);

    return {
        legal: [
            { label: "Trabalhar", remaining: getRemaining(player[COOLDOWNS.work.column], COOLDOWNS.work.duration, now) },
            { label: "Recompensa diária", remaining: getDailyStatus(guildId, userId, now).remaining },
            { label: "Bônus de gemas", remaining: getGemBonusStatus(userId, now).remaining }
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

    const legal = data.legal.map(item => line(item.label, item.remaining));

    const illegal = data.illegal.map(item => line(item.label, item.remaining));

    if (data.prison) {
        illegal.push(`⛓️ **Cadeia:** \`falta ${formatCooldown(data.prison.remaining)}\``);
    }

    const waiting = [...data.legal, ...data.illegal].filter(item => item.remaining > 0).length + (data.prison ? 1 : 0);

    const meta = `<@${userId}> · atualizado às ${clock.format(new Date(now * 1000))}`;

    const note = "Toque em Atualizar para ver os tempos de agora.";

    const color = waiting === 0 ? HELENA_COLORS.success : HELENA_COLORS.primary;

    const refresh = button(`cd:atualizar:${userId}`, "Atualizar", "🔄", "secondary");

    // o clássico: embed com os dois grupos e o botão embaixo
    const embed = createEmbed({
        title: "⏱️ Tempos de recarga",
        description: meta,
        color,
        thumbnail: user.avatarUrl,
        timestamp: false,
        fields: [
            { name: "⚖️ Legal", value: legal.join("\n"), inline: false },
            { name: "🦹 Ilegal", value: illegal.join("\n"), inline: false }
        ],
        footer: note
    });

    // o V2: o mesmo conteúdo em blocos, com o avatar ao lado do título
    const layout = [
        container([
            ...headerBlock(["## ⏱️ Tempos de recarga", meta], thumbnail(user.avatarUrl)),
            divider(),
            text(`### ⚖️ Legal\n${legal.join("\n")}`),
            divider(),
            text(`### 🦹 Ilegal\n${illegal.join("\n")}`),
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
