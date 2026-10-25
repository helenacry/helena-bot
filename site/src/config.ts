// Links e chaves públicas do site. Nada aqui é segredo: o ID do aplicativo, a
// chave do site do Turnstile e o endereço da API são vistos por qualquer visitante.
//
// O endereço do próprio site (e o caminho-base do GitHub Pages) vem de
// config/site.mjs, na raiz do repositório: o bot lê o mesmo arquivo.

// O ID do aplicativo da Helena no Discord (Portal do Desenvolvedor, "Informações gerais",
// "ID do aplicativo"). É público. Sem ele, não há convite nem login no painel.
//
// O build aceita outro ID pela variável de ambiente PUBLIC_DISCORD_CLIENT_ID (o npm run
// site:test usa isso para testar o login com um aplicativo de teste).
const DISCORD_CLIENT_ID: string = String(import.meta.env?.PUBLIC_DISCORD_CLIENT_ID ?? "1559308576537714710");

export const SITE = {
  name: "Helena",
  description:
    "Bot de economia e RPG para o Discord: trabalho, banco, loja, duelos, casamento e crime com lavagem de dinheiro. Cada servidor tem a sua economia e cada jogador, o seu cartão de perfil.",

  // O convite do bot é montado a partir do ID do aplicativo (clientId, mais abaixo): escopo
  // "bot" + "applications.commands" e as permissões que a Helena usa (ver canais, enviar
  // mensagens, incorporar links, anexar arquivos, ler o histórico e usar emojis de fora).
  // Enquanto o ID estiver vazio, o botão fica de fora (e o "npm run site:verify" avisa).
  inviteUrl: DISCORD_CLIENT_ID
    ? `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&scope=bot%20applications.commands&permissions=379904`
    : "",

  // Convite permanente do servidor de suporte da Helena no Discord (discord.gg/...).
  // Vazio, os links "Servidor oficial" somem.
  supportUrl: "https://discord.gg/NDBwQW99RZ",

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

  // ---- Painel da conta (login com o Discord + coleta do daily e das gemas) ----
  // Endereço público da API da Helena (a porta HELENA_WEB_PORT do bot, publicada
  // com HTTPS), sem barra no fim. Vazio = painel escondido.
  apiUrl: "https://helena.discloud.dev",

  // ID do aplicativo no Discord (o mesmo do link de convite). É público.
  clientId: DISCORD_CLIENT_ID,

  // Chave PÚBLICA ("site key") do Cloudflare Turnstile. Vazia = sem desafio
  // na tela (a API só exige o desafio se tiver a chave secreta).
  turnstileSiteKey: "0x4AAAAAAFZjj29XG0d5aJuC"
} as const;

export const hasAccountPanel = String(SITE.apiUrl).length > 0;
