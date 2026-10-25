
// ==========================================
// EMOJIS PRÓPRIOS DA HELENA
// ==========================================

// Os desenhos ficam em assets/emojis/<nome>.svg (a pelúcia, a tinta escura, o lilás e a sombra em
// violeta). No Discord cada um é um "emoji do aplicativo" chamado h_<nome>, que vale em qualquer
// servidor onde a Helena está. O código continua escrevendo o emoji comum ("🏷️"); na hora de enviar,
// o bot troca pelo da Helena (services/discord/format.mjs usa customize(), de
// services/platform/app-emojis.mjs) e, se ele ainda não existe no aplicativo, deixa o comum. Assim o
// bot nunca fica sem ícone e nenhum comando precisa saber disto.
//
// Cada nome leva o emoji comum que ele substitui, ou uma lista (o mesmo desenho vale para os
// parecidos: 🔧 🛠️ ⚙️ viram a chave inglesa). Um emoji comum só pode aparecer em um nome.
//
// Para enviar os desenhos ao Discord: node --env-file=.env scripts/dev/emojis.mjs upload
// (veja docs/discord-setup.md e docs/bot-design.md).

export const ICON_PREFIX = "h_";

export const ICONS = Object.freeze({
    // conta e perfil
    user: "👤",
    tag: "🏷️",
    id: "🪪",
    badge: "🏅",
    calendar: "📅",
    join: "📥",
    boost: "🚀",
    roles: "🎭",
    avatar: "🖼️",
    banner: "🌌",
    bot: "🤖",

    // estados
    ready: ["✅", "✔️"],
    wait: "⏳",
    jail: ["🔒", "🔐"],
    unlock: "🔓",
    refresh: "🔄",
    cross: ["❌", "✖️"],
    warning: "⚠️",
    info: "ℹ️",
    prohibited: "🚫",
    up: "⬆️",

    // dinheiro
    money: "💵",
    wallet: ["👛", "👝"],
    bank: ["🏦", "🏛️"],
    gem: "💎",
    coins: "💰",
    receipt: "🧾",
    spend: "💸",
    cart: ["🛒", "🛍️"],
    gift: "🎁",
    box: "📦",

    // progresso
    sparkle: "✨",
    star: ["⭐", "🌟"],
    trophy: "🏆",
    crown: "👑",
    party: ["🎉", "🎊"],
    fire: "🔥",
    energy: "⚡",
    battery: ["🔋", "🪫"],
    job: "💼",
    sprout: "🌱",
    plate: "🍽️",
    medal1: "🥇",
    medal2: "🥈",
    medal3: "🥉",

    // família e gente
    heart: "❤️",
    broken: "💔",
    ring: "💍",
    family: ["👨‍👩‍👧", "👪"],
    bottle: ["🍼", "👶"],
    phone: ["📞", "☎️"],
    house: "🏠",

    // crime e combate
    legal: "⚖️",
    illegal: "🦹",
    swords: "⚔️",
    shield: "🛡️",
    gun: "🔫",
    dagger: ["🗡️", "🔪"],
    siren: ["🚨", "🚔"],
    soap: "🧼",
    chain: "⛓️",
    skull: "💀",
    factory: "🏭",
    hospital: "🏥",

    // telas e botões
    search: ["🔎", "🔍"],
    folder: ["📂", "📁"],
    prev: "◀️",
    next: "▶️",
    trash: "🗑️",
    pencil: "✏️",
    book: ["📖", "📚"],
    scroll: "📜",
    chart: ["📊", "📈", "📉"],
    wrench: ["🔧", "🛠️", "⚙️"],
    alarm: "⏰",
    stopwatch: "⏱️",
    bulb: "💡",
    pin: "📍"
});

/** Os emojis comuns de um nome, sempre em lista. */
export const fallbacksOf = name => [ICONS[name]].flat();
