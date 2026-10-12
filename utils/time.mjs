
// ==========================================
// FORMATAÇÃO DE TEMPO
// ==========================================

// 3725 -> "1h 2m 5s". Omite as unidades zeradas à
// esquerda, mas sempre mostra pelo menos os segundos.
export function formatDuration(seconds) {
    const total = Math.max(0, Math.ceil(Number(seconds) || 0));

    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    const parts = [];

    if (hours > 0) {
        parts.push(hours + "h");
    }

    if (hours > 0 || minutes > 0) {
        parts.push(minutes + "m");
    }

    parts.push(secs + "s");

    return parts.join(" ");
}
