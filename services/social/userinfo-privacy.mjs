import {
    clearHistory,
    countHistory,
    isHidden,
    setHidden
} from "./userinfo-history.mjs";

import { clearDeclared, getDeclared } from "./userinfo-declared.mjs";

import { dateField } from "./userinfo-format.mjs";

import { icon } from "../platform/app-emojis.mjs";

import {
    embedResponse,
    errorEmbed,
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

// ==========================================
// O HISTÓRICO DO SEU /USERINFO: OCULTAR, MOSTRAR, APAGAR
// ==========================================

// O /userinfo guarda, de quem usa a Helena, os nomes, as fotos e os banners que a Helena já viu
// (userinfo-history.mjs). A pessoa decide, no item "Meu histórico" do menu do próprio cartão (com
// três botões) ou escrevendo a palavra no comando (`/userinfo usuario:ocultar`, `hui ocultar`):
// ocultar (para de guardar e não mostra o que já tinha), mostrar de novo ou apagar tudo.
// Fica dentro do /userinfo para não gastar mais um dos 100 comandos de barra do Discord.
//
//   userinfo:priv:<dono>:<ação>    os botões (services/panels/userinfo-panel.mjs)

export const PRIVACY_MENU_VALUE = "privacy";

// As formas que a pessoa digita e a ação a que cada uma vale.
const WORDS = Object.freeze({
    ocultar: "ocultar",
    esconder: "ocultar",
    mostrar: "mostrar",
    liberar: "mostrar",
    apagar: "apagar",
    limpar: "apagar",
    privar: "status"
});

/**
 * A ação que um texto pede: "ocultar", "mostrar", "apagar" ou "status" (só ver como está); null se o
 * texto não é nenhuma dessas palavras (aí é um @usuário, e o /userinfo segue como sempre).
 */
export function privacyAction(value) {
    const text = String(value ?? "").trim().toLowerCase();

    return Object.hasOwn(WORDS, text) ? WORDS[text] : null;
}

const ACTIONS = new Set(["ocultar", "mostrar", "apagar", "status"]);

const button = (ownerId, action, label, emoji, style, disabled) => ({
    type: "button",
    customId: `userinfo:priv:${ownerId}:${action}`,
    label,
    emoji,
    style,
    ...(disabled ? { disabled: true } : {})
});

// Os botões das datas informadas (abrem o formulário; "limpar" apaga as duas).
const declareButton = (ownerId, kind, label, emoji, disabled) => ({
    type: "button",
    customId: `userinfo:decl:${ownerId}:${kind}`,
    label,
    emoji,
    style: "secondary",
    ...(disabled ? { disabled: true } : {})
});

/**
 * A tela de privacidade do histórico (um embed e os três botões). `action` é o que a pessoa acabou de
 * pedir ("ocultar", "mostrar", "apagar") e já vem aplicado aqui; "status" só mostra como está.
 */
export function privacyView(userId, action = "status", { notice = "" } = {}) {
    const id = String(userId);

    const what = ACTIONS.has(action) ? action : "status";

    let title = "🔎 Seu histórico do /userinfo";
    let say =
        "O `/userinfo` mostra os nomes, as fotos e os banners que a Helena já viu em você, só de quem usa a Helena e só a partir do primeiro uso. " +
        "Pelos botões você oculta, mostra de novo ou apaga tudo. Dá também para informar desde quando você assina o Nitro e desde quando impulsiona servidores: o Discord não entrega isso a bots, e as datas aparecem só no seu cartão, marcadas como informadas.";
    let color = HELENA_COLORS.primary;
    let mood = isHidden(id) ? "dormindo" : "feliz";

    if (what === "ocultar") {
        setHidden(id, true);

        title = "🔒 Histórico oculto";
        say = "A Helena parou de guardar os seus nomes, fotos e banners e não mostra mais o que já tinha. Para apagar o que ficou, use o botão Apagar.";
        mood = "dormindo";

    } else if (what === "mostrar") {
        setHidden(id, false);

        title = "🔓 Histórico visível";
        say = "A Helena voltou a guardar os seus nomes, fotos e banners, e o que ela já tinha volta a aparecer no `/userinfo`.";
        color = HELENA_COLORS.success;
        mood = "feliz";

    } else if (what === "apagar") {
        const removed = clearHistory(id) + clearDeclared(id);

        title = "🗑️ Histórico apagado";
        say = removed
            ? `Apaguei **${removed}** ${removed === 1 ? "registro" : "registros"} do seu histórico. Se ele estiver visível, a Helena começa de novo a partir de agora.`
            : "Não havia nada guardado do seu histórico.";
        color = HELENA_COLORS.success;
    }

    const hidden = isHidden(id);
    const declared = getDeclared(id);
    const saved = countHistory(id);

    return {
        embed: ledgerEmbed({
            section: "Privacidade",
            title,
            say: notice ? say + "\n\n" + notice : say,
            rows: [
                ["Histórico", hidden ? "oculto" : "visível"],
                ["Registros guardados", String(saved)],
                ["Nitro desde", declared.nitroSince ? dateField(declared.nitroSince, { time: declared.nitroExact }) : "não informado"],
                ["Impulso desde", declared.boostSince ? dateField(declared.boostSince, { time: declared.boostExact }) : "não informado"]
            ],
            color,
            mood,
            footer: "A Helena nunca guarda mensagens, calls nem servidores"
        }),

        components: [
            {
                type: "row",
                components: [
                    button(id, "ocultar", "Ocultar", icon("🔒"), "secondary", hidden),
                    button(id, "mostrar", "Mostrar", icon("🔓"), "secondary", !hidden),
                    button(id, "apagar", "Apagar tudo", icon("🗑️"), "danger", saved === 0 && !declared.nitroSince && !declared.boostSince)
                ]
            },
            {
                type: "row",
                components: [
                    declareButton(id, "nitro", "Informar Nitro", icon("💠")),
                    declareButton(id, "boost", "Informar impulso", icon("🚀")),
                    declareButton(id, "limpar", "Limpar datas", icon("🧹"), !declared.nitroSince && !declared.boostSince)
                ]
            }
        ]
    };
}

/** A resposta do /userinfo quando a pessoa escreve a palavra no comando. Só ela vê. */
export function privacyResponse(userId, action) {
    if (!userId) {
        return errorEmbed("Não foi possível identificar sua conta.");
    }

    try {
        const view = privacyView(userId, action);

        const response = embedResponse(view.embed);

        response.data.components = view.components;
        response.data.ephemeral = true;

        return response;

    } catch (error) {
        console.error("[USERINFO] Privacidade:", error);

        return errorEmbed("Não foi possível mexer no seu histórico agora.");
    }
}
