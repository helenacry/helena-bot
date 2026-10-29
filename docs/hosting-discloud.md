# Hospedagem no Discloud

[← Voltar ao README](../README.md) · [Índice da documentação](README.md)

Onde o bot oficial roda hoje.

O bot e a API do painel rodam **juntos** num app `TYPE=site` do Discloud (plano Platinum ou superior; o Diamond serve). O que está abaixo foi **conferido num app de teste de verdade**, e não só lido na documentação:

| O quê | Resultado |
|---|---|
| Node | `VERSION=latest` entrega o Node 24 (v24.22.0 no teste), com o `node:sqlite` |
| Banco | arquivos gravados em `/home/node`, como `data/helena.db`, **sobrevivem aos commits**, mesmo com o contêiner recriado |
| Gateway | a conexão WebSocket com `wss://gateway.discord.gg` abre (o `hello` chega em menos de 0,4 s) |
| Variáveis | as da aba Variáveis do painel viram variáveis de ambiente de verdade, mas só valem depois de um **rebuild ou deploy** |
| Endereço | `https://<ID>.discloud.dev`, com HTTPS válido (a documentação cita `.discloud.app`, que **não resolve**); o app escuta na **porta 8080, em 0.0.0.0** |
| IP do visitante | o Discloud fica atrás da Cloudflare: `X-Forwarded-For` e `X-Real-IP` chegam com o IP da **borda**, e o IP real vem em `CF-Connecting-IP` (forjar esse é barrado com 403). Use `HELENA_WEB_TRUST_PROXY=cloudflare`. A API só confia nesse cabeçalho quando o último valor do `X-Forwarded-For` (o endereço que o proxy do Discloud viu) está nas faixas da Cloudflare (`config/cloudflare-ips.mjs`); pedido que chegasse ao app sem passar por ela vale pelo endereço de quem chegou, e não pelo que escreveu no cabeçalho |
| Fontes do cartão | o Poppins vai no projeto (`assets/fonts/`) e o cartão o usa; os emojis comuns de nome, bio e cônjuge são desenhados como imagem (Twemoji); **japonês e coreano** continuam virando quadradinhos (as fontes do sistema são só as do contêiner, DejaVu) |
| Backups | no plano Diamond há backup automático diário de cada app, guardado por uns 7 dias |

O projeto traz o `discloud.config` (site, `helena.mjs`, 512 MB, `START=node helena.mjs`, reinício automático) e o `.discloudignore` (a lista do que **não** vai: `.env`, banco local, testes, site, wiki...). O zip é montado por `npm run discloud:zip`, que lê essa lista, confere que nenhum segredo entrou e nunca leva banco sozinho.

### Subir pela primeira vez (com o banco)

1. **Subdomínio:** no painel, Domínios, "+ Criar subdomínio" (2 a 20 letras minúsculas, números e hífens). O padrão do projeto é `helena` (fica `helena.discloud.dev`); para outro nome, use `--id=nome` abaixo.
2. **Pare o bot do computador** (dois bots ligados respondem tudo em dobro) e exporte o banco: `npm run db:export -- helena-export.db`.
3. **Monte o zip:** `npm run discloud:zip -- --first --seed-db=helena-export.db`. Ele sai ao lado da pasta do projeto, em `helena-discloud.zip`.
4. **Criar o app:** Aplicações, "+ Upload", Upload ZIP, arraste o zip e "Criar aplicação". Com `--first` o app sobe **sem reinício automático**: como ainda não há token, o bot cai uma vez e fica parado, quieto.
5. **Variáveis:** na aba Variáveis do app, "Colar .env" com as de baixo e "Salvar" (os segredos você cola direto lá, nunca em arquivo).
6. **Segundo zip, o normal:** `npm run discloud:zip -- --force` (sem `--first` e **sem `--seed-db`**) e envie na aba **Commit** do app. O commit é um deploy: ativa as variáveis, liga o reinício automático e o bot sobe com o banco já migrado.
7. Confira o log do app: `[COMANDOS] 70 comandos carregados` e `Aguardando comandos`. Mantenha o bot do computador **desligado**.

