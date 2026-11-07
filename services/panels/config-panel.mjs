
import { DEFAULT_LANG, LANGUAGES, isLang } from "../../config/i18n.mjs";

import { getLang, setLang } from "../platform/i18n.mjs";

import {
    button,
    notYours,
    row,
    sameUser,
    update,
    warn
} from "./panel-kit.mjs";

import {
    HELENA_COLORS,
    ledgerEmbed
} from "../../utils/embed.mjs";

// ==========================================
// PAINEL DO /CONFIG
// ==========================================

// Hoje o painel muda uma coisa: o idioma em que a Helena fala com VOCÊ (em todos os servidores). Cada
// idioma é um botão com o nome na língua dele; o que está em uso fica marcado e desligado. O texto do
// painel está escrito em português, como tudo no bot: quem escolhe o inglês o vê traduzido pelo
// dicionário (config/locales/en-US.mjs), e a resposta ao clique já sai no idioma novo.
//
//   cfg:set:<dono>:<idioma>   troca o idioma (pt-BR ou en-US); só o dono do painel

export function buildConfigView({ ownerId, userId, notice = "" }) {
    const current = getLang(userId);

    const language = LANGUAGES[current] ?? LANGUAGES[DEFAULT_LANG];

    const embed = ledgerEmbed({
        section: "Configurações",
        title: "⚙️ Configurações",

        say: (notice ? notice + "\n" : "") + "Escolha o idioma em que a Helena fala com você.",

        rows: [["Idioma atual", `${language.emoji} ${language.name}`]],

        note: "Vale para você em todos os servidores. O que ainda não foi traduzido aparece em português.",

        color: HELENA_COLORS.primary,
        mood: "feliz"
    });

    const components = [row(
        ...Object.entries(LANGUAGES).map(([code, entry]) => button(
            `cfg:set:${ownerId}:${code}`,
            entry.name,
            entry.emoji,
            code === current ? "success" : "secondary",
            { disabled: code === current }
        ))
    )];

    return { embed, components, language: current };
}

// customId: cfg:set:<dono>:<idioma>
export function handleConfigClick(interaction) {
    const [, action, ownerId, lang] = String(interaction.data?.customId || "").split(":");

    if (!sameUser(interaction, ownerId)) {
        return notYours();
    }

    if (action !== "set" || !isLang(lang)) {
        return warn("Botão desconhecido", "Esse botão não é reconhecido.");
    }

    const userId = interaction.user.id;

    setLang(userId, lang);

    // a resposta já sai no idioma novo: o transporte traduz pelo idioma gravado agora
    return update(buildConfigView({
        ownerId,
        userId,
        notice: `Idioma da Helena para você: ${LANGUAGES[lang].name}`
    }));
}
