// Links e chaves do site. Vazio, o botão de adicionar leva para a seção
// "Começar", os links do servidor e do código ficam escondidos e o painel
// da conta (daily e gemas) nem aparece.
(function () {
  "use strict";

  var H = (window.Helena = window.Helena || {});

  H.config = {
    inviteUrl: "https://vsync.lat/oauth2/authorize?client_id=235205613573263360&scope=bot&permissions=VIEW_CHANNEL,SEND_MESSAGES",
    supportUrl: "https://vsync.lat/tfe6pdxk",
    codeUrl: "", // repositório do código (opcional)

    // ---- Painel da conta (login com a VSync + coleta do daily e das gemas) ----
    // Endereço público da API da Helena (a porta HELENA_WEB_PORT do bot, publicada
    // com HTTPS), sem barra no fim. Vazio = painel escondido.
    apiUrl: "",

    // ID do aplicativo na VSync (o mesmo do link de convite). É público.
    clientId: "235205613573263360",

    // Chave PÚBLICA ("site key") do Cloudflare Turnstile. Vazia = sem desafio
    // na tela (a API só exige o desafio se tiver a chave secreta).
    turnstileSiteKey: ""
  };
})();
