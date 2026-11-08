// ==========================================
// INGLÊS: O /userinfo
// ==========================================

// As insígnias e as notas da conta vêm da tabela do próprio comando (services/social/userinfo-badges.mjs) e
// têm a tradução ligada por id aqui: insígnia nova sem tradução faz o teste de cobertura falhar. O resto são
// os rótulos das telas, as datas por extenso e as idades.

import { BADGES, NOTES } from "../../services/social/userinfo-badges.mjs";

import { tpl } from "./template.mjs";

export const BADGE_TEXT = Object.freeze({
    STAFF: ["Discord staff", "Discord employee."],
    PARTNER: ["Partnered server owner", "Owner of a server in Discord's Partner Program."],
    CERTIFIED_MODERATOR: ["Former certified moderator", "Used to be part of the Certified Moderator Program."],
    HYPESQUAD_EVENTS: ["HypeSquad Events", "Takes part in HypeSquad events."],
    HOUSE_BRAVERY: ["HypeSquad Bravery", "HypeSquad House of Bravery."],
    HOUSE_BRILLIANCE: ["HypeSquad Brilliance", "HypeSquad House of Brilliance."],
    HOUSE_BALANCE: ["HypeSquad Balance", "HypeSquad House of Balance."],
    BUG_HUNTER_LEVEL_1: ["Bug hunter", "Reported Discord bugs (level 1)."],
    BUG_HUNTER_LEVEL_2: ["Bug hunter (gold)", "Reported many Discord bugs (level 2, gold)."],
    EARLY_SUPPORTER: ["Early supporter", "Subscribed to Nitro in the early days (before October 2018)."],
    VERIFIED_DEVELOPER: ["Early verified bot developer", "Built a verified bot in the early days."],
    ACTIVE_DEVELOPER: ["Active developer", "Has an app with slash commands in use."],
    VERIFIED_BOT: ["Verified bot", "Bot approved by Discord."]
});

export const NOTE_TEXT = Object.freeze({
    TEAM_PSEUDO_USER: "Developer team account.",
    SYSTEM: "Discord system account.",
    BOT_HTTP_INTERACTIONS: "Bot that receives commands over HTTP (no persistent connection).",
    SPAMMER: "Flagged by Discord as spam.",
    QUARANTINED: "Quarantined account.",
    COLLABORATOR: "Discord collaborator.",
    RESTRICTED_COLLABORATOR: "Restricted Discord collaborator."
});

// ---------- datas e idades ----------

const MONTHS = Object.freeze({
    janeiro: "January", fevereiro: "February", março: "March", abril: "April", maio: "May", junho: "June",
    julho: "July", agosto: "August", setembro: "September", outubro: "October", novembro: "November", dezembro: "December"
});

const AGE_UNITS = Object.freeze({
    ano: ["year", "years"], anos: ["year", "years"],
    mês: ["month", "months"], meses: ["month", "months"],
    dia: ["day", "days"], dias: ["day", "days"],
    hora: ["hour", "hours"], horas: ["hour", "hours"],
    minuto: ["minute", "minutes"], minutos: ["minute", "minutes"]
});

const UNIT_WORD = "(?:ano|anos|mês|meses|dia|dias|hora|horas|minuto|minutos)";

// "2 anos 5 meses" -> "2 years 5 months"; "em **3 dias**" -> "in **3 days**"; "menos de 1 hora"; "agora"
function age(text) {
    return text
        .replace(new RegExp(`(\\d+) (${UNIT_WORD})(?![\\p{L}])`, "gu"), (_, n, unit) => `${n} ${AGE_UNITS[unit][n === "1" ? 0 : 1]}`)
        .replace(/^em /, "in ")
        .replace(/^menos de /, "less than ")
        .replace(/^agora$/, "now");
}

const AGE_RUN = new RegExp(`^\\*\\*(\\d+ ${UNIT_WORD}(?: \\d+ ${UNIT_WORD})*)\\*\\*$`, "u");

// ---------- o que o dicionário recebe ----------

// Os nomes que são iguais nos dois idiomas ("HypeSquad Events"): o tradutor os deixa como estão
// (a lista SAME de en-US.mjs recebe estes).
const same = [];

function build() {
    const exact = {};

    const put = (from, to) => {
        if (from && to && from !== to) {
            exact[from] = to;

        } else if (from && to) {
            same.push(from);
        }
    };

    for (const badge of BADGES) {
        const [name, about] = BADGE_TEXT[badge.id] ?? [];

        put(badge.name, name);
        put(badge.about, about);
    }

    for (const note of NOTES) {
        put(note.text, NOTE_TEXT[note.id]);
    }

    return exact;
}

const BUILT = build();

export const USERINFO_SAME = Object.freeze([...same]);

