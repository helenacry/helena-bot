import { PULSE_EMOJIS } from "./userinfo-format.mjs";

import { emojiNamed } from "./badge-emojis.mjs";

// ==========================================
// CATÁLOGO DE INSÍGNIAS DO VSYNC
// ==========================================

// Cada insígnia tem o nome, o "icon" (o nome do emoji no pacote de ícones oficiais, lido do
// servidor por badge-emojis.mjs) e o "emoji" fixo de antes, que vale quando o pacote não está lá.
// Sem nenhum dos dois, a insígnia aparece pelo nome.

// Tempo de tela (compartilhar a tela): quem passa de cada marca, em horas, ganha a insígnia, e cada
// uma substitui a anterior. O sufixo do ícone é o da marca: auto_stream_5h, auto_stream_5khplus.
const STREAM_TIERS = Object.freeze([
    [1, "Newcomer", "1h"], [5, "Fledgling", "5h"], [20, "Breakout", "20h"], [75, "Standout", "75h"],
    [150, "Trendsetter", "150h"], [300, "Headliner", "300h"], [500, "Star", "500h"],
    [1000, "Sensation", "1kh"], [2000, "Visionary", "2kh"], [5000, "Phenomenon", "5khplus"]
]);

const BADGES = Object.freeze({
    BADGE_SHOW_ADMIN: {
        icon: "auto_admin",
        emoji: "<:badge_admin:235402174009856000>",
        name: "Administrador do VSync"
    },

    BADGE_SHOW_VERIFIED: {
        icon: "auto_verified",
        emoji: "<:badge_verified:235401782727430144>",
        name: "Verificado"
    },

    BADGE_SHOW_PRISMA: {
        icon: "auto_prisma_plus",
        emoji: "<:badge_prisma_plus:235421406961487872>",
        name: "Prisma+"
    },

    // O plano básico (sem o "+"): sem o pacote, não há emoji fixo dele e aparece pelo nome.
    BADGE_SHOW_PRISMA_BASIC: {
        icon: "auto_prisma",
        emoji: "",
        name: "Prisma"
    },

    BADGE_SHOW_EARLY_SUPPORTER: {
        icon: "auto_early_supporter",
        emoji: "<:badge_early_supporter:235402151960399872>",
        name: "Apoiador inicial"
    },

    BADGE_SHOW_PARTNER: {
        icon: "auto_partner",
        emoji: "<:badge_partner:235402087548473344>",
        name: "Dono de servidor parceiro"
    },

    BADGE_SHOW_STAFF: {
        icon: "auto_staff",
        emoji: "<:badge_staff:235401830169202688>",
        name: "Staff do VSync"
    },

    BADGE_SHOW_VERIFIED_BOT_DEVELOPER: {
        icon: "auto_verified_bot_developer",
        emoji: "<:badge_developer:235402131815157760>",
        name: "Desenvolvedor de bot verificado pioneiro"
    },

    GIFTING_PATRON: {
        icon: "auto_gifting_patron",
        emoji: "",
        name: "Patrono dos presentes"
    },

    GIFTING_CHAMPION: {
        icon: "auto_gifting_champion",
        emoji: "",
        name: "Campeão dos presentes"
    },

    GIFTING_LUMINARY: {
        icon: "auto_gifting_luminary",
        emoji: "",
        name: "Luminar dos presentes"
    },

    BADGE_SHOW_GIFTING_HERO: {
        icon: "auto_gifting_hero",
        emoji: "<:badge_gifting_hero:235401550505594880>",
        name: "Herói dos presentes"
    },

    // Tempo de tela
    ...Object.fromEntries(
        STREAM_TIERS.map(([hours, name, suffix]) => [
            `STREAM_${hours}H`,
            { icon: `auto_stream_${suffix}`, emoji: "", name: `Tempo de tela: ${name}` }
        ])
    ),

    // Insígnias de Pulse
    ...Object.fromEntries(
        [1, 2, 3, 6, 9, 12, 15, 18, 24].map(month => [
            "BADGE_SHOW_PULSE_" + month,
            {
                icon: "auto_pulse_" + month,
                emoji: PULSE_EMOJIS[month] ?? "",

                name:
                    "Pulse " +
                    month +
                    (month === 1 ? " mês" : " meses")
            }
        ])
    )
});

// Os nomes de emoji que o catálogo usa (a lista que o servidor precisa ter, e que o teste confere).
export const BADGE_ICON_NAMES = Object.freeze(Object.values(BADGES).map(badge => badge.icon));

// ==========================================
// ALIASES
// ==========================================

// Nomes que a API usa para a mesma insígnia.
const NAME_ALIASES = Object.freeze({
    MODERATOR: "STAFF",
    EARLY_VERIFIED_DEVELOPER: "VERIFIED_BOT_DEVELOPER"
});

// ==========================================
// INSÍGNIAS VISÍVEIS
// ==========================================

// A chave do catálogo para um nome de `flags` ou de `hiddenBadges`. A API manda as insígnias da
// conta com o nome simples (ADMIN, VERIFIED, EARLY_SUPPORTER...) e as sobrescritas do admin como
// BADGE_SHOW_<nome>; as duas formas valem a mesma insígnia. null se não está no catálogo.
function keyOf(flag) {
    const name = String(flag ?? "").replace(/^BADGE_(SHOW|HIDE)_/, "");

    const alias = NAME_ALIASES[name] ?? name;

    return [`BADGE_SHOW_${alias}`, alias].find(key => BADGES[key]) ?? null;
}

