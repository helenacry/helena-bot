
// ==========================================
// EMOJIS PRÓPRIOS DA HELENA
// ==========================================

// Os desenhos ficam em assets/emojis/<nome>.svg (a pelúcia, a tinta escura, o lilás e a sombra em
// violeta). No Discord cada um é um "emoji do aplicativo" chamado h_<nome>, que vale em qualquer
// servidor onde a Helena está. O código continua escrevendo o emoji comum ("🏷️"); a função icon()
// (services/platform/app-emojis.mjs) troca pelo da Helena quando ele existe e deixa o comum quando
// não existe, então o bot nunca fica sem ícone.
//
// Para enviar os desenhos ao Discord: npm run emojis:upload (veja docs/discord-setup.md).

export const ICON_PREFIX = "h_";

// nome do arquivo e do emoji -> o emoji comum que ele substitui
export const ICONS = Object.freeze({
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
    ready: "✅",
    wait: "⏳",
    jail: "🔒",
    refresh: "🔄",
    legal: "⚖️",
    illegal: "🦹",
    stopwatch: "⏱️"
});
