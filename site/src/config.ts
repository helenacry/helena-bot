// Links e chaves públicas do site. Nada aqui é segredo: o ID do aplicativo, a
// chave do site do Turnstile e o endereço da API são vistos por qualquer visitante.
//
// O endereço do próprio site (e o caminho-base do GitHub Pages) vem de
// config/site.mjs, na raiz do repositório: o bot lê o mesmo arquivo.

export const SITE = {
  name: "Helena",
  description:
    "Bot de economia e RPG para a VSync: trabalho, banco, loja, duelos, casamento e crime com lavagem de dinheiro. Cada servidor tem a sua economia e cada jogador, o seu cartão de perfil.",

  inviteUrl:
    "https://vsync.lat/oauth2/authorize?client_id=235205613573263360&scope=bot&permissions=VIEW_CHANNEL,SEND_MESSAGES",
  supportUrl: "https://vsync.lat/tfe6pdxk",

  // Repositório do código (opcional). Vazio, o item some do rodapé.
  codeUrl: "",

  // Contato público das páginas de termos e privacidade: o perfil do
  // desenvolvedor no GitHub (de propósito, sem e-mail). Nunca deixe vazio:
  // a política precisa dizer como falar com quem cuida dos dados.
  contactUrl: "https://github.com/matheustonon1",

  // Quem criou a Helena, com o perfil público de cada pessoa no GitHub, e a
  // organização que guarda o projeto. Aparecem nos créditos do rodapé.
  creators: [
    { handle: "matheustonon1", url: "https://github.com/matheustonon1" },
    { handle: "agorismo", url: "https://github.com/agorismo" }
  ],
  orgUrl: "https://github.com/helenacry",
  orgName: "helenacry",

  // ---- Painel da conta (login com a VSync + coleta do daily e das gemas) ----
  // Endereço público da API da Helena (a porta HELENA_WEB_PORT do bot, publicada
  // com HTTPS), sem barra no fim. Vazio = painel escondido.
  apiUrl: "https://helena.discloud.dev",

  // ID do aplicativo na VSync (o mesmo do link de convite). É público.
  clientId: "235205613573263360",

  // Chave PÚBLICA ("site key") do Cloudflare Turnstile. Vazia = sem desafio
  // na tela (a API só exige o desafio se tiver a chave secreta).
  turnstileSiteKey: "0x4AAAAAAFZjj29XG0d5aJuC"
} as const;

export const hasAccountPanel = String(SITE.apiUrl).length > 0;