// O nome sem prefixo: "BADGE_HIDE_PRISMA" e "PRISMA" são o mesmo.
const bare = flag => String(flag ?? "").replace(/^BADGE_(SHOW|HIDE)_/, "");

export function getUserBadges(user) {
    const flags = Array.isArray(user?.flags)
        ? user.flags
        : [];

    // O que o dono escondeu (hiddenBadges) e o que o admin escondeu (BADGE_HIDE_<nome> em flags).
    // PRISMA, PULSE e STREAM_TIME escondem o grupo todo.
    const hiddenNames = new Set([
        ...(Array.isArray(user?.hiddenBadges) ? user.hiddenBadges : []).map(bare),
        ...flags.filter(flag => /^BADGE_HIDE_/.test(String(flag))).map(bare)
    ]);

    const hiddenKeys = new Set([...hiddenNames].map(keyOf).filter(Boolean));

    const badges = [];
    const seen = new Set();

    const add = key => {
        const badge = BADGES[key];

        if (!badge || seen.has(key) || hiddenKeys.has(key)) {
            return;
        }

        seen.add(key);

        badges.push({
            id: key,
            emoji: emojiNamed(badge.icon, badge.emoji),
            name: badge.name
        });
    };

    // O Prisma não vem em `flags`: quem assina tem prismaActive (e prismaPlan diz qual plano). Quem
    // escondeu a insígnia chega com prismaActive falso, e o PRISMA em hiddenBadges vale também aqui.
    // Vai primeiro, como no perfil da VSync. Sem o plano na resposta, vale Prisma+ (como era).
    const prismaKey = user?.prismaActive && !hiddenNames.has("PRISMA")
        ? (user.prismaPlan === "prisma" ? "BADGE_SHOW_PRISMA_BASIC" : "BADGE_SHOW_PRISMA")
        : null;

    if (prismaKey) {
        add(prismaKey);
    }

    for (const flag of flags) {
        // o BADGE_HIDE_ só esconde; não mostra nada
        if (/^BADGE_HIDE_/.test(String(flag))) {
            continue;
        }

        const key = keyOf(flag);

        // a assinatura de agora (prismaPlan) manda: uma flag de Prisma+ não soma ao plano básico
        if (key && !(prismaKey && key === "BADGE_SHOW_PRISMA")) {
            add(key);
        }
    }

    // O selo atual de Pulse que a API informa vale mesmo quando `flags` não traz o nível.
    const months = Number(user?.pulseBadge?.months);

    if (user?.pulsing && Number.isFinite(months) && !hiddenNames.has("PULSE")) {
        add(`BADGE_SHOW_PULSE_${months}`);
    }

    // Tempo de tela: só o nível mais alto alcançado.
    const hours = Number(user?.shareSeconds) / 3600;

    if (Number.isFinite(hours) && !hiddenNames.has("STREAM_TIME")) {
        const tier = STREAM_TIERS.filter(([need]) => hours >= need).at(-1);

        if (tier) {
            add(`STREAM_${tier[0]}H`);
        }
    }

    // Os níveis do Pulse são acumulativos: aparece só o mais alto, como um selo só.
    const pulse = badges.filter(badge => /^BADGE_SHOW_PULSE_\d+$/.test(badge.id));

    if (pulse.length > 1) {
        const level = badge => Number(badge.id.replace("BADGE_SHOW_PULSE_", ""));

        const top = pulse.reduce((best, badge) => level(badge) > level(best) ? badge : best);

        return badges.filter(badge => !pulse.includes(badge) || badge === top);
    }

    return badges;
}

// ==========================================
// FORMATAÇÃO DOS EMOJIS
// ==========================================

export function formatUserBadgeIcons(user) {
    const badges = getUserBadges(user);

    if (!badges.length) {
        return "Nenhuma insígnia visível.";
    }

    const icons = badges
        .map(badge => badge.emoji)
        .filter(Boolean)
        .join(" ");

    return icons || "Nenhum emoji cadastrado.";
}

// ==========================================
// FORMATAÇÃO DAS INSÍGNIAS
// ==========================================

export function formatUserBadges(user) {
    const badges = getUserBadges(user);

    if (!badges.length) {
        return "Nenhuma insígnia visível.";
    }

    return badges
        .map(badge => {
            return [
                badge.emoji,
                badge.name
            ]
                .filter(Boolean)
                .join(" ");
        })
        .join("\n");
}

// ==========================================
// PRISMA / PULSE
// ==========================================

export function getPrismaInfo(user) {
    const plans = {
        prisma: "Prisma",
        prisma_plus: "Prisma+"
    };

    const active = Boolean(user?.prismaActive);

    const flags = Array.isArray(user?.flags)
        ? user.flags
        : [];

    const months = Number(user?.pulseMonths);

    return {
        active,

        plan: active
            ? (
                plans[user?.prismaPlan] ||
                user?.prismaPlan ||
                "Prisma"
            )
            : "Sem Prisma",

        pulsing: Boolean(user?.pulsing),

        pulseMonths: Number.isFinite(months)
            ? Math.max(0, months)
            : 0,

        pulseBadges: flags.filter(flag =>
            /^BADGE_SHOW_PULSE_\d+$/.test(flag)
        )
    };
}