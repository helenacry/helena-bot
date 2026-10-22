# Hospedagem no Discloud

[← Voltar ao README](../README.md) · [Índice da documentação](README.md)

Onde o bot oficial roda hoje.

O bot e a API do painel rodam **juntos** num app `TYPE=site` do Discloud (plano Platinum ou superior; o Diamond serve). O que está abaixo foi **conferido num app de teste de verdade**, e não só lido na documentação:

| O quê | Resultado |
|---|---|
| Node | `VERSION=latest` entrega o Node 24 (v24.22.0 no teste), com o `node:sqlite` |
| Banco | arquivos gravados em `/home/node`, como `data/helena.db`, **sobrevivem aos commits**, mesmo com o contêiner recriado |
| Gateway | a conexão WebSocket com `wss://api.vsync.lat/gateway` abre (o `hello` chega em menos de 0,4 s) |
| Variáveis | as da aba Variáveis do painel viram variáveis de ambiente de verdade, mas só valem depois de um **rebuild ou deploy** |
| Endereço | `https://<ID>.discloud.dev`, com HTTPS válido (a documentação cita `.discloud.app`, que **não resolve**); o app escuta na **porta 8080, em 0.0.0.0** |
| IP do visitante | o Discloud fica atrás da Cloudflare: `X-Forwarded-For` e `X-Real-IP` chegam com o IP da **borda**, e o IP real vem em `CF-Connecting-IP` (forjar esse é barrado com 403). Use `HELENA_WEB_TRUST_PROXY=cloudflare` |
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

**Variáveis do painel do Discloud:** as do seu `.env` (`VSYNC_BOT_TOKEN`, `HELENA_OWNER_ID`, `HELENA_ADMIN_IDS`...) mais, para o painel do site: `HELENA_WEB_PORT=8080`, `HELENA_WEB_HOST=0.0.0.0`, `HELENA_WEB_TRUST_PROXY=cloudflare`, `HELENA_WEB_ORIGINS=https://helenacry.github.io`, `HELENA_OAUTH_REDIRECTS=https://helenacry.github.io/helena-bot/account/`, `HELENA_OAUTH_CLIENT_ID` e `HELENA_TURNSTILE_SECRET`. O `HELENA_DATABASE_PATH` fica sem definir (o padrão `data/helena.db` já cai em `/home/node/data`, no disco que sobrevive). Em `site/src/config.ts`, `apiUrl` recebe `https://<ID>.discloud.dev`.

**Atualizar o bot depois:** `npm run discloud:zip -- --force` e envie na aba Commit. Se mudar só uma variável, salve e faça **Rebuild** (a aba avisa).

**Conferir o IP real:** ligue `HELENA_WEB_DEBUG_IP=1` (e faça Rebuild), abra `https://<ID>.discloud.dev/api/health` e veja no log a linha `IP visto`: deve ser o seu IP, vindo do `CF-Connecting-IP`. Desligue depois.

**Limites conhecidos:** o cartão de perfil só desenha o que o Poppins tem (letras latinas, números e a pontuação comum). Japonês, coreano, árabe, cirílico e símbolos decorativos **não aparecem**: `plain()` (`services/social/profile-card.mjs`) tira esses caracteres, em vez de deixar quadradinhos, e a lista do que vale sai da tabela `cmap` do próprio arquivo da fonte (`services/social/card-glyphs.mjs`). Letras em fonte estilizada (𝓑𝓲𝓸) e de largura total viram letras comuns, e emojis personalizados e menções da VSync (`<:nome:id>`, `<@id>`) somem. Para mostrar japonês seria preciso levar uma fonte CJK no projeto, em `assets/fonts/`. O `.discloud.app` que o painel mostra nos detalhes do app não funciona: vale só o `.discloud.dev`.
