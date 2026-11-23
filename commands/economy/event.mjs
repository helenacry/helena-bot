import {
    buildEvents,
    eventsResponse
} from "../../services/economy/events-view.mjs";

// ==========================================
// COMANDO /EVENTO
// ==========================================

// Os eventos que estão valendo agora e os da semana. Servem a todo mundo (não mexe em dados de ninguém), então
// também abre sem conta. As regras estão em config/events.mjs e services/economy/events.mjs.

export default {
    name: "evento",
    description: "Veja os eventos de hoje e da semana",

    async execute() {
        return eventsResponse(buildEvents());
    }
};
