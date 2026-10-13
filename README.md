# Helena

Bot de economia e jogo para a [VSync](https://vsync.lat): salário, banco, loja, inventário, missões, conquistas, duelos, casamento e um sistema de crime com lavagem de dinheiro e prisão.

Os comandos funcionam de duas formas:

- **Comando de barra:** `/saldo`
- **Prefixo `h`:** `hsaldo`

## Requisitos

- **Node.js 24** (testado nessa versão). O banco usa o módulo `node:sqlite`, que já vem com o Node.
- Um aplicativo de bot criado no portal do desenvolvedor da VSync (Configurações → Desenvolvedores), com o token do bot.

## Instalação

```bash
npm install
cp .env.example .env      # no Windows: copy .env.example .env
```

Preencha o `.env` (veja [Variáveis de ambiente](#variáveis-de-ambiente)) e inicie:

```bash
npm start
```

## Ambientes e branches

| | Produção | Testes |
|---|---|---|
| Branch | `main` | `testes` |
| Arquivo de variáveis | `.env` | `.env.test` |
| Comando | `npm start` | `npm run start:test` |
| Bot | o oficial | **outro** aplicativo de bot na VSync |
| Banco | `data/helena.db` | `data/helena-test.db` |

Fluxo: desenvolva e teste na `testes`; quando estiver validado, traga para a `main`.

Para montar o ambiente de testes:

1. Crie um segundo aplicativo de bot no portal da VSync e adicione-o a um servidor seu de teste.
2. Copie `.env.test.example` para `.env.test` e preencha com o token do bot de testes e o seu ID.
3. **Deixe vazios** `HELENA_SUPPORT_GUILD_ID`, `HELENA_USERS_CHANNEL_ID` e `HELENA_CLUSTERS_CHANNEL_ID`. Se preenchidos, o bot de testes sobrescreve os contadores do servidor de suporte da produção.
4. `npm run start:test`.

> A VSync limita as conexões de gateway por bot (2). Ao reiniciar, encerre o processo anterior; se instâncias antigas ficarem rodando, a nova é recusada com `Muitas sessões`.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `VSYNC_BOT_TOKEN` | Token do bot. |
| `HELENA_OWNER_ID` | IDs dos proprietários (comandos `/dev*` e selo DEV). Aceita vários, separados por vírgula. |
| `HELENA_ADMIN_IDS` | IDs autorizados nos comandos `/admin*`. |
| `HELENA_DATABASE_PATH` | Caminho do banco SQLite. Padrão: `./data/helena.db`. |
| `HELENA_SUPPORT_GUILD_ID`, `HELENA_USERS_CHANNEL_ID`, `HELENA_CLUSTERS_CHANNEL_ID` | Contadores do servidor de suporte. Se algum estiver vazio, ficam desligados. |
| `HELENA_CLUSTER_TOTAL`, `HELENA_STATS_INTERVAL` | Total de clusters e intervalo de atualização (ms) dos contadores. |
| `HELENA_LIVE_INTERVAL_MS` | Intervalo das contagens ao vivo, como o tempo da prisão. Padrão 10000, mínimo 2000. |
| `BADGE_OUTPUT_DIR`, `BADGE_PUBLIC_BASE_URL` | Imagem de insígnias do `/userinfo` (opcional). |

## Estrutura

```
helena.mjs          Conexão com o gateway e despacho de comandos
registrar.mjs       Carrega os comandos e registra na VSync
commands/           Um arquivo por comando, agrupados por categoria
  admin/ crime/ dev/ economy/ progress/ social/ utility/
services/           Regras do jogo (energia, crime, prisão, lavagem, combate...)
database/           Conexão SQLite e migrações (rodam sozinhas ao iniciar)
config/             Valores ajustáveis (empregos, itens, crime, cooldowns...)
utils/              Embeds, tempo, IDs e utilitários
tests/              Testes automáticos (npm test)
generated/          Dados gerados em execução (ex.: contador de visualizações do /userinfo)
assets/             Imagens: insígnias, selos Pulse e base do cartão de perfil
```

## Criando um comando

Crie um `.mjs` em `commands/<categoria>/` exportando um objeto com `name`, `description` e `execute`. O `registrar.mjs` carrega todas as subpastas e recusa nomes duplicados ao iniciar.

```js
import { embedResponse, createEmbed } from "../../utils/embed.mjs";

export default {
    name: "exemplo",
    aliases: ["ex"],                 // opcional
    description: "Um comando de exemplo",
    options: [                       // opcional
        { name: "texto", description: "Algo para repetir", type: "string", required: false }
    ],

    async execute(interaction) {
        const texto = interaction.data?.options?.texto ?? "olá";

        return embedResponse(createEmbed({ title: "Exemplo", description: texto }));
    }
};
```

### Aliases

`aliases: ["ex"]` faz o comando responder também a `hex` e `/ex`. Cada alias é registrado na VSync como um comando próprio, com a mesma descrição e opções.

- Nome de 1 a 32 caracteres: minúsculas sem acento, números, `-` ou `_`.
- Não pode repetir o nome de um comando nem de outro alias. O bot recusa iniciar se repetir.
- A VSync aceita no máximo **100 comandos globais** (comandos mais aliases). O bot recusa registrar se passar disso.

## Sistema de crime

| Comando | O que faz |
|---|---|
| `/crime` | Arrisca um crime: 50% de chance, rende dinheiro sujo e XP. Falhar custa multa, prisão e, às vezes, vida. |
| `/roubar` | Rouba a carteira de outro jogador (nome, @menção ou ID). Precisa de arma equipada; a chance depende da arma. Leva de 10% a 25% da carteira, com teto: metade vem limpa e metade como dinheiro sujo. Alvo armado pode revidar. |
| `/lavagem` | Converte dinheiro sujo em limpo. Lavanderia **pública** (35% a 55%, uma por vez no servidor) ou **privada** (75% a 85%, exige gemas uma vez). |
| `/lavageminfo` | Tempo restante da lavagem em andamento. |
| `/procurados` | Quem tem ficha criminal no servidor, 8 por página. |
| `/prisao` | Pena restante e ficha criminal. Preso, mostra o botão **Tentar fuga**. |

- Dinheiro sujo não compra, deposita nem transfere: só serve depois de lavado.
- Cada crime, roubo e lavagem iniciada entra na **ficha criminal**, que não expira. Quem tem ficha aparece em `/procurados`. As recompensas pelos procurados dependem da carreira de policial, que ainda não existe.
- Preso, o jogador não trabalha, não compra e não movimenta dinheiro. A lista de comandos bloqueados está em `config/crime.mjs`.
- O tempo da prisão é atualizado ao vivo na própria mensagem (a cada 10 s por padrão).
- **Fuga da prisão:** o botão abre um minigame de 3 etapas numa mensagem só sua. Em cada etapa o guarda vigia (clicar é ser pego), às vezes finge virar as costas (clicar também é ser pego) e então abre o corredor: aperte a saída indicada, dentre 8, a tempo. Vencer corta 15% da pena e ser pego soma 10%, sempre limitado a ±50% da pena original. Há 10 minutos de recarga entre tentativas.
- Valores, histórias, custos, chances por arma e tempos da fuga ficam todos em `config/crime.mjs`.

## Perfil e quantias

O cartão do `/perfil` é uma imagem 1600×1200 (`services/profile-card.mjs`, SVG convertido pelo `sharp`, sem gravar nada em disco): lateral com o **RANK**, chip do estado civil com o cônjuge, anel do nível, foto em pentágono, nome e título, bio e cinco cartões (banco, gemas, carteira, arma e emprego). O RANK é a posição no ranking de patrimônio do `/ranking` (`services/player-rank.mjs`). A fonte é a primeira instalada da lista Poppins, Nunito, Segoe UI, DejaVu Sans; sem nenhuma, o sistema usa uma fonte com serifa.

- `/perfil` mostra o seu cartão. `/perfil usuario:<@usuário>` (ou `hperfil maria`, `hperfil @maria`, `hperfil <@menção>`) mostra o de outra pessoa do servidor. A busca é só pelo **@usuário** (o nome de usuário, que é único, sem diferenciar maiúsculas) ou por menção: apelidos e nomes de exibição das plataformas não entram. A mensagem menciona a pessoa e, se não achar ninguém, avisa que não encontrou. O cartão é enviado direto para a VSync, sem gravar nada em disco.
- `/userinfo` (alias `ui`) funciona igual: `/userinfo usuario:<@usuário>` (ou `hui maria`, `hui @maria`, `hui <@menção>`) mostra as insígnias, datas, Prisma+ e Pulse de outra pessoa do servidor. Também só pelo **@usuário exato** ou menção, a mensagem menciona a pessoa e, se não achar ninguém, avisa. Os dados vêm da própria lista de membros da VSync, sem chamada extra. Sem argumento mostra os seus. Bots também têm informações. O contador de visualizações segue em `generated/userinfo/views.json`.
- Nos comandos de dinheiro (`/depositar`, `/sacar`, `/transferir`, `/lavagem`), `tudo` ou `all` usa o saldo inteiro: `hdep all`, `hsacar tudo`.

## Painéis e modais

Alguns comandos mostram botões que abrem formulários (modais) da VSync, no estilo dos painéis da Alfacusa:

| Comando | Botões | Formulário |
|---|---|---|
| `/saldo` | Depositar, Sacar, Transferir | quantia (`tudo`/`all` vale); a transferência também pede o destinatário por nome, @menção ou ID |
| `/lavagem` | Lavar (pública), Lavar (privada) ou Liberar privada | valor sujo; liberar pede para digitar `LIBERAR`, porque custa gemas |
| `/bio` (sem texto) | Editar bio | campo de parágrafo já preenchido com a bio atual |
| `/loja` (alias `store`) | vitrine inicial com as prateleiras e o menu; em cada prateleira, 5 cartões numerados por página (Anterior/Próxima), um botão por item, **Início**, **Por nome**, **Vender** e **Fechar** | quantidade do item (número ou `max`, o máximo que dá); por nome pede item e quantidade; vender aceita `metade` e `tudo` |
| `/inventario` | menu de prateleiras, 12 itens por página (Anterior/Próxima/Atualizar), **Descartar** | item e quantidade (número, `metade` ou `tudo`); depois uma tela de confirmação com botão. 🟢 marca a arma equipada |
| `/descartar` (alias `dropitem`) | **Confirmar descarte** | mesma confirmação do inventário; destrói o item, sem reembolso |
| `/usaritem` (aliases `useitem`, `usar`) | menu com o que dá para usar, **Usar vários**, **Atualizar** | item (por nome, sem acento) e quantidade (número ou `max`, que usa até a energia encher) |

- **Visual da loja:** a vitrine (`/loja`) mostra carteira, gemas e uma grade de prateleiras com a contagem e o menor preço de cada uma; a opção `categoria` (ex.: Armas; no prefixo, `hloja categoria:weapon`) pula direto para uma prateleira. Cada cartão traz preço de compra e venda, descrição, dano (armas), quanto você já tem, e se dá para comprar: ✅ até quantas unidades, 🔒 quanto falta, ou 📦 limite do item atingido. O botão do item fica verde quando cabe na carteira. Emojis das prateleiras: `ITEM_CATEGORY_EMOJIS` em `config/items.mjs`; layout em `services/shop-view.mjs`.
- **Itens com efeito:** Maçã (+10), Café (+25) e Energético (+50) repõem energia, uma unidade por uso. Com a energia cheia o uso é recusado e o item não é gasto; o que passa de 100 se perde. Armas são equipadas (não gastam a unidade). Os valores ficam no campo `use` de cada item em `config/items.mjs`. Preso não usa itens.

- Comandos pelo prefixo (`hbio`) não têm interação e não abrem modal sozinhos: o botão da mensagem faz isso.
- Os botões pessoais só funcionam para quem abriu o painel. O botão da loja serve a todos, e cada um compra para si.
- O envio do formulário roda o comando de sempre com as opções preenchidas, então limites, recargas e a prisão continuam valendo (preso não deposita, nem por modal).
- Para criar um painel: `services/modals.mjs` (`textField`, `openModal`, `readFields`) e `services/panels.mjs` (botões, clique e envio).

## Painel do site (API)

O painel permite coletar o **daily** e um **bônus de gemas** pelo navegador, entrando com a conta da VSync ("Entrar com vsync", OAuth2 com PKCE). Tudo vem **desligado**: sem `HELENA_WEB_PORT` o bot funciona como sempre e a API nem sobe.

**Fluxo.** O site leva a pessoa à VSync; na volta, entrega o código e o `code_verifier` à API (`services/web-api.mjs`), porque o navegador não consegue falar direto com o endpoint de troca da VSync (ele não libera CORS para outros sites). A API troca o código, lê quem é a pessoa e os servidores dela, **devolve o acesso da VSync na hora** e cria uma sessão própria de 6 horas, no máximo 5 por pessoa. No banco fica só o hash do token. O painel lista só os servidores em que a pessoa e a Helena estão.

**Regras.** O daily usa o mesmo serviço do comando (`services/daily.mjs`): mesma recarga de 24 h, sequência, bônus do 7º dia, limite da carteira e a prisão também bloqueia. O bônus de gemas (`config/gems.mjs`) rende de 1 a 3 gemas a cada 5 horas e vale para a conta em todos os servidores (`services/gem-bonus.mjs`). O comando `/daily` continua funcionando.

| Rota | O que faz |
|---|---|
| `GET /api/health` | confere se a API está de pé |
| `POST /api/auth/login` | troca o código do login pela sessão |
| `POST /api/auth/logout` | encerra a sessão |
| `GET /api/me` | servidores, dinheiro, daily e gemas (só leitura) |
| `POST /api/claim/daily` | coleta o daily de um servidor |
| `POST /api/claim/gems` | coleta o bônus de gemas |

**Para ligar** (variáveis em `.env.example`):

1. No Portal do Desenvolvedor da VSync, cadastre o endereço de retorno do login, igual ao do site e com a barra final (por exemplo `https://helenacry.github.io/helena-bot/conta/`). Para testar no computador, `http://127.0.0.1:PORTA/conta/` também vale.
2. Preencha `HELENA_WEB_PORT`, `HELENA_WEB_ORIGINS`, `HELENA_OAUTH_REDIRECTS` e `HELENA_OAUTH_CLIENT_ID`. A API escuta só em `127.0.0.1`.
3. Publique essa porta na internet com HTTPS (Tailscale Funnel, Cloudflare Tunnel, ngrok ou um servidor) e, com a API atrás de um túnel, ponha `HELENA_WEB_TRUST_PROXY=1`. Se o bot ficar desligado, o painel mostra "fora do ar".
4. Crie uma chave gratuita do [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile): a chave **secreta** vai em `HELENA_TURNSTILE_SECRET` e a chave **do site** em `site/js/config.js`.
5. Preencha `apiUrl`, `clientId` e `turnstileSiteKey` em `site/js/config.js`. Com `apiUrl` vazio, o painel fica escondido no site.

**Segurança.** CORS só para as origens listadas (nunca `*`) e sem cookies; limites de tentativas por IP e por pessoa; corpo máximo de 8 KB; o endereço de retorno do login precisa ser um dos cadastrados; cada entrada, coleta e recusa fica em `web_claim_log` com data, IP e navegador (o site avisa isso). Automação para coletar não é permitida.

## Site

A pasta `site/` tem a página de divulgação da Helena. É HTML, CSS e JS puros, sem build e sem servidor: dá para abrir `site/index.html` direto no navegador ou publicar a pasta em qualquer hospedagem estática (GitHub Pages, Netlify, Cloudflare Pages...).

```
site/
  index.html          só marcação
  conta/index.html    painel da conta (daily e gemas), escondido até haver API
  css/                tokens, base, components, sections, motion, conta
  js/                 config, util, nav, render, commands, copy, petals, motion, account
  data/site-data.js   gerado por `npm run site:data` (não edite à mão)
  assets/img/         imagens derivadas da arte em assets/ (veja abaixo)
  data-source.mjs     lê o bot e devolve os dados do site
  build-data.mjs      grava data/site-data.js
  build-card.mjs      gera o cartão de exemplo do herói (`npm run site:card`)
```

Os scripts são clássicos (não módulos) e dividem o objeto `window.Helena`, para a página abrir direto do disco.

- **No ar:** https://helenacry.github.io/helena-bot/. O workflow `.github/workflows/pages.yml` publica a pasta `site/` no GitHub Pages a cada mudança nela na `main` (e dá para rodar à mão na aba Actions). Os scripts `.mjs` de `site/` não vão para o ar.
- **Links:** o convite do bot e o servidor oficial ficam em `site/js/config.js`. `codeUrl` (link do repositório) está vazio e o item some do rodapé enquanto não for preenchido.
- **Números e comandos:** rode `npm run site:data` depois de criar, renomear ou remover comandos, empregos, itens ou conquistas. O script lê o bot de verdade (com um banco temporário, sem tocar em `data/`). Comandos de `admin/` e `dev/` não aparecem. O `npm test` falha se `site/data/site-data.js` ficar para trás.
- **O que não é automático:** os valores escritos nos textos (prêmio do `/daily`, custos e chances do crime, retornos da lavagem, tempos da prisão, e os textos das simulações de conversa) vêm de `config/` e dos comandos, mas foram copiados à mão. Se mudar esses valores no bot, atualize a página.
- **Animações:** tudo nasce no estado final e visível; o JS só adiciona a classe `in` pouco antes de o elemento entrar na tela (veja `css/motion.css` e `js/motion.js`). Sem JS ou com `prefers-reduced-motion`, nada se mexe e a página está completa. A única exceção é o `ヘレナ` da margem do herói (só aparece em telas de 1280 px ou mais), que continua se escrevendo traço a traço, porque é curto, não desloca nada na tela e é a marca da página; ele também se escreve de novo quando o mouse passa por cima.
- **Cores:** todas ficam em `site/css/tokens.css` e saem da foto de perfil (`assets/helena_pfp.png`): ameixa quase preta nas superfícies, orquídea e magenta nos destaques, rosa-pêssego nos detalhes. Os contrastes de texto foram conferidos (WCAG AA). O `npm test` falha se aparecer cor solta fora dos tokens.
- **Imagens:** `assets/helena_pfp.png` gera o avatar da navbar e do site, o favicon e o ícone do celular; `assets/helena-profile.png` gera só a faixa do templo do rodapé (com o matiz levemente girado para combinar com a paleta). O cartão de exemplo do herói NÃO é uma imagem desenhada à mão: `npm run site:card` o gera com o mesmo gerador do `/perfil` (`services/profile-card.mjs`), com uma jogadora fictícia e a foto da Helena, então o site nunca fica diferente do cartão real. Rode de novo quando o desenho do cartão mudar. Os originais não são alterados; as versões do site ficam em `site/assets/img/`.
- **Skill de front:** `.claude/skills/front-sem-cara-de-ia/SKILL.md` reúne o que evitar para a página não parecer feita por IA, receitas para fazer diferente e um checklist. O Claude Code a usa ao mexer no site; também dá para chamar com `/front-sem-cara-de-ia`. A pasta `.claude/` está no `.gitignore`, então a skill fica só na sua máquina.

## Testes

```bash
npm test
```

Usa o executor nativo do Node (`node --test`). Cada arquivo de `tests/` roda num processo próprio, com um banco SQLite temporário, sem tocar em `data/` e sem chamar a VSync (a API é simulada).

## Banco de dados

SQLite, criado e migrado automaticamente ao iniciar. Os arquivos `*.db` não vão para o git. `/devbackup` gera uma cópia em `data/backups/`.