export const USERINFO_EXACT = Object.freeze({
    ...BUILT,

    // quem impulsiona (a insígnia que o código monta na hora)
    "Impulsiona este servidor": "Boosts this server",
    "Impulsiona servidores": "Boosts servers",
    "Impulsiona um servidor com um Impulso de Servidor.": "Boosts a server with a Server Boost.",

    // ---------- a tela principal ----------
    "Nenhuma insígnia visível.": "No visible badges.",
    "Menção": "Mention",
    "Visualizações": "Views",
    "Etiqueta de servidor": "Server tag",
    "Conta criada em": "Account created on",
    "Entrou no servidor em": "Joined the server on",
    "Impulsionando desde": "Boosting since",
    "Insígnia de impulso atual": "Current boost badge",
    "Próxima insígnia de impulso": "Next boost badge",
    "De castigo até": "Timed out until",
    "**Nível máximo alcançado.**": "**Maximum level reached.**",
    "Impulso": "Boost",
    "Não impulsiona nenhum servidor onde a Helena está.": "Doesn't boost any server Helena is in.",
    "Não detectado": "Not detected",
    "Provável": "Likely",
    "Possível": "Possible",

    // ---------- o menu "mais informações" ----------
    "A foto de perfil, em tamanho grande": "The profile picture, full size",
    "A imagem de capa do perfil": "The profile cover image",
    "Cores do perfil": "Profile colors",
    "Cor de destaque, cores do nome e enfeites": "Accent color, name colors and decorations",
    "Cada insígnia da conta e o que ela quer dizer": "Each account badge and what it means",
    "Nitro e impulso": "Nitro and boost",
    "Sinais de Nitro e o nível da insígnia de impulso": "Nitro signs and the boost badge level",
    "Datas e idades": "Dates and ages",
    "Conta, servidor, impulso e castigo": "Account, server, boost and timeout",
    "Nomes anteriores": "Previous names",
    "Nomes e @usuários que a Helena já viu": "Names and @usernames Helena has seen",
    "Ícones antigos": "Old icons",
    "As fotos de perfil anteriores": "Previous profile pictures",
    "Banners antigos": "Old banners",
    "Os banners anteriores": "Previous banners",
    "Os cargos neste servidor": "The roles in this server",
    "Ocultar, mostrar ou apagar o que a Helena guarda de você": "Hide, show or delete what Helena keeps about you",
    "Ver informações de outros membros no servidor.": "See information about other members in the server.",
    "Digite o @usuário ou a menção de quem você quer ver": "Type the @username or mention of who you want to see",
    "@usuário ou menção": "@username or mention",

    // ---------- as telas ----------
    "Essa pessoa não tem um banner no perfil.": "That person has no profile banner.",
    "Sem cor definida.": "No color set.",
    "Cor de destaque": "Accent color",
    "O tema de duas cores do perfil novo, a bio e as conexões ficam só com o dono da conta: o Discord não os entrega a bots.":
        "The new profile's two-color theme, the bio and the connections stay with the account owner: Discord doesn't hand them to bots.",
    "Vem das flags públicas da conta no Discord. As insígnias de Nitro e de Quests não aparecem aqui: o Discord não as informa a bots. O impulso vem dos servidores onde a Helena está.":
        "Comes from the account's public flags on Discord. Nitro and Quest badges don't show here: Discord doesn't tell bots about them. The boost comes from the servers Helena is in.",
    "O Discord só conta a assinatura do Nitro ao próprio dono da conta. A Helena deduz pelo que o perfil mostra (avatar animado, banner, perfil por servidor); quem tem Nitro e não usa nada disso aparece como \"não detectado\".":
        "Discord only tells the Nitro subscription to the account owner. Helena infers it from what the profile shows (animated avatar, banner, per-server profile); anyone with Nitro who uses none of that appears as \"not detected\".",
    "Níveis da insígnia de impulso": "Boost badge levels",
    "A insígnia do Discord conta o impulso em qualquer servidor; a Helena só enxerga os servidores onde ela está.":
        "Discord's badge counts boosts in any server; Helena only sees the servers she is in.",
    "avatar animado": "animated avatar",
    "banner no perfil": "profile banner",
    "avatar só deste servidor": "server-only avatar",
    "banner só deste servidor": "server-only banner",
    "discriminador premium (conta antiga)": "premium discriminator (old account)",

    // ---------- o histórico ----------
    "Seu histórico do /userinfo": "Your /userinfo history",
    "O `/userinfo` mostra os nomes, as fotos e os banners que a Helena já viu em você, só de quem usa a Helena e só a partir do primeiro uso. Pelos botões você oculta, mostra de novo ou apaga tudo.":
        "`/userinfo` shows the names, pictures and banners Helena has seen on you, only for people who use Helena and only from the first use on. With the buttons you can hide, show again or delete everything.",
    "Histórico": "History",
    "visível": "visible",
    "oculto": "hidden",
    "Registros guardados": "Saved records",
    "A Helena nunca guarda mensagens, calls nem servidores": "Helena never keeps messages, calls or servers",
    "Ocultar": "Hide",
    "Mostrar": "Show",
    "Apagar tudo": "Delete all",
    "Histórico oculto": "History hidden",
    "A Helena parou de guardar os seus nomes, fotos e banners e não mostra mais o que já tinha. Para apagar o que ficou, use o botão Apagar.":
        "Helena stopped keeping your names, pictures and banners and no longer shows what she had. To delete what remains, use the Delete button.",
    "Histórico visível": "History visible",
    "A Helena voltou a guardar os seus nomes, fotos e banners, e o que ela já tinha volta a aparecer no `/userinfo`.":
        "Helena went back to keeping your names, pictures and banners, and what she already had shows up again in `/userinfo`.",
    "Histórico apagado": "History deleted",
    "Não havia nada guardado do seu histórico.": "There was nothing saved from your history.",
    "Use o @usuário exato (o nome de usuário, não o apelido) ou mencione a pessoa.":
        "Use the exact @username (the username, not the nickname) or mention the person.",

    // ---------- o aviso de "faltou a pessoa" ----------
    "Faltou a pessoa": "Missing the person",
    "Digite o @usuário ou a menção de quem você quer ver.": "Type the @username or mention of who you want to see."
});

