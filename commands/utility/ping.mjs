
import { pingResponse } from "../../services/panels/ping-panel.mjs";

// ==========================================
// COMANDO /PING
// ==========================================

// Responder já é a prova de que o bot está no ar. O painel (services/panels/ping-panel.mjs) vai
// além e mostra de quem é a lentidão: da Helena, do Discord ou de ninguém.

export default {
    name: "ping",
    description: "Mostra se o bot está no ar e se a lentidão é da Helena ou do Discord",

    async execute(interaction) {
        return pingResponse(interaction);
    }
};
