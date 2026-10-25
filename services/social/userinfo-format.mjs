
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

const DAY_FORMAT = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "America/Sao_Paulo"
});

const TIME_FORMAT = new Intl.DateTimeFormat("pt-BR", {
    timeStyle: "short",
    timeZone: "America/Sao_Paulo"
});

// "30 de setembro de 2016, às 20:55" (horário de Brasília).
export function dateField(value) {
    const date = dateFrom(value);

    if (!date) {
        return UNKNOWN;
    }

    return `${DAY_FORMAT.format(date)}, às ${TIME_FORMAT.format(date)}`;
}

// A idade em anos, meses e dias de CALENDÁRIO (na data de Brasília, sem contar a hora): "10 anos
// 15 dias", sem as unidades zeradas. null se a data não existe; "menos de 1 dia" se foi hoje.
const BRASILIA = 3 * 60 * 60 * 1000;

// Meia-noite (UTC) do dia de calendário de Brasília em que o instante cai.
function calendarDay(ms) {
    const shifted = new Date(ms - BRASILIA);

    return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

// A data daqui a n meses, com o dia limitado ao tamanho do mês (31/01 + 1 mês = 28 ou 29/02).
function addMonths(day, months) {
    const date = new Date(day);

    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

    const length = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();

    return Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date.getUTCDate(), length));
}

// Menos de 1 dia de idade: "20 horas 34 minutos" (ou só as horas, ou só os minutos).
function formatShortAge(elapsed) {
    const hours = Math.floor(elapsed / 3_600_000);
    const minutes = Math.floor((elapsed % 3_600_000) / 60_000);

    const parts = [];

    if (hours) parts.push(`${hours} ${hours === 1 ? "hora" : "horas"}`);
    if (minutes) parts.push(`${minutes} ${minutes === 1 ? "minuto" : "minutos"}`);

    return parts.length ? parts.join(" ") : "menos de 1 minuto";
}

export function formatAge(from, to = Date.now()) {
    const start = dateFrom(from);

    if (!start) {
        return null;
    }

    // quem entrou há 20 horas não tem "1 dia": abaixo de 24 horas conta o tempo de verdade
    const elapsed = new Date(to).getTime() - start.getTime();

    if (elapsed >= 0 && elapsed < 86_400_000) {
        return formatShortAge(elapsed);
    }

    const first = calendarDay(start.getTime());
    const last = calendarDay(new Date(to).getTime());

    if (!(last > first)) {
        return "menos de 1 dia";
    }

    const a = new Date(first);
    const b = new Date(last);

    let total = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());

    // o último mês cheio que cabe até a data de hoje
    if (addMonths(first, total) > last) {
        total -= 1;
    }

    const days = Math.round((last - addMonths(first, total)) / 86_400_000);
    const years = Math.floor(total / 12);
    const months = total % 12;

    const parts = [];

    if (years) parts.push(`${years} ${years === 1 ? "ano" : "anos"}`);
    if (months) parts.push(`${months} ${months === 1 ? "mês" : "meses"}`);
    if (days) parts.push(`${days} ${days === 1 ? "dia" : "dias"}`);

    return parts.length ? parts.join(" ") : "menos de 1 dia";
}

// "30 de setembro de 2016, às 20:55 (**10 anos 15 dias**)"
export function dateWithAge(value, now = Date.now()) {
    const age = formatAge(value, now);

    if (age === null) {
        return UNKNOWN;
    }

    return `${dateField(value)} (**${age}**)`;
}

// Quanto falta de um instante até outro, em anos, meses, dias e horas de calendário, sem as
// unidades zeradas: "6 meses 9 dias 23 horas". "agora" se já passou; "menos de 1 hora" se falta quase nada.
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
