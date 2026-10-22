# Hospedagem no Railway (alternativa)

[← Voltar ao README](../README.md) · [Índice da documentação](README.md)

Como rodar o bot no Railway em vez do Discloud.

O bot pode rodar no Railway em vez do computador de quem o mantém. A imagem vem do `Dockerfile` (Node 24, as fontes do cartão de perfil e o comando `node helena.mjs`, sem `.env`). O que muda de ambiente para ambiente vem das **variáveis do serviço**; o banco fica no **volume** (`/data`) e sobrevive aos deploys. Valores de preço (Hobby: US$ 5 por mês, com US$ 5 de uso incluso; pagamento por cartão pós-pago) são da página de planos do Railway em outubro de 2026: confira antes de assinar.

**O que a nuvem precisa:** processo sempre ligado (hospedagem que "dorme" não serve), volume para o SQLite e um endereço HTTPS para a API do painel. Redeploy de um serviço com volume tem uma pequena parada (o bot reconecta em segundos).

### Montar o serviço (uma vez)

1. **Projeto:** New Project, Deploy from GitHub repo, `helenacry/helena-bot`, branch `main`. Quem é dono da organização precisa autorizar o app do Railway no GitHub. Com um `Dockerfile` no repositório, o Railway o usa sozinho.
2. **Volume:** no serviço, adicione um volume com ponto de montagem `/data`.
3. **Variáveis:** copie as do seu `.env` (o "Raw Editor" aceita colar tudo; os segredos você coloca direto lá) e acrescente as da API: `HELENA_WEB_PORT=8080`, `HELENA_WEB_ORIGINS=https://helenacry.github.io`, `HELENA_OAUTH_REDIRECTS=https://helenacry.github.io/helena-bot/account/`, `HELENA_OAUTH_CLIENT_ID`, `HELENA_WEB_TRUST_PROXY=1` e, para o painel, `HELENA_TURNSTILE_SECRET`. A imagem já define `HELENA_DATABASE_PATH`, `HELENA_GENERATED_DIR` e `HELENA_WEB_HOST` para o volume.
4. **Endereço:** Settings, Networking, **Generate Domain**, com a porta `8080` (a mesma de `HELENA_WEB_PORT`).
5. **Site:** em `site/src/config.ts`, `apiUrl` recebe esse endereço (sem barra no fim) e `turnstileSiteKey` a chave pública do Turnstile; publique o site.

### Levar o banco sem duplicar o bot

Só um bot pode ficar ligado por vez: dois respondem cada comando em dobro e a VSync limita as conexões por bot. Por isso a ordem importa:

1. No Railway, em Settings, Deploy, ponha **Custom Start Command** = `sleep infinity` e faça o deploy: o contêiner sobe com o volume, mas sem ligar o bot.
2. No computador, **pare o bot** e exporte: `npm run db:export -- helena-export.db` (mostra quantos jogadores foram). O que acontecer depois da cópia não vai junto. O contador do `/userinfo` também mora no banco: se o bot ainda rodava com a versão antiga (que guardava num JSON), ligue-o uma vez com a nova antes, para ele importar o JSON antigo, e só então pare e exporte.
3. Envie para o volume com a CLI do Railway (`railway login`, `railway link`; o `railway ssh` registra a chave SSH na primeira vez): `scp helena-export.db <domínio-do-serviço>@ssh.railway.com:/data/helena.db`.
4. Confira os números lá dentro: `railway ssh -- node scripts/export-db.mjs /tmp/conferencia.db`.
5. Apague o Custom Start Command e faça o deploy: o bot sobe com o banco migrado. Mantenha o do computador **desligado**. Se algo der errado, o banco do computador não foi tocado e dá para ligá-lo de novo (perdendo o que aconteceu na nuvem).

### Conferir o IP real (limites da API)

Os limites de tentativas da API são por IP, e dependem de o proxy da hospedagem entregar o IP real do visitante. Com `HELENA_WEB_TRUST_PROXY=1` a API usa o **último** valor de `X-Forwarded-For` (o que o proxy mais próximo viu): o primeiro o visitante consegue forjar, e o `CF-Connecting-IP` só vale atrás da Cloudflare, então nenhum dos dois conta. Para conferir de verdade, ligue `HELENA_WEB_DEBUG_IP=1`, abra `https://<domínio>/api/health` e olhe o log: a linha `IP visto` deve mostrar o seu IP público. Repita mandando um `X-Forwarded-For` falso na frente: o IP visto continua o real. Se o IP visto for um endereço interno igual para todo mundo, a API trata todos como uma pessoa só: não ligue o painel antes de resolver. Desligue a variável depois.

### Backups

O volume do Railway tem backups manuais e automáticos (veja as configurações do volume). Além deles, `railway ssh -- node scripts/export-db.mjs /data/backups/AAAA-MM-DD.db` gera um arquivo só, e o `/devbackup` grava em `backups/` ao lado do banco (no volume).
