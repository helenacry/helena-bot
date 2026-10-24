
// ==========================================
// INSÍGNIAS DO DISCORD
// ==========================================

// O Discord guarda as insígnias públicas de uma conta num número em bits (public_flags). Cada
// bit é uma insígnia. Quem impulsiona o servidor também ganha uma (vem do membro, não da conta).
//
// Os ícones são emojis comuns, que valem em qualquer servidor sem precisar enviar imagem
// nenhuma. Se um dia valer trocar por imagens, o lugar é o campo "emoji" de cada linha (um
// emoji personalizado "<:nome:id>" funciona do mesmo jeito).

// [bit, id, emoji, nome]. A ordem é a de exibição.
const FLAGS = Object.freeze([
    [1 << 0, "STAFF", "🛡️", "Equipe do Discord"],
    [1 << 1, "PARTNER", "🤝", "Dono de servidor parceiro"],
    [1 << 18, "CERTIFIED_MODERATOR", "🔰", "Moderador certificado"],
    [1 << 2, "HYPESQUAD_EVENTS", "🎉", "HypeSquad Events"],
    [1 << 6, "HOUSE_BRAVERY", "🟣", "HypeSquad Bravery"],
    [1 << 7, "HOUSE_BRILLIANCE", "🟠", "HypeSquad Brilliance"],
    [1 << 8, "HOUSE_BALANCE", "🟢", "HypeSquad Balance"],
    [1 << 3, "BUG_HUNTER_LEVEL_1", "🐛", "Caçador de bugs"],
    [1 << 14, "BUG_HUNTER_LEVEL_2", "🐞", "Caçador de bugs (nível 2)"],
    [1 << 9, "EARLY_SUPPORTER", "⭐", "Apoiador inicial"],
    [1 << 17, "VERIFIED_DEVELOPER", "🧑‍💻", "Desenvolvedor de bots verificado pioneiro"],
    [1 << 22, "ACTIVE_DEVELOPER", "🛠️", "Desenvolvedor ativo"],
    [1 << 16, "VERIFIED_BOT", "✅", "Bot verificado"]
]);

// As insígnias visíveis desta pessoa: [{ id, emoji, name }].
export function getUserBadges(user) {
    const flags = Number(user?.publicFlags ?? 0) || 0;

    const badges = FLAGS
        .filter(([bit]) => (flags & bit) !== 0)
        .map(([, id, emoji, name]) => ({ id, emoji, name }));

    // quem impulsiona este servidor
    if (user?.boostingSince) {
        badges.push({ id: "BOOSTER", emoji: "🚀", name: "Impulsiona este servidor" });
    }

    return badges;
}

// Todas as insígnias que o catálogo conhece (para os testes e a documentação).
export const BADGE_IDS = Object.freeze([...FLAGS.map(([, id]) => id), "BOOSTER"]);
