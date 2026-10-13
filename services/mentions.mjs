
// ==========================================
// MENÇÕES
// ==========================================

// Como a VSync trata a menção <@id>:
//   - no texto da mensagem (body): vira chip e NOTIFICA a pessoa;
//   - na descrição e no valor dos campos de um embed: vira chip, mas
//     não notifica ninguém;
//   - no título, no autor, no rodapé e no nome dos campos: aparece
//     como texto cru ("<@123...>").
//
// Por isso, nos embeds a pessoa é citada com mention(id) em vez do ID
// puro, e quem precisa ser avisado entra também no body.

// Só deixa passar o que cabe num ID (letras, números e "-"), para
// que um valor estranho nunca vire texto de formatação no meio da frase.
const cleanId = id => String(id ?? "").replace(/[^A-Za-z0-9-]/g, "");

export function mention(id) {
    const clean = cleanId(id);

    return clean ? `<@${clean}>` : "alguém";
}

// "<@1> <@2>" para o texto da mensagem, sem repetir nem deixar vazio.
export function mentionAll(ids) {
    return [...new Set(ids.map(cleanId).filter(Boolean))]
        .map(id => `<@${id}>`)
        .join(" ");
}
