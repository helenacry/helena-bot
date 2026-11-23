// ==========================================
// EVENTOS DA SEMANA (/evento)
// ==========================================

// Um evento é um bônus que liga sozinho em certos dias da semana, no horário de Brasília (o jogo é brasileiro: o dia
// de um evento começa à meia-noite daqui, não à do UTC). Não há tabela nem comando de dono: os dias e os efeitos
// ficam aqui. services/economy/events.mjs diz quais estão ativos agora e aplica os efeitos.
//
// "days" são os dias da semana em que vale, de 0 (domingo) a 6 (sábado). "effects":
//   xp        multiplica o XP do trabalho e da pesca
//   salary    multiplica o salário do trabalho
//   fishLuck  multiplica a chance dos peixes raros, épicos e lendários na pesca (a isca vazia e o lixo encolhem na
//             proporção, porque a soma dos pesos é o que vale)
//
// HELENA_EVENTS=off desliga todos (os testes rodam com ele desligado, para o dia da semana de quem roda não mudar os
// valores; tests/events.test.mjs liga e controla o relógio).

export const EVENT_UTC_OFFSET_HOURS = -3;

export const EVENTS = Object.freeze([
    Object.freeze({
        id: "worker_wednesday",
        name: "Quarta do trabalhador",
        emoji: "🛠️",
        days: Object.freeze([3]),
        effects: Object.freeze({ salary: 1.25 }),
        description: "O salário do /trabalhar paga 25% a mais."
    }),

    Object.freeze({
        id: "good_tide_friday",
        name: "Sexta de maré boa",
        emoji: "🌊",
        days: Object.freeze([5]),
        effects: Object.freeze({ fishLuck: 2 }),
        description: "Na /pescar, a chance dos peixes raros, épicos e lendários dobra."
    }),

    Object.freeze({
        id: "double_xp_weekend",
        name: "Fim de semana em dobro",
        emoji: "✨",
        days: Object.freeze([6, 0]),
        effects: Object.freeze({ xp: 2 }),
        description: "O XP do /trabalhar e da /pescar vale o dobro."
    })
]);

export const WEEKDAY_NAMES = Object.freeze(["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]);

export function getEvent(id) {
    return EVENTS.find(event => event.id === id) ?? null;
}