**Nunca use `--seed-db` em atualizações:** ele sobrescreveria o banco que está no ar com o do dia da migração.

**Variáveis do painel do Discloud:** as do seu `.env` (`DISCORD_BOT_TOKEN`, `HELENA_OWNER_ID`, `HELENA_ADMIN_IDS`...) mais, para o painel do site: `HELENA_WEB_PORT=8080`, `HELENA_WEB_HOST=0.0.0.0`, `HELENA_WEB_TRUST_PROXY=cloudflare`, `HELENA_WEB_ORIGINS=https://helena.discloud.dev`, `HELENA_OAUTH_REDIRECTS=https://helena.discloud.dev/account/`, `HELENA_OAUTH_CLIENT_ID` e `HELENA_TURNSTILE_SECRET`. O `HELENA_DATABASE_PATH` fica sem definir (o padrão `data/helena.db` já cai em `/home/node/data`, no disco que sobrevive). Em `site/src/config.ts`, `apiUrl` recebe `https://<ID>.discloud.dev`.

**Atualizar o bot depois:** `npm run discloud:zip -- --force` e envie na aba Commit. Se mudar só uma variável, salve e faça **Rebuild** (a aba avisa).

**Conferir o IP real:** ligue `HELENA_WEB_DEBUG_IP=1` (e faça Rebuild), abra `https://<ID>.discloud.dev/api/me` e veja no log a linha `IP visto`: deve ser o seu IP, vindo do `CF-Connecting-IP`, e terminar em `veio-da-cloudflare=sim`. Se terminar em `nao`, o log traz também o aviso `CF-Connecting-IP ignorado: o pedido veio de <endereço>`: aquele endereço é o que o proxy do Discloud entregou. Se for uma faixa da Cloudflare que a lista não tem, acrescente-a em `HELENA_WEB_CLOUDFLARE_IPS` (e faça Rebuild); se não for da Cloudflare, o Discloud não está entregando o que esperamos e vale parar e me avisar (`HELENA_WEB_VERIFY_CLOUDFLARE=off` volta ao comportamento antigo). Desligue o `HELENA_WEB_DEBUG_IP` depois.

**App de teste sem o token do oficial (modo só-site):** para conferir o IP, o HTTPS e os cabeçalhos antes de mexer no app oficial, suba um segundo app com `HELENA_WEB_ONLY=on`. Ele sobe só a API e o site, **sem entrar no Discord**: não precisa de `DISCORD_BOT_TOKEN` (e nunca use o do oficial, os dois responderiam tudo em dobro), não registra comandos e não responde a ninguém. O login do painel e as coletas não funcionam nele (dependem do Discord), mas `/api/health`, os cabeçalhos, o redirecionamento para HTTPS e o log `IP visto` sim.

1. No painel, crie um subdomínio novo (por exemplo `helena-teste`) e o app com `npm run discloud:zip -- --first --id=helena-teste --force --out=<pasta>/teste.zip`. Sem `--seed-db`: o app de teste começa com banco vazio.
2. Nas Variáveis do app: `HELENA_WEB_ONLY=on`, `HELENA_WEB_PORT=8080`, `HELENA_WEB_HOST=0.0.0.0`, `HELENA_WEB_TRUST_PROXY=cloudflare`, `HELENA_WEB_ORIGINS=https://helena-teste.discloud.app`, `HELENA_OAUTH_REDIRECTS=https://helena-teste.discloud.app/account/`, `HELENA_OAUTH_CLIENT_ID` (o ID público do aplicativo) e `HELENA_WEB_DEBUG_IP=1`. Sem `HELENA_OAUTH_REDIRECTS` (ou sem o client ID) a API fica desligada e o log diz o que faltou.
3. Envie o zip normal (`npm run discloud:zip -- --id=helena-teste --force --out=<pasta>/teste.zip`, sem `--first`) na aba Commit: ativa as variáveis e liga o reinício automático. Se esqueceu uma variável, salve e faça **Rebuild**.
4. Use o endereço que **resolver** (confira com `nslookup`): num subdomínio novo, `helena-teste.discloud.app` respondeu e `helena-teste.discloud.dev` não existia no DNS. Abra `https://<endereço>/api/me` (dá 401, sem sessão) e confira no log `veio-da-cloudflare=sim`. Apague o app de teste quando terminar.

