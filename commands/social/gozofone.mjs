
import { startCall } from "../../services/social/family.mjs";

import { inviteView, callLive } from "../../services/panels/family-panel.mjs";

import { embedResponse, errorEmbed } from "../../utils/embed.mjs";

// ==========================================
// COMANDO /GOZOFONE
// ==========================================

// Uma ligação para o cônjuge. Ele tem poucos segundos para atender; atendendo, ou nasce um
// filho (uma chance pequena) ou ele recebe um dinheiro. A espera é de quem liga, volta se o
// cônjuge recusar ou não atender e fica se quem ligou cancelar. As regras estão em
// config/family.mjs, a ligação em services/social/family.mjs e os botões em
// services/panels/family-panel.mjs.

export default {
    name: "gozofone",
    aliases: ["gf"],
    description: "Ligue para o seu cônjuge: pode render um filho ou um dinheiro",

    async execute(interaction) {
        const guildId = interaction.guildId;
        const callerId = interaction.user?.id;

        if (!guildId || !callerId) {
            return errorEmbed("Não foi possível identificar sua conta.");
        }

        try {
            const call = startCall({ guildId, callerId: String(callerId) });

            const view = inviteView(call);

            // a mensagem menciona o cônjuge (é assim que ele fica sabendo da ligação)
            const response = embedResponse(view.embed, `<@${call.partnerId}>`);

            response.data.components = view.components;

            // a mensagem é editada quando o tempo acaba (ninguém atendeu)
            response.live = callLive(call.id);

            return response;

        } catch (error) {
            return errorEmbed(error.message, "Gozofone");
        }
    }
};
