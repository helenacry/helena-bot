// ==========================================
// INSÍGNIAS, NITRO E IMPULSO DO DISCORD
// ==========================================

// O Discord guarda as insígnias de uma conta num número em bits (as "flags" do usuário: public_flags
// e flags). Cada bit é uma insígnia ou um aviso. A lista abaixo segue a tabela de
// https://flags.lewisakura.moe e a documentação do Discord. Bits acima de 31 existem (a tabela
// vai até o 51), por isso a conta é feita com BigInt: o operador & do JavaScript só enxerga 32 bits.
//
// O que a API entrega e o que não entrega:
//   - As insígnias da conta (Equipe, Parceiro, HypeSquad, Caçador de bugs, Apoiador inicial,
//     Desenvolvedor, Moderador, Desenvolvedor ativo, Bot verificado) vêm nas flags públicas.
//   - A assinatura do Nitro NÃO vem: o Discord só informa o tipo de Nitro (premium_type) ao
//     próprio dono da conta, pelo login OAuth2. O que a Helena consegue é deduzir pelos sinais
//     públicos que só o Nitro libera (avatar animado, banner, perfil por servidor): nitroSigns().
//   - O impulso vem do membro (premium_since): desde quando a pessoa impulsiona ESTE servidor. A
//     insígnia de impulso do Discord conta o tempo em qualquer servidor, então aqui é uma estimativa
//     pelo que a Helena enxerga: boostLadder().
//
// Os ícones são os emojis comuns do Discord: nenhum tem desenho próprio da Helena.

const bit = n => 1n << BigInt(n);

// [bit, id, emoji, nome, o que é]. A ordem é a de exibição.
export const BADGES = Object.freeze([
    [0, "STAFF", "🔱", "Equipe do Discord", "Funcionário do Discord."],
    [1, "PARTNER", "🤝", "Dono de servidor parceiro", "Dono de um servidor do Programa de Parceiros do Discord."],
    [18, "CERTIFIED_MODERATOR", "🔰", "Ex-moderador certificado", "Já fez parte do Programa de Moderadores Certificados."],
    [2, "HYPESQUAD_EVENTS", "🎪", "HypeSquad Events", "Participa dos eventos do HypeSquad."],
    [6, "HOUSE_BRAVERY", "🦁", "HypeSquad Bravery", "Casa Bravery do HypeSquad."],
    [7, "HOUSE_BRILLIANCE", "🦉", "HypeSquad Brilliance", "Casa Brilliance do HypeSquad."],
    [8, "HOUSE_BALANCE", "🐬", "HypeSquad Balance", "Casa Balance do HypeSquad."],
    [3, "BUG_HUNTER_LEVEL_1", "🐛", "Caçador de bugs", "Reportou bugs do Discord (nível 1)."],
    [14, "BUG_HUNTER_LEVEL_2", "🐞", "Caçador de bugs (ouro)", "Reportou muitos bugs do Discord (nível 2, ouro)."],
    [9, "EARLY_SUPPORTER", "🌠", "Apoiador inicial", "Assinou o Nitro nos primeiros tempos (antes de outubro de 2018)."],
    [17, "VERIFIED_DEVELOPER", "🧑‍💻", "Desenvolvedor de bots verificado pioneiro", "Criou um bot verificado nos primeiros tempos."],
    [22, "ACTIVE_DEVELOPER", "🧰", "Desenvolvedor ativo", "Tem um aplicativo com comandos de barra em uso."],
    [16, "VERIFIED_BOT", "☑️", "Bot verificado", "Bot aprovado pelo Discord."]
].map(([n, id, emoji, name, about]) => Object.freeze({ bit: bit(n), id, emoji, name, about })));

// Avisos que não são insígnias de perfil, mas dizem algo da conta. Só aparecem na tela de insígnias.
export const NOTES = Object.freeze([
    [10, "TEAM_PSEUDO_USER", "Conta de equipe de desenvolvedores."],
    [12, "SYSTEM", "Conta do sistema do Discord."],
    [19, "BOT_HTTP_INTERACTIONS", "Bot que recebe comandos por HTTP (sem conexão fixa)."],
    [20, "SPAMMER", "Marcada pelo Discord como spam."],
    [44, "QUARANTINED", "Conta em quarentena."],
    [50, "COLLABORATOR", "Colaborador do Discord."],
    [51, "RESTRICTED_COLLABORATOR", "Colaborador restrito do Discord."]
].map(([n, id, text]) => Object.freeze({ bit: bit(n), id, text })));

// Antigo "discriminador premium" (o número depois do # que só o Nitro escolhia): um sinal fraco.
const PREMIUM_DISCRIMINATOR = bit(37);

// As flags da conta como BigInt: as públicas e, se a API trouxe, as completas.
function flagsOf(user) {
    try {
        return BigInt(Math.trunc(Number(user?.publicFlags ?? 0) || 0)) | BigInt(Math.trunc(Number(user?.flags ?? 0) || 0));

    } catch {
        return 0n;
    }
}

