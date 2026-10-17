// ==========================================
// CATÁLOGO DE INSÍGNIAS DO VSYNC
// ==========================================

const BADGES = Object.freeze({
    BADGE_SHOW_ADMIN: {
        emoji: "<:badge_admin:235402174009856000>",
        image: "admin.svg",
        name: "Administrador do VSync"
    },

    BADGE_SHOW_VERIFIED: {
        emoji: "<:badge_verified:235401782727430144>",
        image: "verified.svg",
        name: "Verificado"
    },

    BADGE_SHOW_PRISMA: {
        emoji: "<:badge_prisma_plus:235421406961487872>",
        image: "prisma.svg",
        name: "Prisma+"
    },

    BADGE_SHOW_EARLY_SUPPORTER: {
        emoji: "<:badge_early_supporter:235402151960399872>",
        image: "early-supporter.svg",
        name: "Apoiador inicial"
    },

    BADGE_SHOW_PARTNER: {
        emoji: "<:badge_partner:235402087548473344>",
        image: "partner.svg",
        name: "Dono de servidor parceiro"
    },

    BADGE_SHOW_STAFF: {
        emoji: "<:badge_staff:235401830169202688>",
        image: "staff.svg",
        name: "Staff do VSync"
    },

    BADGE_SHOW_VERIFIED_BOT_DEVELOPER: {
        emoji: "<:badge_developer:235402131815157760>",
        image: null,
        name: "Desenvolvedor de bot verificado pioneiro"
    },

    GIFTING_PATRON: {
        emoji: "",
        image: "gifting-patron.png",
        name: "Patrono dos presentes"
    },

    GIFTING_CHAMPION: {
        emoji: "",
        image: "gifting-champion.png",
        name: "Campeão dos presentes"
    },

    GIFTING_LUMINARY: {
        emoji: "",
        image: "gifting-luminary.png",
        name: "Luminar dos presentes"
    },

    BADGE_SHOW_GIFTING_HERO: {
        emoji: "<:badge_gifting_hero:235401550505594880>",
        image: "gifting-hero.png",
        name: "Herói dos presentes"
    },

    // Insígnias de Pulse
    ...Object.fromEntries(
        [1, 2, 3, 6, 9, 12, 15, 18, 24].map(month => [
            "BADGE_SHOW_PULSE_" + month,
            {
                emoji: month === 24
                    ? "<:pulse_24:235401848926130176>"
                    : "",

                image:
                    "pulse/pulse" +
                    String(month).padStart(2, "0") +
                    ".svg",

                name:
                    "Pulse " +
                    month +
                    (month === 1 ? " mês" : " meses")
            }
        ])
    )
});

// ==========================================
// ALIASES
// ==========================================

const ALIASES = Object.freeze({
    EARLY_SUPPORTER: "BADGE_SHOW_EARLY_SUPPORTER"
});

// ==========================================
// INSÍGNIAS VISÍVEIS
// ==========================================

export function getUserBadges(user) {
    const flags = Array.isArray(user?.flags)
        ? user.flags
        : [];

    const hidden = new Set(
        Array.isArray(user?.hiddenBadges)
            ? user.hiddenBadges
            : []
    );

    const badges = [];
    const seen = new Set();

    // Respeita também aliases ocultos.
    const hiddenCanonical = new Set(
        [...hidden].map(flag => ALIASES[flag] || flag)
    );

    for (const flag of flags) {
        const canonical = ALIASES[flag] || flag;
        const badge = BADGES[canonical];

        if (!badge) {
            continue;
        }

        if (seen.has(canonical)) {
            continue;
        }

        if (
            hidden.has(flag) ||
            hiddenCanonical.has(canonical)
        ) {
            continue;
        }

        seen.add(canonical);

        badges.push({
            id: canonical,
            emoji: badge.emoji,
            image: badge.image,
            name: badge.name
        });
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
// IMAGENS DAS INSÍGNIAS
// ==========================================

export function getUserBadgeImages(user) {
    return getUserBadges(user)
        .filter(badge => Boolean(badge.image))
        .map(badge => ({
            id: badge.id,
            name: badge.name,
            file: badge.image
        }));
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