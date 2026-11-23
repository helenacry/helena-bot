import {
    EVENTS,
    EVENT_UTC_OFFSET_HOURS
} from "../../config/events.mjs";

// ==========================================
// QUAIS EVENTOS ESTÃO VALENDO
// ==========================================

// Só olha o relógio: o dia da semana, no horário de Brasília (config/events.mjs). "now" é sempre em milissegundos
// (como Date.now()). HELENA_EVENTS=off desliga tudo (lido a cada chamada, para os testes ligarem e desligarem).

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function eventsEnabled() {
    return String(process.env.HELENA_EVENTS ?? "on").toLowerCase() !== "off";
}

// O relógio de Brasília: o UTC deslocado, para ler dia e hora com os métodos UTC.
const local = now => new Date(now + EVENT_UTC_OFFSET_HOURS * HOUR);

// O dia da semana de Brasília (0 = domingo) e o início desse dia (em ms UTC reais).
function dayOf(now) {
    const date = local(now);

    return {
        weekday: date.getUTCDay(),
        start: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - EVENT_UTC_OFFSET_HOURS * HOUR
    };
}

/** Os eventos ativos agora: [{ event, endsAt }], com "endsAt" em segundos Unix (a primeira virada de dia sem ele). */
export function activeEvents(now = Date.now()) {
    if (!eventsEnabled()) {
        return [];
    }

    const { weekday, start } = dayOf(now);

    return EVENTS
        .filter(event => event.days.includes(weekday))
        .map(event => {
            // um fim de semana dura dois dias: o fim é a primeira meia-noite em que o evento deixa de valer
            let end = start + DAY;

            for (let step = 1; step < 7 && event.days.includes((weekday + step) % 7); step += 1) {
                end += DAY;
            }

            return { event, endsAt: Math.floor(end / 1000) };
        });
}

/** O multiplicador de um efeito agora ("xp", "salary", "fishLuck"): 1 se nenhum evento o muda (vários multiplicam). */
export function eventMultiplier(effect, now = Date.now()) {
    return activeEvents(now).reduce((total, { event }) => total * (event.effects[effect] ?? 1), 1);
}

/**
 * Os próximos dias com evento, a partir de hoje (hoje incluído): [{ event, startsAt, today }], até "days" dias à
 * frente. "startsAt" é o início do dia (segundos Unix); um evento de dois dias aparece nos dois.
 */
export function upcomingEvents(now = Date.now(), days = 7) {
    if (!eventsEnabled()) {
        return [];
    }

    const { weekday, start } = dayOf(now);

    const list = [];

    for (let step = 0; step < days; step += 1) {
        for (const event of EVENTS.filter(entry => entry.days.includes((weekday + step) % 7))) {
            list.push({
                event,
                startsAt: Math.floor((start + step * DAY) / 1000),
                weekday: (weekday + step) % 7,
                today: step === 0
            });
        }
    }

    return list;
}

/** As linhas "Evento: nome" dos eventos ativos que mexem num dos efeitos dados (para as respostas dos comandos). */
export function eventNotes(effects, now = Date.now()) {
    return activeEvents(now)
        .filter(({ event }) => effects.some(effect => event.effects[effect] !== undefined))
        .map(({ event }) => `> ${event.emoji} Evento · **${event.name}**`);
}