// ------------------------------------------------------------------ insígnias

// As insígnias visíveis desta pessoa: [{ id, emoji, name, about }].
export function getUserBadges(user) {
    const flags = flagsOf(user);

    const badges = BADGES
        .filter(badge => (flags & badge.bit) !== 0n)
        .map(({ id, emoji, name, about }) => ({ id, emoji, name, about }));

    // quem impulsiona este servidor (ou outro onde a Helena também está: userinfo-boost.mjs)
    if (user?.boostingSince || user?.boostSince) {
        badges.push({
            id: "BOOSTER",
            emoji: "💠",
            name: user.boostingSince ? "Impulsiona este servidor" : "Impulsiona servidores",
            about: "Impulsiona um servidor com um Impulso de Servidor."
        });
    }

    return badges;
}

// Os avisos da conta (spam, equipe, quarentena...): [{ id, text }].
export function getAccountNotes(user) {
    const flags = flagsOf(user);

    return NOTES
        .filter(note => (flags & note.bit) !== 0n)
        .map(({ id, text }) => ({ id, text }));
}

// Todas as insígnias que o catálogo conhece (para os testes e a documentação).
export const BADGE_IDS = Object.freeze([...BADGES.map(badge => badge.id), "BOOSTER"]);

// ------------------------------------------------------------------ Nitro

/**
 * O Nitro de uma conta, deduzido dos sinais públicos (a API não informa a assinatura).
 *
 *   likely    tem pelo menos um sinal que só o Nitro libera (avatar animado, banner, perfil por servidor)
 *   possible  só um sinal fraco (o discriminador premium, de contas antigas)
 *   none      nenhum sinal: a conta pode ter Nitro sem exibir nada disso
 *
 * Devolve { state, signs }, com os sinais em português.
 */
export function nitroSigns(user) {
    const strong = [];

    if (String(user?.avatarHash ?? "").startsWith("a_")) strong.push("avatar animado");
    if (user?.bannerHash || user?.bannerUrl) strong.push("banner no perfil");
    if (user?.guildAvatarHash) strong.push("avatar só deste servidor");
    if (user?.guildBannerHash) strong.push("banner só deste servidor");

    const weak = [];

    if ((flagsOf(user) & PREMIUM_DISCRIMINATOR) !== 0n) weak.push("discriminador premium (conta antiga)");

    return {
        state: strong.length ? "likely" : weak.length ? "possible" : "none",
        signs: [...strong, ...weak]
    };
}

// ------------------------------------------------------------------ impulso

// Os meses de impulso em que o Discord troca a insígnia de impulso (do nível 1 ao 9).
export const BOOST_MONTHS = Object.freeze([1, 2, 3, 6, 9, 12, 15, 18, 24]);

const DAY = 86_400_000;

// A data um número de meses depois (somando o mês no calendário, sem passar do fim do mês).
function addMonths(time, months) {
    const date = new Date(time);

    const day = date.getUTCDate();

    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);

    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();

    date.setUTCDate(Math.min(day, last));

    return date.getTime();
}

// Quantos meses cheios cabem entre duas datas.
function wholeMonths(from, to) {
    let months = 0;

    while (addMonths(from, months + 1) <= to) months += 1;

    return months;
}

/**
 * A insígnia de impulso de quem impulsiona este servidor desde "since":
 *
 *   months   meses cheios de impulso
 *   level    o nível da insígnia (0 = ainda não completou 1 mês; 9 = o máximo, de 24 meses)
 *   levels   quantos níveis existem (9)
 *   next     o próximo nível { level, months, at, days } ou null se já está no máximo
 *   steps    cada degrau { level, months, reached, at } (a data em que cada um é, ou foi, alcançado)
 *
 * Devolve null se a pessoa não impulsiona (since vazio).
 */
export const boostLadder = (since, now = Date.now()) => ladderOf(since, now, BOOST_MONTHS);

// A escada de um impulso que começou em "since", com os degraus nos meses de "monthsList".
function ladderOf(since, now, monthsList) {
    const start = Number(since);

    if (!Number.isFinite(start) || start <= 0) {
        return null;
    }

    const months = wholeMonths(start, now);

    const steps = monthsList.map((count, index) => {
        const at = addMonths(start, count);

        return { level: index + 1, months: count, reached: at <= now, at };
    });

    const level = steps.filter(step => step.reached).length;

    const upcoming = steps.find(step => !step.reached);

    return {
        months,
        level,
        levels: monthsList.length,
        next: upcoming
            ? { level: upcoming.level, months: upcoming.months, at: upcoming.at, days: Math.max(1, Math.ceil((upcoming.at - now) / DAY)) }
            : null,
        steps
    };
}
