// Tempo por extenso, em português: 3600 -> "1 hora", 1800 -> "30 minutos",
// 86400 -> "24 horas". Para frases ("dura 10 minutos"); a contagem regressiva
// ("1h 2m 5s") é utils/time.mjs. Usado pelos comandos e pela wiki.
export function duration(seconds) {
    const plural = (n, one, many) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

    if (seconds % 3600 === 0 && seconds <= 48 * 3600) {
        return plural(seconds / 3600, "hora", "horas");
    }

    if (seconds % 86400 === 0) {
        return plural(seconds / 86400, "dia", "dias");
    }

    if (seconds % 60 === 0) {
        return plural(seconds / 60, "minuto", "minutos");
    }

    return plural(seconds, "segundo", "segundos");
}