Conferido assim em 29/10/2026: `IP visto: <seu IP> | conexão=10.4.28.1 | x-forwarded-for="172.69.138.22" | veio-da-cloudflare=sim`, com HSTS e CSP por página nas respostas.

**Conferir o HTTPS:** depois de publicar, `curl -sI http://<ID>.discloud.dev/` deve responder `301` para `https://`, e `curl -sI https://<ID>.discloud.dev/` deve trazer `Strict-Transport-Security` e `Content-Security-Policy`. Se o site entrar em um redirecionamento sem fim, ponha `HELENA_WEB_FORCE_HTTPS=off` e faça Rebuild (e me avise, porque aí o `CF-Visitor` não está chegando como o esperado).

**Limites conhecidos:** o cartão de perfil só desenha o que o Poppins tem (letras latinas, números e a pontuação comum). Japonês, coreano, árabe, cirílico e símbolos decorativos **não aparecem**: `plain()` (`services/social/profile-card.mjs`) tira esses caracteres, em vez de deixar quadradinhos, e a lista do que vale sai da tabela `cmap` do próprio arquivo da fonte (`services/social/card-glyphs.mjs`). Letras em fonte estilizada (𝓑𝓲𝓸) e de largura total viram letras comuns, e emojis personalizados e menções do Discord (`<:nome:id>`, `<@id>`) somem. Para mostrar japonês seria preciso levar uma fonte CJK no projeto, em `assets/fonts/`. O `.discloud.app` que o painel mostra nos detalhes do app não funciona: vale só o `.discloud.dev`.

## O site no Discloud

O bot serve o site no mesmo endereço da API (`https://helena.discloud.dev/`): o servidor HTTP entrega a pasta `site-dist/` na raiz e responde a API em `/api`. Sem essa pasta (o bot de teste), só a API responde.

**Para publicar uma versão nova** (o site vai dentro do zip, montado):

1. `npm run site:build`: monta `site/dist` (o endereço vem de `config/site.mjs`).
2. `npm run discloud:zip -- --force --out=<pasta>/helena.zip`: leva o código e o site (`site-dist/`). Sem o site montado o comando recusa (use `--no-site` só para um zip sem ele).
3. Suba o zip na aba **Commit** do app.

**Uma vez só, ao mudar o endereço do site:**

- No Discord (Portal do Desenvolvedor → o aplicativo → OAuth2 → Redirects): cadastre `https://helena.discloud.dev/account/`, com a barra no fim.
- No Discloud (Variáveis): `HELENA_WEB_ORIGINS` com `https://helena.discloud.dev` e `HELENA_OAUTH_REDIRECTS` com `https://helena.discloud.dev/account/` (a API recusa chamadas de qualquer outro site, e o login só volta para endereços da lista).
- No Cloudflare (Turnstile → o widget da Helena): acrescente `helena.discloud.dev` nos **hostnames** permitidos. Sem isso o desafio anti-robô do painel falha.

**Domínio próprio** (por exemplo `helena.seudominio.com`): no painel do Discloud, aba **Domínios**, adicione o domínio e crie no seu DNS os registros **A** `75.2.96.173` e `99.83.186.151` (no Cloudflare, nuvem cinza, "só DNS"), depois faça um **Rebuild**. Aí troque `SITE_URL` em `config/site.mjs`, refaça os três cadastros acima com o endereço novo e monte o site de novo.

O GitHub Pages (`helenacry.github.io/helena-bot/`) fica só com um redirecionamento para o endereço do Discloud, para os links antigos continuarem funcionando.
