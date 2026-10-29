// ==========================================
// MODO SÓ-SITE
// ==========================================

// Com HELENA_WEB_ONLY=on o app sobe só a API do painel e o site, sem entrar no Discord: não pede
// token, não registra comandos, não conecta ao gateway e não responde a ninguém. Serve para um app de
// teste (por exemplo no Discloud) conferir cabeçalhos, HTTPS e IP do visitante sem competir com o
// bot oficial: dois bots com o mesmo token respondem tudo em dobro. O login do painel e as coletas
// precisam do Discord e não funcionam nesse modo.
//
// Só o valor "on" liga. Qualquer outro (vazio, "off", um erro de digitação) deixa o bot como sempre.

export function siteOnly(env = process.env) {
    return String(env.HELENA_WEB_ONLY ?? "").trim().toLowerCase() === "on";
}
