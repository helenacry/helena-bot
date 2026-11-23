import { drops } from "../economy/drops.mjs";

import { claimedMessage } from "../economy/drops-view.mjs";

import { update, warn } from "./panel-kit.mjs";

// ==========================================
// DROPS: O CLIQUE
// ==========================================

// customId: drop:pegar:<id>. Qualquer pessoa pode apertar (o primeiro leva): quem leva troca a mensagem do drop pelo
// resultado; os outros só recebem um aviso só deles.
export function handleDropClick(interaction) {
    const [, action, id] = String(interaction.data?.customId ?? "").split(":");

    if (action !== "pegar") {
        return warn("Botão desconhecido", "Esse botão não é reconhecido.");
    }

    const result = drops.claim({
        id,
        guildId: interaction.guildId,
        userId: interaction.user?.id
    });

    switch (result.status) {
        case "ok":
            return update(claimedMessage({ userId: interaction.user.id, delivery: result.delivery }));

        case "late":
            return warn("Foi por pouco", "Outra pessoa pegou o presente primeiro.");

        case "gone":
            return warn("O presente já sumiu", "Ele ficou pouco tempo no chat. O próximo aparece quando a conversa esquentar.");

        case "no_account":
            return warn("Use a Helena primeiro", "Só quem já usou a Helena neste servidor pode pegar presentes. Comece com `/tutorial`.");

        case "cap":
            return warn("Limite de hoje", `Você já pegou ${result.cap} presentes hoje neste servidor. Volte amanhã.`);

        case "blocked":
            return warn("Indisponível", "Você não pode pegar presentes.");

        default:
            return warn("Não foi possível pegar", "Tente no próximo presente.");
    }
}
