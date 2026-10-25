# Painel do site (API)

[← Voltar ao README](../README.md) · [Índice da documentação](README.md)

A API que deixa a pessoa coletar o daily e as gemas pelo navegador.

O painel permite coletar o **daily** e um **bônus de gemas** pelo navegador, entrando com a conta do Discord ("Entrar com discord", OAuth2 com PKCE). Tudo vem **desligado**: sem `HELENA_WEB_PORT` o bot funciona como sempre e a API nem sobe.

**Fluxo.** O site leva a pessoa ao Discord; na volta, entrega o código e o `code_verifier` à API (`services/web/web-api.mjs`), porque o navegador não consegue falar direto com o endpoint de troca do Discord (ele não libera CORS para outros sites). A API troca o código, lê quem é a pessoa e os servidores dela, **devolve o acesso do Discord na hora** e cria uma sessão própria de 6 horas, no máximo 5 por pessoa. No banco fica só o hash do token. O painel lista só os servidores em que a pessoa e a Helena estão.

**Regras.** O daily usa o mesmo serviço do comando (`services/economy/daily.mjs`): mesma recarga de 24 h, sequência, bônus do 7º dia, limite da carteira e a prisão também bloqueia. O bônus de gemas (`config/gems.mjs`) rende de 1 a 3 gemas a cada 5 horas e vale para a conta em todos os servidores (`services/economy/gem-bonus.mjs`).

**Bot e site são o mesmo estado.** O daily e as gemas podem ser coletados pelo comando (`/daily`, `/coletargemas`) ou pelo painel, e os dois lados usam o mesmo serviço e o mesmo banco: coletou em um, o outro já mostra a recarga e não paga de novo. O `/gemas` também mostra se o bônus está disponível. `tests/web-api.test.mjs` coleta de um lado e confere o outro, nos dois sentidos, para o daily e para as gemas. Só uma diferença de propósito: o site pede o desafio anti-robô (Turnstile) quando configurado, e o comando não (quem digita o comando já está logado no Discord).

| Rota | O que faz |
|---|---|
| `GET /api/health` | confere se a API está de pé |
| `POST /api/auth/login` | troca o código do login pela sessão |
| `POST /api/auth/logout` | encerra a sessão |
| `GET /api/me` | servidores, dinheiro, daily e gemas (só leitura) |
| `POST /api/claim/daily` | coleta o daily de um servidor |
| `POST /api/claim/gems` | coleta o bônus de gemas |

**Para ligar** (variáveis em `.env.example`):

1. No Portal do Desenvolvedor do Discord, cadastre o endereço de retorno do login, igual ao do site e com a barra final (por exemplo `https://helena.discloud.dev/account/`). Para testar no computador, `http://127.0.0.1:PORTA/account/` também vale.
2. Preencha `HELENA_WEB_PORT`, `HELENA_WEB_ORIGINS`, `HELENA_OAUTH_REDIRECTS` e `HELENA_OAUTH_CLIENT_ID`. A API escuta só em `127.0.0.1`.
3. Publique essa porta na internet com HTTPS (Tailscale Funnel, Cloudflare Tunnel, ngrok ou um servidor) e, com a API atrás de um túnel, ponha `HELENA_WEB_TRUST_PROXY=1`. Se o bot ficar desligado, o painel mostra "fora do ar".
4. Crie uma chave gratuita do [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile): a chave **secreta** vai em `HELENA_TURNSTILE_SECRET` e a chave **do site** em `site/src/config.ts`.
5. Preencha `apiUrl`, `clientId` e `turnstileSiteKey` em `site/src/config.ts`. Com `apiUrl` vazio, o painel fica escondido no site.

**Segurança.** CORS só para as origens listadas (nunca `*`) e sem cookies; toda resposta JSON leva `Cache-Control: no-store`, `nosniff`, uma CSP que não deixa nada rodar nem ser embutido e `Referrer-Policy: no-referrer`; limites de tentativas por IP e por pessoa (e por IP **antes** de consultar o banco, para token falso em enxurrada: `limits.auth`, 240 por minuto) com um teto de chaves na memória; corpo máximo de 8 KB; o endereço de retorno do login precisa ser um dos cadastrados; cada entrada, coleta e recusa fica em `web_claim_log` com data, IP e navegador (o site avisa isso) e é apagada depois de `claimLogDays` dias (90, em `config/web.mjs`), junto com as sessões vencidas, na limpeza que roda a cada 10 minutos. Automação para coletar não é permitida.
