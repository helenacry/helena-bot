
// ==========================================
// FORMATOS DO /USERINFO
// ==========================================

// Datas e idades usadas pelo cartão do /userinfo e pelos detalhes do menu "Mais informações".
// Tudo puro: recebe o usuário já no formato da Helena (services/discord/normalize.mjs).

export const UNKNOWN = "Não informado";

// Texto sem formatação para o autor, o rodapé e os títulos do embed (o Discord não processa
// markdown neles: uma barra invertida apareceria de verdade). Só tira as quebras de linha.
export function plain(value, max = 200) {
    return String(value ?? "")
        .replace(/[\r\n]+/g, " ")
        .trim()
        .slice(0, max);
}

// Para texto que entra em description e campos, onde o markdown vale.
export function safe(value) {
    return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/([*_`~|>])/g, "\\$1")
        .replace(/@/g, "@​")
        .replace(/\r?\n/g, " ");
}

export function dateFrom(value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    if (
        typeof value === "number" ||
        /^\d+$/.test(String(value))
    ) {
        const number = Number(value);

        if (!Number.isFinite(number) || number <= 0) {
            return null;
        }

        // Os instantes do bot são milissegundos.
        const date = new Date(number);

        return Number.isNaN(date.getTime())
            ? null
            : date;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? null
        : date;
}

// O dia com dois dígitos ("05 de maio de 2024"), no horário de Brasília.
const DAY_FORMAT = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo"
});

const TIME_FORMAT = new Intl.DateTimeFormat("pt-BR", {
    timeStyle: "short",
    timeZone: "America/Sao_Paulo"
});

// "30 de setembro de 2016, às 20:55" (horário de Brasília). Com { time: false }, só o dia: é o que se
// mostra de uma data que a própria pessoa informou sem a hora.
export function dateField(value, { time = true } = {}) {
    const date = dateFrom(value);

    if (!date) {
        return UNKNOWN;
    }

    return time
        ? `${DAY_FORMAT.format(date)}, às ${TIME_FORMAT.format(date)}`
        : DAY_FORMAT.format(date);
}

// Brasília, sem horário de verão (fixo em UTC-3).
const BRASILIA = 3 * 60 * 60 * 1000;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// A data daqui a n meses, com o dia limitado ao tamanho do mês (31/01 + 1 mês = 28 ou 29/02) e a mesma hora.
function addMonthsInstant(ms, months) {
    const date = new Date(ms);

    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

    const length = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();

    return Date.UTC(
        target.getUTCFullYear(),
        target.getUTCMonth(),
        Math.min(date.getUTCDate(), length),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds()
    );
}

const UNITS = [
    ["ano", "anos"],
    ["mês", "meses"],
    ["dia", "dias"],
    ["hora", "horas"],
    ["minuto", "minutos"]
];

// As três maiores unidades a partir da primeira que não é zero, sem as zeradas: "2 anos 5 meses 19 dias",
// "7 meses 18 dias 8 horas", "19 horas 51 minutos". `values` vem na ordem de UNITS.
function topUnits(values) {
    const first = values.findIndex(value => value > 0);

    if (first === -1) {
        return null;
    }

    return values
        .slice(first, first + 3)
        .map((value, index) => (value ? `${value} ${UNITS[first + index][value === 1 ? 0 : 1]}` : null))
        .filter(Boolean)
        .join(" ");
}

// A idade de uma data até agora, pelo tempo que de fato passou (no relógio de Brasília): "2 anos 5 meses
// 19 dias", "7 meses 18 dias 8 horas", "19 horas 51 minutos". Mostra as três maiores unidades, sem as
// zeradas. null se a data não existe; "menos de 1 minuto" se acabou de acontecer (ou ainda vai acontecer).
export function formatAge(from, to = Date.now()) {
    const start = dateFrom(from);

    if (!start) {
        return null;
    }

    const end = new Date(to).getTime();

    if (!Number.isFinite(end) || end - start.getTime() < MINUTE) {
        return "menos de 1 minuto";
    }

    // as contas de calendário (meses com tamanhos diferentes) no relógio de Brasília
    const a = start.getTime() - BRASILIA;
    const b = end - BRASILIA;

    const dateA = new Date(a);
    const dateB = new Date(b);

    let total = (dateB.getUTCFullYear() - dateA.getUTCFullYear()) * 12 + (dateB.getUTCMonth() - dateA.getUTCMonth());

    // o último mês cheio que cabe até agora
    if (addMonthsInstant(a, total) > b) {
        total -= 1;
    }

    const rest = b - addMonthsInstant(a, total);

    return topUnits([
        Math.floor(total / 12),
        total % 12,
        Math.floor(rest / DAY),
        Math.floor((rest % DAY) / HOUR),
        Math.floor((rest % HOUR) / MINUTE)
    ]);
}

// "30 de setembro de 2016, às 20:55 (**10 anos 15 dias**)"; { time: false } tira o "às 20:55".
export function dateWithAge(value, now = Date.now(), options = {}) {
    const age = formatAge(value, now);

    if (age === null) {
        return UNKNOWN;
    }

    return `${dateField(value, options)} (**${age}**)`;
}

// Quanto falta de um instante até outro, em anos, meses, dias e horas de calendário, sem as
// unidades zeradas: "6 meses 9 dias 23 horas". "agora" se já passou; "menos de 1 hora" se falta quase nada.
export function formatCountdown(from, to) {
    if (from == null || to == null) {
        return UNKNOWN;
    }

    const start = Number(new Date(from));
    const end = Number(new Date(to));

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return UNKNOWN;
    }

    if (end <= start) {
        return "agora";
    }

    const a = new Date(start);
    const b = new Date(end);

    let total = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());

    if (addMonthsInstant(start, total) > end) {
        total -= 1;
    }

    const rest = end - addMonthsInstant(start, total);

    const days = Math.floor(rest / 86_400_000);
    const hours = Math.floor((rest % 86_400_000) / 3_600_000);
    const years = Math.floor(total / 12);
    const months = total % 12;

    const parts = [];

    if (years) parts.push(`${years} ${years === 1 ? "ano" : "anos"}`);
    if (months) parts.push(`${months} ${months === 1 ? "mês" : "meses"}`);
    if (days) parts.push(`${days} ${days === 1 ? "dia" : "dias"}`);
    if (hours) parts.push(`${hours} ${hours === 1 ? "hora" : "horas"}`);

    return parts.length ? parts.join(" ") : "menos de 1 hora";
}
