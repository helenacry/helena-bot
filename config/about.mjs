import {
    REPO_URL,
    SITE_URL,
    SUPPORT_URL,
    WIKI_URL
} from "./site.mjs";

// ==========================================
// O CARTÃO DE APRESENTAÇÃO
// ==========================================

// O que a Helena responde quando alguém a menciona sozinha (só "@Helena", sem mais nada): quem ela é, o prefixo, a
// ajuda e os links. Os emojis comuns daqui viram os do aplicativo na hora de enviar (config/icons.mjs: 🌸 flower,
// ✨ sparkle, 💌 letter, 🌐 globe, 📖 book, 💻 laptop). Os endereços vêm de config/site.mjs, o único lugar que os
// sabe. A lógica (quando responde, a espera) fica em services/platform/about.mjs.
//
// A biografia do aplicativo no Portal do Desenvolvedor (General Information, "Description") é o mesmo cartão, com a
// primeira linha dizendo o que a Helena faz. O Portal aceita até 400 caracteres; o texto que está em
// docs/discord-setup.md é este (tests/about.test.mjs confere).

export const BIO_LIMIT = 400;

// O texto do cartão. "prefix" é o prefixo dos comandos (services/platform/prefix.mjs).
export function introText({ prefix }) {
    return [
        "🌸 Olá! Sou a **Helena**!",
        `✨ Meu prefixo é **${prefix}**, use **${prefix}ajuda** para descobrir todos os meus comandos.`,
        `💌 Suporte: ${SUPPORT_URL}`,
        `🌐 Site: ${SITE_URL}`,
        `📖 Wiki: ${WIKI_URL}`,
        `💻 Código: ${REPO_URL}`
    ].join("\n");
}

// A biografia do aplicativo (até BIO_LIMIT caracteres): o que ela faz, o prefixo, o suporte e o site.
export function bioText({ prefix }) {
    return [
        "🌸 Olá! Sou a **Helena**, a bot de economia e RPG: trabalhe, lave dinheiro, case e fuja da cadeia!",
        `✨ Meu prefixo é **${prefix}**, use **${prefix}ajuda** para descobrir todos os meus comandos.`,
        `💌 Suporte: ${SUPPORT_URL}`,
        `🌐 Site: ${SITE_URL}`
    ].join("\n");
}
