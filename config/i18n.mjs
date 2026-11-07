// ==========================================
// IDIOMAS DA HELENA
// ==========================================

// O português do Brasil é o idioma de origem: tudo no código está escrito nele, e é o que vale para
// quem nunca escolheu. O inglês é uma tradução por cima (config/locales/en-US.mjs, aplicada em
// services/platform/i18n.mjs na hora de enviar). Cada pessoa escolhe o seu em /config.

export const DEFAULT_LANG = "pt-BR";

// O nome de cada idioma fica sempre na língua dele, para quem escolheu o errado conseguir voltar.
export const LANGUAGES = Object.freeze({
    "pt-BR": Object.freeze({ name: "Português (Brasil)", emoji: "🇧🇷" }),
    "en-US": Object.freeze({ name: "English (US)", emoji: "🇺🇸" })
});

export const isLang = value => Object.hasOwn(LANGUAGES, String(value));
