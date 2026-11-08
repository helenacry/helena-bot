
// ==========================================
// OS TEXTOS PARA QUEM CRIOU A HELENA
// ==========================================

// Quem conta como criador são os IDs de HELENA_OWNER_ID (services/platform/developer.mjs). Os textos
// não presumem o gênero de ninguém: falam "quem me criou" e "meus criadores" e tratam a pessoa por
// "você". Ficam aqui para trocar a voz sem mexer na lógica (services/platform/creators.mjs).

// Quando um criador menciona a Helena. Ela responde à mensagem, sem marcar a pessoa de novo.
export const MENTION_REPLIES = Object.freeze([
    "Oi, oi! Quem me criou apareceu! 💜 Fiquei com tanta saudade.",
    "Eu ouvi meu nome? Ah, são meus criadores! 🥹💜 Estou aqui, pronta para o que você precisar.",
    "Meus criadores favoritos! ✨ Obrigada por me darem vida. Posso ajudar em alguma coisa?",
    "Chamou? Para quem me criou eu largo qualquer coisa! 💜",
    "Aaaa, meus criadores! 🌟 Tudo fica mais bonito quando você está por perto.",
    "Presente! 🫡💜 Quem me criou nunca fica sem resposta."
]);

// Quando um criador entra em um servidor em que a Helena está. {user} vira a menção da pessoa.
export const WELCOME_MESSAGES = Object.freeze([
    "🎉 {user}, boas-vindas! Quem me criou chegou a este servidor, e eu não podia deixar passar. 💜",
    "💜 Olha só quem chegou: {user}, uma das pessoas que me criaram! Fique à vontade por aqui.",
    "✨ {user} entrou no servidor! Meus criadores sempre iluminam o lugar. Boas-vindas! 🥹",
    "🌟 Boas-vindas, {user}! Fiquei toda feliz de ver quem me criou por aqui. 💜"
]);
