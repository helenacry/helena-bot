
// ==========================================
// MISSÕES
// ==========================================

// Dois tipos: as DIÁRIAS (MISSIONS) reiniciam à meia-noite UTC e as SEMANAIS (WEEKLY_MISSIONS) na segunda-feira, à
// meia-noite UTC. Cada missão escuta um evento do jogo ("work", "deposit", "daily", "fish", "crime"...), que
// services/economy/missions.mjs registra, e paga dinheiro e XP quando o alvo é cumprido e a pessoa resgata.
//
// MISSIONS continua sendo só a lista das diárias (várias telas e testes contam com isso); ALL_MISSIONS junta as duas.

export const MISSIONS = Object.freeze([
    {
        id: "work",
        name: "Trabalhador dedicado",
        description: "Trabalhe 2 vezes",
        period: "daily",
        event: "work",
        target: 2,
        reward: 30000,
        xp: 40,
        emoji: "💼"
    },
    {
        id: "deposit",
        name: "Organização financeira",
        description: "Deposite dinheiro 2 vezes",
        period: "daily",
        event: "deposit",
        target: 2,
        reward: 20000,
        xp: 25,
        emoji: "🏦"
    },
    {
        id: "daily",
        name: "Presença diária",
        description: "Resgate sua recompensa diária",
        period: "daily",
        event: "daily",
        target: 1,
        reward: 15000,
        xp: 20,
        emoji: "🎁"
    },
    {
        id: "fish",
        name: "Dia de pesca",
        description: "Pesque 3 vezes",
        period: "daily",
        event: "fish",
        target: 3,
        reward: 25000,
        xp: 30,
        emoji: "🎣"
    }
]);

// As semanais pagam mais e pedem constância, não um dia só.
export const WEEKLY_MISSIONS = Object.freeze([
    {
        id: "week_work",
        name: "Semana de trabalho",
        description: "Trabalhe 10 vezes na semana",
        period: "weekly",
        event: "work",
        target: 10,
        reward: 150000,
        xp: 120,
        emoji: "🛠️"
    },
    {
        id: "week_fish",
        name: "Pescador da semana",
        description: "Pesque 15 vezes na semana",
        period: "weekly",
        event: "fish",
        target: 15,
        reward: 120000,
        xp: 100,
        emoji: "🐟"
    },
    {
        id: "week_crime",
        name: "Vida do crime",
        description: "Cometa 5 crimes com sucesso na semana",
        period: "weekly",
        event: "crime",
        target: 5,
        reward: 150000,
        xp: 100,
        emoji: "🕵️"
    },
    {
        id: "week_daily",
        name: "Presença na semana",
        description: "Resgate o daily em 5 dias da semana",
        period: "weekly",
        event: "daily",
        target: 5,
        reward: 200000,
        xp: 150,
        emoji: "📅"
    }
]);

export const ALL_MISSIONS = Object.freeze([...MISSIONS, ...WEEKLY_MISSIONS]);

export function getMission(id) {
    return ALL_MISSIONS.find(mission => mission.id === id);
}

export const MISSION_PERIODS = Object.freeze(["daily", "weekly"]);

// O período em que um progresso vale. DIA: a data UTC ("2026-11-22"). SEMANA: "w" mais a data UTC da segunda-feira
// em que ela começou ("w2026-11-16"), para nunca se confundir com um dia.
export function getMissionPeriod(
    now = Date.now(),
    kind = "daily"
) {
    const date = new Date(now);

    if (kind === "weekly") {
        const sinceMonday = (date.getUTCDay() + 6) % 7;

        const monday = new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate() - sinceMonday
        ));

        return "w" + monday.toISOString().slice(0, 10);
    }

    return date.toISOString().slice(0, 10);
}

// Quando as missões do tipo reiniciam (segundos Unix): a próxima meia-noite UTC, ou a da próxima segunda-feira.
export function getMissionReset(
    now = Date.now(),
    kind = "daily"
) {
    const date = new Date(now);

    const midnight = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
    );

    if (kind === "weekly") {
        const untilMonday = 7 - ((date.getUTCDay() + 6) % 7);

        return Math.floor((midnight + untilMonday * 86_400_000) / 1000);
    }

    return Math.floor((midnight + 86_400_000) / 1000);
}