export const USERINFO_PATTERNS = Object.freeze([
    // "06 de maio de 2021, às 20:00 (**5 anos 6 meses 1 dia**)" e "... (em **3 dias**)"
    [/^(\d{1,2}) de (\p{L}+) de (\d{4}), às (\d{1,2}:\d{2})(?: \((.+)\))?$/u, m =>
        `${MONTHS[m[2]] ?? m[2]} ${Number(m[1])}, ${m[3]}, at ${m[4]}${m[5] ? ` (${age(m[5])})` : ""}`],

    // "**2 anos 8 meses 7 dias**" (a idade da insígnia de impulso)
    [AGE_RUN, m => `**${age(m[1])}**`],

    [/^(\d+) (?:mês|meses)$/, m => `${m[1]} ${m[1] === "1" ? "month" : "months"}`],

    // "**Provável** (avatar animado, banner no perfil)"
    [/^\*\*(Provável|Possível)\*\* \((.+)\)$/, (m, translate) =>
        `**${translate(m[1])}** (${m[2].split(", ").map(sign => translate(sign)).join(", ")})`],

    tpl("Comando executado por: {name}", "Command run by: {name}"),

    tpl("Visualizações: {n}", "Views: {n}"),

    tpl("Apaguei **{n}** registros do seu histórico. Se ele estiver visível, a Helena começa de novo a partir de agora.",
        "I deleted **{n}** records from your history. If it is visible, Helena starts over from now on."),

    tpl("Apaguei **{n}** registro do seu histórico. Se ele estiver visível, a Helena começa de novo a partir de agora.",
        "I deleted **{n}** record from your history. If it is visible, Helena starts over from now on."),

    tpl("Informações de {name}", "Information about {name}"),

    tpl("Perfil de {name}", "Profile of {name}"),

    tpl("🖼️ Avatar de {name}", "🖼️ {name}'s avatar"),

    tpl("🌌 Banner de {name}", "🌌 {name}'s banner"),

    tpl("🎨 Cores do perfil de {name}", "🎨 {name}'s profile colors"),

    tpl("🏅 Insígnias de {name}", "🏅 {name}'s badges"),

    tpl("🌀 Nitro e impulso de {name}", "🌀 {name}'s Nitro and boost"),

    tpl("📅 Datas de {name}", "📅 {name}'s dates"),

    tpl("✏️ Nomes anteriores de {name}", "✏️ {name}'s previous names"),

    tpl("🖼️ Ícones antigos de {name}", "🖼️ {name}'s old icons"),

    tpl("🌌 Banners antigos de {name}", "🌌 {name}'s old banners"),

    tpl("🎭 Cargos de {name} ({n})", "🎭 {name}'s roles ({n})"),

    tpl("[Abrir em tamanho original]({url})", "[Open full size]({url})"),

    tpl("A Helena só guarda o histórico de quem usa a Helena, e **{name}** ainda não usou. Quando usar, o histórico começa ali.",
        "Helena only keeps the history of people who use Helena, and **{name}** hasn't yet. Once they do, the history starts there."),

    tpl("Não encontrei ninguém com o @usuário **{q}** neste servidor.", "I couldn't find anyone with the @username **{q}** in this server.")
]);
