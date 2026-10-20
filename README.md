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
| `HELENA_MARKET` | `off` (ou `0`, `false`, `no`) desliga a bolsa e deixa todos os preços na tabela. Padrão: ligada. |
| `HELENA_ANTI_SPAM` | `off` (ou `0`, `false`, `no`) desliga o intervalo de 3 segundos entre comandos. Padrão: ligado. |
| `HELENA_DATABASE_PATH` | Caminho do banco SQLite. Padrão: `./data/helena.db`. |
| `HELENA_SUPPORT_GUILD_ID`, `HELENA_USERS_CHANNEL_ID`, `HELENA_CLUSTERS_CHANNEL_ID` | Contadores do servidor de suporte. Se algum estiver vazio, ficam desligados. |
| `HELENA_CLUSTER_TOTAL`, `HELENA_STATS_INTERVAL` | Total de clusters e intervalo de atualização (ms) dos contadores. |
| `HELENA_V2` | Layout V2 da VSync no lugar dos embeds: `off` (padrão), `owner` (só nas respostas do dono, para testar em produção) ou `on` (todos). Veja "Componentes V2". |
| `HELENA_LIVE_INTERVAL_MS` | Intervalo das contagens ao vivo, como o tempo da prisão. Padrão 10000, mínimo 2000. |
| `BADGE_OUTPUT_DIR`, `BADGE_PUBLIC_BASE_URL` | Imagem de insígnias do `/userinfo` (opcional). |

## Estrutura

```
helena.mjs               Conexão com o gateway e despacho de comandos
command-registry.mjs     Carrega os comandos e registra na VSync
commands/                Um arquivo por comando, agrupados por categoria
  admin/ crime/ dev/ economy/ progress/ social/ utility/
services/                Regras do jogo e do bot, uma pasta por assunto
  economy/               daily, gemas, loja, bolsa, inventário, energia, missões, ranking
  progress/              experiência e conquistas
  crime/                 crime, roubo, prisão, fuga, procurados, lavagem
  combat/                duelos, arsenal, equipamento e hospital
  social/                casamento, família (Gozofone e filhos), cartão de perfil (e as fontes dele), /userinfo
  panels/                painéis com botões e modais (loja, inventário, ajuda, bolsa, uso)
  platform/              o que serve a todos: intervalo entre comandos, prefixo h, V2,
                         dono e bloqueios, busca de usuário, anexos, contadores do suporte
  web/                   a API do painel do site
database/                Conexão SQLite e migrações (rodam sozinhas ao iniciar)
config/                  Valores ajustáveis (empregos, itens, crime, cooldowns...)
utils/                   Embeds, V2, tempo, IDs e utilitários
scripts/                 Ferramentas de linha de comando (npm run db:export, discloud:zip)
  site/                  Geradores do site: dados, cartão de exemplo e wiki (npm run site:data,
                         site:card, wiki:build). Ficam fora de site/, que só tem o que vai ao ar
site/                    O site, a wiki gerada e o painel da conta (publicado no GitHub Pages)
wiki/                    Texto da wiki em Markdown (vira site/wiki com npm run wiki:build)
Dockerfile               Imagem para a nuvem (veja "Hospedagem na nuvem")
tests/                   Testes automáticos (npm test)
assets/                  Imagens e as fontes Poppins: insígnias, selos Pulse, base do cartão
```

## Criando um comando

Crie um `.mjs` em `commands/<categoria>/` exportando um objeto com `name`, `description` e `execute`. O `command-registry.mjs` carrega todas as subpastas e recusa nomes duplicados ao iniciar.

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

### Onde o comando aparece

Comando novo entra sozinho na central de ajuda (`/ajuda`), na lista do site e na wiki, sem lista escrita à mão. A categoria vem da **pasta** (`commands/economy` é Economia, `commands/social` é Social...), e as exceções, como o combate que mora em `crime/`, estão em `config/command-categories.mjs`. Comandos de `admin/`, `dev/` e o de teste não aparecem para os jogadores. A wiki exige um texto sobre o comando novo (veja a seção Wiki).

Escreva uma `description` clara (até 100 caracteres, é o que a VSync mostra na lista de comandos) e uma `description` em cada opção: a ajuda usa os dois para montar o "como usar".

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

O cartão do `/perfil` é uma imagem 1600×1200 (`services/social/profile-card.mjs`, SVG convertido pelo `sharp`, sem gravar nada em disco): lateral com o **RANK**, chip do estado civil com o cônjuge, anel do nível, foto em pentágono, nome e título, bio e cinco cartões (banco, gemas, carteira, arma e emprego). O RANK é a posição no ranking de patrimônio do `/ranking` (`services/economy/player-rank.mjs`). A fonte é o **Poppins**, que vai no próprio projeto (`assets/fonts/`, licença OFL; o `services/social/card-fonts.mjs` aponta o fontconfig para essa pasta), então o cartão sai igual no PC e na nuvem. Se ele falhar, valem Nunito, Segoe UI e DejaVu Sans, e o log de início avisa (`[CARTÃO] Fonte Poppins carregada.` ou o aviso de que não foi achada). Emojis, bandeiras, tons de pele e caracteres invisíveis são **tirados** de nome, bio, cônjuge, emprego e arma: o desenho não tem como mostrar emoji colorido, e deixá-los viraria quadradinhos. A exceção é o emoji do **título equipado** ("💰 Rico"): os 10 emojis dos títulos das conquistas são desenhados em vetor (`EMOJI_ART`, grade de 32 x 32), ao lado do texto. **Desenho atual (18/10/2026):** textos menores e mais leves (nome 48, valores 30, rótulos 17 sem espaçamento), anel do nível mais fino (traço de 12, o trecho do 0% fica à esquerda do topo e o progresso cresce no sentido anti-horário), moldura com vão escuro e linha clara interna, pentágono um pouco mais largo que alto e fundo com degradê que clareia para a esquerda, embaixo. As medidas, as cores e os degradês foram tirados da imagem de referência e travados em `tests/profile-card.test.mjs` (cada texto fica a até 1 px de onde está no desenho). A imagem de exemplo do site sai do mesmo gerador: `npm run site:card` (`scripts/site/build-card.mjs`).

- `/perfil` mostra o seu cartão. `/perfil usuario:<@usuário>` (ou `hperfil maria`, `hperfil @maria`, `hperfil <@menção>`) mostra o de outra pessoa do servidor. A busca é só pelo **@usuário** (o nome de usuário, que é único, sem diferenciar maiúsculas) ou por menção: apelidos e nomes de exibição das plataformas não entram. A mensagem menciona a pessoa e, se não achar ninguém, avisa que não encontrou. O cartão é enviado direto para a VSync, sem gravar nada em disco.
- `/userinfo` (alias `ui`) funciona igual: `/userinfo usuario:<@usuário>` (ou `hui maria`, `hui @maria`, `hui <@menção>`) mostra as insígnias, datas, Prisma+ e Pulse de outra pessoa do servidor. Também só pelo **@usuário exato** ou menção, a mensagem menciona a pessoa e, se não achar ninguém, avisa. Os dados vêm da própria lista de membros da VSync, sem chamada extra. Sem argumento mostra os seus. Bots também têm informações. O cartão segue o estilo do Zany: autor `usuário (nome)`, Tag e ID em caixas de código, a idade em negrito ao lado de cada data, e o rodapé com o avatar de quem usou. Dois menus embaixo (só para quem usou o comando): **Mais informações.** (insígnias, datas, avatar, banner, evolução do Pulse, cargos e status, sempre em mensagem privada). **Avatar:** o app da VSync mostra a imagem grande de um embed num quadro de 300 px de altura com recorte (`object-fit: cover`), o que deixava o avatar quadrado cortado e achatado; por isso o embed usa `/img/avatar.webp?u=<avatar>`, uma rota pública da API do bot (`services/web/avatar-preview.mjs`) que devolve o avatar inteiro, quadrado e de cantos arredondados, colado à esquerda de uma tela 1000x600 transparente (o embed mostra o avatar limpo, com uns 290 px de lado, que é o máximo que o quadro dele permite). Só aceita avatar de `cdn.vsync.lat`, guarda 150 imagens na memória e usa `HELENA_API_URL` (padrão `https://helena.discloud.dev`) para montar o endereço e **Ver informações de outros membros no servidor.** (quem já joga ali, mais **Procurar por @usuário...**, que abre um formulário). A hora do comando vai no `timestamp` do embed. Telas em `services/social/userinfo-view.mjs`, menus em `services/social/userinfo-components.mjs` e cliques em `services/panels/userinfo-panel.mjs`. O contador de visualizações segue em `generated/userinfo/views.json`.
- Nos comandos de dinheiro (`/depositar`, `/sacar`, `/transferir`, `/lavagem`), `tudo` ou `all` usa o saldo inteiro: `hdep all`, `hsacar tudo`.

## Painéis e modais

Alguns comandos mostram botões que abrem formulários (modais) da VSync, no estilo dos painéis da Alfacusa:

| Comando | Botões | Formulário |
|---|---|---|
| `/saldo` | Depositar, Sacar, Transferir | quantia (`tudo`/`all` vale); a transferência também pede o destinatário por nome, @menção ou ID |
| `/lavagem` | Lavar (pública), Lavar (privada) ou Liberar privada | valor sujo; liberar pede para digitar `LIBERAR`, porque custa gemas |
| `/bio` (sem texto) | Editar bio | campo de parágrafo já preenchido com a bio atual |
| `/loja` (alias `store`) | vitrine com uma seção por prateleira (botão **Entrar** ao lado de cada uma); dentro da prateleira, 5 itens por página (Anterior/Próxima), um botão **Comprar** por item, **Início**, **Por nome**, **Vender** e **Fechar** | quantidade do item (número ou `max`, o máximo que dá); por nome pede item e quantidade; vender aceita `metade` e `tudo` |
| `/bolsa` (alias `mercado`) | **Abrir a loja**, **Atualizar**, **Fechar** | sem formulário: só mostra o mercado (índice, item em alta, preços de agora) |
| `/ajuda` (aliases `help`, `comandos`) | no V2, uma seção por categoria com **Abrir** e, dentro dela, um **Ver** ao lado de cada comando; no clássico, menus de categorias e de comandos. Nos dois: **Anterior**/**Próxima**, **Buscar**, **Início**, **Fechar** | busca: uma palavra (nome, atalho ou o que o comando faz, sem acento). Também `/ajuda categoria:combate` e `/ajuda comando:daily` |
| `/inventario` | menu de prateleiras, 12 itens por página (Anterior/Próxima/Atualizar), **Descartar** | item e quantidade (número, `metade` ou `tudo`); depois uma tela de confirmação com botão. 🟢 marca a arma equipada. No V2, um bloco por prateleira |
| `/descartar` (alias `dropitem`) | **Confirmar descarte** | mesma confirmação do inventário; destrói o item, sem reembolso |
| `/usaritem` (alias `usar`) | no V2, um botão **Usar** (ou **Equipar**) ao lado de cada item; no clássico, um menu. Nos dois: **Usar vários**, **Atualizar** | item (por nome, sem acento) e quantidade (número ou `max`, que usa até a energia encher) |
| `/missoes` (alias `missao`) | **Resgatar** em cada missão pronta | sem formulário; o resgate paga na hora e atualiza a lista. Também `/missoes resgatar:<missão>` |
| `/ranking` (alias `top`) | **Patrimônio**, **Nível**, **Gemas** | sem formulário: troca a classificação na mesma mensagem (só para quem abriu) |
| `/cooldowns` (alias `cd`) | **Atualizar** | sem formulário: lista Legal (trabalho, daily, gemas) e Ilegal (crime, roubo, lavagem, cadeia) com ✅ ou ⏳ |
| `/gozofone` (alias `gf`) | **Atender** e **Recusar** (só o cônjuge), **Cancelar** (só quem ligou); se nasce um bebê, **Registrar filho** | nome do bebê (um por gêmeo): de 2 a 32 letras |
| `/familia` | **Registrar filho**, quando há bebê esperando nome | o mesmo formulário do Gozofone |

- **Visual da loja:** a vitrine (`/loja`) mostra carteira e gemas e uma seção por prateleira, com a contagem de itens e o menor preço; a opção `categoria` (ex.: Armas; no prefixo, `hloja categoria:weapon`) pula direto para uma prateleira. Cada item mostra preço de compra e venda, descrição, dano (armas), quanto você já tem, e se dá para comprar: ✅ até quantas unidades, 🔒 quanto falta, ou 📦 limite do item atingido. O botão do item fica verde quando cabe na carteira. Emojis das prateleiras: `ITEM_CATEGORY_EMOJIS` em `config/items.mjs`; telas em `services/panels/shop-view.mjs`.
- **Itens com efeito:** Maçã (+10), Café (+25) e Energético (+50) repõem energia, uma unidade por uso. Com a energia cheia o uso é recusado e o item não é gasto; o que passa de 100 se perde. Armas são equipadas (não gastam a unidade). Os valores ficam no campo `use` de cada item em `config/items.mjs`. Preso não usa itens.

- Comandos pelo prefixo (`hbio`) não têm interação e não abrem modal sozinhos: o botão da mensagem faz isso.
- Os botões pessoais só funcionam para quem abriu o painel. O botão da loja serve a todos, e cada um compra para si.
- O envio do formulário roda o comando de sempre com as opções preenchidas, então limites, recargas e a prisão continuam valendo (preso não deposita, nem por modal).
- Para criar um painel: `services/panels/modals.mjs` (`textField`, `openModal`, `readFields`) e `services/panels/panels.mjs` (botões, clique e envio).

## Componentes V2

A VSync aceita blocos de layout nas mensagens de bots (`text`, `separator`, `section` com miniatura, `container` com barra de cor), misturados com as linhas de botões e menus. Com `HELENA_V2` ligada, o embed de cada resposta sai como um container (`utils/components-v2.mjs`): título e descrição viram texto, os campos viram "**nome** + valor", a cor do embed vira a barra do container, os botões e menus ficam dentro dele e o rodapé sai em letra pequena. Com miniatura (`/userinfo`), os primeiros textos viram uma seção com a miniatura ao lado.

- **Layout próprio por tela.** Quando botão ao lado do texto ajuda, a tela monta o próprio desenho (campo `layout` da resposta, com o kit de `utils/components-v2.mjs`), em vez de converter o embed: `/cooldowns`, `/loja`, `/saldo`, `/ajuda`, `/missoes`, `/ranking`, `/bolsa`, `/inventario` e `/usaritem`. O clássico nunca vê esse campo, e um layout fora das regras da doc cai na conversão do embed.
- **Nunca é a única chance.** A doc não diz tudo (como o V2 convive com texto, anexo, mensagem privada e atualização). Se a VSync recusar, a mesma resposta sai de novo como embed e o log mostra `[V2] A VSync recusou o layout (...)`. Antes de enviar, o layout é conferido contra as regras da doc (40 componentes, container sem container, `customId` único), e uma resposta que não cabe nelas fica no clássico.
- **Fica no clássico, de propósito:** resposta com texto no `body` (é ele que notifica quem foi mencionado), com anexo (o cartão do `/perfil`), com imagem no embed (o layout não tem bloco de imagem), com mais de um embed, e as mensagens com atualização ao vivo (a contagem da prisão e a fuga), que o bot edita depois com embeds.
- **Como ligar:** variável `HELENA_V2=owner` no Discloud (aba Variáveis, depois Commit ou Rebuild) para ver só nas suas respostas; `on` para todos; apagar a variável (ou `off`) volta tudo ao clássico, sem mexer no código.
- O comando `/devv2` (só o dono) manda mensagens de teste em cada modo (`puro`, `corpo`, `embed`, `tudo`, `privado`) para ver o que a API aceita.

## Intervalo entre comandos

Depois de usar um comando, a mesma pessoa espera **3 segundos** para o próximo, para o bot não ser sobrecarregado. O valor fica em `config/anti-spam.mjs` e a regra em `services/platform/anti-spam.mjs`.

- **Vale para** os comandos de barra e para o prefixo `h`, e é um intervalo só por pessoa (vale em todos os servidores). **O dono (`HELENA_OWNER_ID`) também espera**, para ele conseguir testar; se quiser que os donos passem direto, troque `exemptOwners` para `true` em `config/anti-spam.mjs`.
- **Não vale para** botões, menus e formulários: eles já pertencem a uma mensagem aberta por um comando. Comando que não existe e conversa que só começa com "h" não gastam o intervalo.
- **Comando barrado não executa.** Na barra, a pessoa recebe um aviso só para ela ("Espere mais 2s"). No prefixo, só a primeira tentativa de cada rodada recebe aviso; as outras são ignoradas, senão o aviso viraria spam no canal.
- **Tentar de novo não empurra a espera:** o intervalo conta do último comando aceito.
- **Desligar:** `HELENA_ANTI_SPAM=off`. Os testes rodam com ele desligado (`tests/helpers.mjs`); `tests/anti-spam.test.mjs` cria o seu com relógio controlado (`createPrefixRunner({ gate })`).

## Bolsa

O `/bolsa` é o painel de mercado do servidor, inspirado no da Alfacusa (que não é uma bolsa de ações: é um índice que mexe nos preços). Cada servidor tem o seu mercado, sem ninguém precisar ligar nada. Regras em `config/market.mjs`, estado e preços em `services/economy/market.mjs`, tela em `services/panels/market-view.mjs`.

- **Índice:** de 0 a 90, sorteado com a mesma chance para cada número a cada 30 minutos, sem olhar o anterior. O 45 é o preço de tabela; o 0 vale 90% e o 90 vale 110%, em linha reta (a cada 9 pontos, 2%). Faixas só para o texto: Baixo (0 a 29), Médio (30 a 60) e Alto (61 a 90).
- **Preços:** a compra vale a tabela de `config/items.mjs` vezes o preço do índice; a venda também, e mais o bônus do item em alta. Vale na loja, nos formulários, em `/comprar`, `/vender` e no inventário. O preço que vale é o da hora em que você confirma, não o que estava na tela.
- **Item em alta:** a cada sorteio, um item vendável (hoje: maçã, café, energético, vara de pesca e mochila) paga de +5,5% a +24,5% na venda, por cima do índice. Armas não se vendem, então nunca ficam em alta.
- **Sorteio sob demanda:** o índice novo sai na primeira consulta depois dos 30 minutos (uma compra, uma venda ou o `/bolsa`), e o prazo seguinte conta dali. Com o bot desligado nada acontece; na volta sai um sorteio só. Tendência é só a comparação com o sorteio anterior, não uma previsão.
- **Sem lucro garantido:** o melhor caso (comprar no índice 0 e vender no 90 com o bônus máximo) ainda perde dinheiro, e o teste confere isso item por item.
- **Desligar:** `HELENA_MARKET=off` deixa tudo na tabela e o `/bolsa` avisa que está desligada. Os testes rodam com ela desligada (`tests/helpers.mjs`) para a loja valer a tabela; `tests/market.test.mjs` liga e controla o sorteio com `setMarketRandom`.
- **Diferença para a Alfacusa:** lá a bolsa também cobre a fazenda e a pesca. A Helena não tem as duas, então o "item em alta" vale para a venda de itens da loja e não há cotação de peixe.

## Painel do site (API)

O painel permite coletar o **daily** e um **bônus de gemas** pelo navegador, entrando com a conta da VSync ("Entrar com vsync", OAuth2 com PKCE). Tudo vem **desligado**: sem `HELENA_WEB_PORT` o bot funciona como sempre e a API nem sobe.

**Fluxo.** O site leva a pessoa à VSync; na volta, entrega o código e o `code_verifier` à API (`services/web/web-api.mjs`), porque o navegador não consegue falar direto com o endpoint de troca da VSync (ele não libera CORS para outros sites). A API troca o código, lê quem é a pessoa e os servidores dela, **devolve o acesso da VSync na hora** e cria uma sessão própria de 6 horas, no máximo 5 por pessoa. No banco fica só o hash do token. O painel lista só os servidores em que a pessoa e a Helena estão.

**Regras.** O daily usa o mesmo serviço do comando (`services/economy/daily.mjs`): mesma recarga de 24 h, sequência, bônus do 7º dia, limite da carteira e a prisão também bloqueia. O bônus de gemas (`config/gems.mjs`) rende de 1 a 3 gemas a cada 5 horas e vale para a conta em todos os servidores (`services/economy/gem-bonus.mjs`).

**Bot e site são o mesmo estado.** O daily e as gemas podem ser coletados pelo comando (`/daily`, `/coletargemas`) ou pelo painel, e os dois lados usam o mesmo serviço e o mesmo banco: coletou em um, o outro já mostra a recarga e não paga de novo. O `/gemas` também mostra se o bônus está disponível. `tests/web-api.test.mjs` coleta de um lado e confere o outro, nos dois sentidos, para o daily e para as gemas. Só uma diferença de propósito: o site pede o desafio anti-robô (Turnstile) quando configurado, e o comando não (quem digita o comando já está logado na VSync).

| Rota | O que faz |
|---|---|
| `GET /api/health` | confere se a API está de pé |
| `POST /api/auth/login` | troca o código do login pela sessão |
| `POST /api/auth/logout` | encerra a sessão |
| `GET /api/me` | servidores, dinheiro, daily e gemas (só leitura) |
| `POST /api/claim/daily` | coleta o daily de um servidor |
| `POST /api/claim/gems` | coleta o bônus de gemas |

**Para ligar** (variáveis em `.env.example`):

1. No Portal do Desenvolvedor da VSync, cadastre o endereço de retorno do login, igual ao do site e com a barra final (por exemplo `https://helenacry.github.io/helena-bot/account/`). Para testar no computador, `http://127.0.0.1:PORTA/account/` também vale.
2. Preencha `HELENA_WEB_PORT`, `HELENA_WEB_ORIGINS`, `HELENA_OAUTH_REDIRECTS` e `HELENA_OAUTH_CLIENT_ID`. A API escuta só em `127.0.0.1`.
3. Publique essa porta na internet com HTTPS (Tailscale Funnel, Cloudflare Tunnel, ngrok ou um servidor) e, com a API atrás de um túnel, ponha `HELENA_WEB_TRUST_PROXY=1`. Se o bot ficar desligado, o painel mostra "fora do ar".
4. Crie uma chave gratuita do [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile): a chave **secreta** vai em `HELENA_TURNSTILE_SECRET` e a chave **do site** em `site/js/config.js`.
5. Preencha `apiUrl`, `clientId` e `turnstileSiteKey` em `site/js/config.js`. Com `apiUrl` vazio, o painel fica escondido no site.

**Segurança.** CORS só para as origens listadas (nunca `*`) e sem cookies; limites de tentativas por IP e por pessoa; corpo máximo de 8 KB; o endereço de retorno do login precisa ser um dos cadastrados; cada entrada, coleta e recusa fica em `web_claim_log` com data, IP e navegador (o site avisa isso) e é apagada depois de `claimLogDays` dias (90, em `config/web.mjs`), junto com as sessões vencidas, na limpeza que roda a cada 10 minutos. Automação para coletar não é permitida.

## Hospedagem no Discloud

O bot e a API do painel rodam **juntos** num app `TYPE=site` do Discloud (plano Platinum ou superior; o Diamond serve). O que está abaixo foi **conferido num app de teste de verdade**, e não só lido na documentação:

| O quê | Resultado |
|---|---|
| Node | `VERSION=latest` entrega o Node 24 (v24.22.0 no teste), com o `node:sqlite` |
| Banco | arquivos gravados em `/home/node`, como `data/helena.db`, **sobrevivem aos commits**, mesmo com o contêiner recriado |
| Gateway | a conexão WebSocket com `wss://api.vsync.lat/gateway` abre (o `hello` chega em menos de 0,4 s) |
| Variáveis | as da aba Variáveis do painel viram variáveis de ambiente de verdade, mas só valem depois de um **rebuild ou deploy** |
| Endereço | `https://<ID>.discloud.dev`, com HTTPS válido (a documentação cita `.discloud.app`, que **não resolve**); o app escuta na **porta 8080, em 0.0.0.0** |
| IP do visitante | o Discloud fica atrás da Cloudflare: `X-Forwarded-For` e `X-Real-IP` chegam com o IP da **borda**, e o IP real vem em `CF-Connecting-IP` (forjar esse é barrado com 403). Use `HELENA_WEB_TRUST_PROXY=cloudflare` |
| Fontes do cartão | o Poppins vai no projeto (`assets/fonts/`) e o cartão o usa; emojis são tirados do texto; **japonês e coreano** continuam virando quadradinhos (as fontes do sistema são só as do contêiner, DejaVu) |
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

**Variáveis do painel do Discloud:** as do seu `.env` (`VSYNC_BOT_TOKEN`, `HELENA_OWNER_ID`, `HELENA_ADMIN_IDS`...) mais, para o painel do site: `HELENA_WEB_PORT=8080`, `HELENA_WEB_HOST=0.0.0.0`, `HELENA_WEB_TRUST_PROXY=cloudflare`, `HELENA_WEB_ORIGINS=https://helenacry.github.io`, `HELENA_OAUTH_REDIRECTS=https://helenacry.github.io/helena-bot/account/`, `HELENA_OAUTH_CLIENT_ID` e `HELENA_TURNSTILE_SECRET`. O `HELENA_DATABASE_PATH` fica sem definir (o padrão `data/helena.db` já cai em `/home/node/data`, no disco que sobrevive). Em `site/js/config.js`, `apiUrl` recebe `https://<ID>.discloud.dev`.

**Atualizar o bot depois:** `npm run discloud:zip -- --force` e envie na aba Commit. Se mudar só uma variável, salve e faça **Rebuild** (a aba avisa).

**Conferir o IP real:** ligue `HELENA_WEB_DEBUG_IP=1` (e faça Rebuild), abra `https://<ID>.discloud.dev/api/health` e veja no log a linha `IP visto`: deve ser o seu IP, vindo do `CF-Connecting-IP`. Desligue depois.

**Limites conhecidos:** o cartão de perfil só desenha o que o Poppins tem (letras latinas, números e a pontuação comum). Japonês, coreano, árabe, cirílico, símbolos decorativos e emojis **não aparecem**: `plain()` (`services/social/profile-card.mjs`) tira esses caracteres, em vez de deixar quadradinhos, e a lista do que vale sai da tabela `cmap` do próprio arquivo da fonte (`services/social/card-glyphs.mjs`). Letras em fonte estilizada (𝓑𝓲𝓸) e de largura total viram letras comuns, e emojis personalizados e menções da VSync (`<:nome:id>`, `<@id>`) somem. Para mostrar japonês seria preciso levar uma fonte CJK no projeto, em `assets/fonts/`. O `.discloud.app` que o painel mostra nos detalhes do app não funciona: vale só o `.discloud.dev`.

## Hospedagem na nuvem (alternativa: Railway)

O bot pode rodar no Railway em vez do computador de quem o mantém. A imagem vem do `Dockerfile` (Node 24, as fontes do cartão de perfil e o comando `node helena.mjs`, sem `.env`). O que muda de ambiente para ambiente vem das **variáveis do serviço**; o banco fica no **volume** (`/data`) e sobrevive aos deploys. Valores de preço (Hobby: US$ 5 por mês, com US$ 5 de uso incluso; pagamento por cartão pós-pago) são da página de planos do Railway em outubro de 2026: confira antes de assinar.

**O que a nuvem precisa:** processo sempre ligado (hospedagem que "dorme" não serve), volume para o SQLite e um endereço HTTPS para a API do painel. Redeploy de um serviço com volume tem uma pequena parada (o bot reconecta em segundos).

### Montar o serviço (uma vez)

1. **Projeto:** New Project, Deploy from GitHub repo, `helenacry/helena-bot`, branch `main`. Quem é dono da organização precisa autorizar o app do Railway no GitHub. Com um `Dockerfile` no repositório, o Railway o usa sozinho.
2. **Volume:** no serviço, adicione um volume com ponto de montagem `/data`.
3. **Variáveis:** copie as do seu `.env` (o "Raw Editor" aceita colar tudo; os segredos você coloca direto lá) e acrescente as da API: `HELENA_WEB_PORT=8080`, `HELENA_WEB_ORIGINS=https://helenacry.github.io`, `HELENA_OAUTH_REDIRECTS=https://helenacry.github.io/helena-bot/account/`, `HELENA_OAUTH_CLIENT_ID`, `HELENA_WEB_TRUST_PROXY=1` e, para o painel, `HELENA_TURNSTILE_SECRET`. A imagem já define `HELENA_DATABASE_PATH`, `HELENA_GENERATED_DIR` e `HELENA_WEB_HOST` para o volume.
4. **Endereço:** Settings, Networking, **Generate Domain**, com a porta `8080` (a mesma de `HELENA_WEB_PORT`).
5. **Site:** em `site/js/config.js`, `apiUrl` recebe esse endereço (sem barra no fim) e `turnstileSiteKey` a chave pública do Turnstile; publique o site.

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

## Site

A pasta `site/` tem a página de divulgação da Helena. É HTML, CSS e JS puros, sem build e sem servidor: dá para abrir `site/index.html` direto no navegador ou publicar a pasta em qualquer hospedagem estática (GitHub Pages, Netlify, Cloudflare Pages...).

```
site/
  index.html          só marcação
  account/index.html  painel da conta (daily e gemas), escondido até haver API
  terms/index.html    termos de uso
  privacy/index.html  política de privacidade
  css/                tokens, base, components, sections, motion, account, legal
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
- **Termos e privacidade:** `site/terms/` e `site/privacy/` são texto escrito à mão para a Helena (a estrutura segue o que sites de bots costumam ter, mas o texto é próprio). O contato público é o perfil do GitHub em `contactUrl` (`site/js/config.js`), sem e-mail. Os prazos citados (sessão de 6 horas, até 5 sessões, 90 dias do registro) vêm de `config/web.mjs` e o `npm test` confere. O teste também falha se surgir uma tabela nova no banco sem ser descrita na política, e se uma página do site passar a falar com um domínio que a política não cita. Ao mudar o que o bot guarda, mude o texto e o número da versão no topo das duas páginas. Não é aconselhamento jurídico: vale uma revisão de quem entende de LGPD antes de depender disso.
- **Números e comandos:** rode `npm run site:data` depois de criar, renomear ou remover comandos, empregos, itens ou conquistas. O script lê o bot de verdade (com um banco temporário, sem tocar em `data/`). Comandos de `admin/` e `dev/` não aparecem. O `npm test` falha se `site/data/site-data.js` ficar para trás.
- **O que não é automático:** os valores escritos nos textos (prêmio do `/daily`, custos e chances do crime, retornos da lavagem, tempos da prisão, e os textos das simulações de conversa) vêm de `config/` e dos comandos, mas foram copiados à mão. Se mudar esses valores no bot, atualize a página.
- **Animações:** tudo nasce no estado final e visível; o JS só adiciona a classe `in` pouco antes de o elemento entrar na tela (veja `css/motion.css` e `js/motion.js`). Sem JS ou com `prefers-reduced-motion`, nada se mexe e a página está completa. A única exceção é o `ヘレナ` da margem do herói (só aparece em telas de 1280 px ou mais), que continua se escrevendo traço a traço, porque é curto, não desloca nada na tela e é a marca da página; ele também se escreve de novo quando o mouse passa por cima.
- **Cores:** todas ficam em `site/css/tokens.css` e saem da foto de perfil (`assets/helena_pfp.png`): ameixa quase preta nas superfícies, orquídea e magenta nos destaques, rosa-pêssego nos detalhes. Os contrastes de texto foram conferidos (WCAG AA). O `npm test` falha se aparecer cor solta fora dos tokens.
- **Imagens:** `assets/helena_pfp.png` gera o avatar da navbar e do site, o favicon e o ícone do celular; `assets/helena-profile.png` gera só a faixa do templo do rodapé (com o matiz levemente girado para combinar com a paleta). O cartão de exemplo do herói NÃO é uma imagem desenhada à mão: `npm run site:card` o gera com o mesmo gerador do `/perfil` (`services/social/profile-card.mjs`), com uma jogadora fictícia e a foto da Helena, então o site nunca fica diferente do cartão real. Rode de novo quando o desenho do cartão mudar. Os originais não são alterados; as versões do site ficam em `site/assets/img/`.
- **Skill de front:** `.claude/skills/front-sem-cara-de-ia/SKILL.md` reúne o que evitar para a página não parecer feita por IA, receitas para fazer diferente e um checklist. O Claude Code a usa ao mexer no site; também dá para chamar com `/front-sem-cara-de-ia`. A pasta `.claude/` está no `.gitignore`, então a skill fica só na sua máquina.

## Wiki

A wiki fica em `wiki/` (um `.md` por página, no estilo da wiki da Alfacusa) e é publicada junto com o site, em `/wiki/`. O `npm run wiki:build` converte os `.md` em páginas HTML dentro de `site/wiki/`, que **é inteira gerada: não edite nada lá à mão**. O `npm test` falha se `site/wiki/` ficar para trás.

```
wiki/
  nav.mjs             o menu: seções e páginas, na ordem
  index.md            a página inicial
  <seção>/<página>.md uma página (cabeçalho com title e description)
site/
  wiki-markdown.mjs   o conversor de Markdown (títulos, listas, tabelas, avisos, cartões)
  wiki-values.mjs     os números e tabelas que vêm do bot
  wiki-pages.mjs      a moldura de cada página, o menu e o índice da busca
  wiki-generate.mjs   junta tudo (usado pelo build e pelos testes)
  build-wiki.mjs      grava site/wiki/
```

- **Números do bot.** Nunca escreva à mão um valor que existe no código. Use `{{v:crime.cooldown}}` no texto ou uma tabela como `{{table:jobs}}`, e o valor sai do bot quando a página é gerada. Os nomes disponíveis estão em `scripts/site/wiki-values.mjs`; um nome que não existe faz o build falhar.
- **Avisos e cartões.** `> [!TIP]`, `> [!NOTE]`, `> [!WARNING]`, `> [!MONEY]` e `> [!EXAMPLE]` viram caixas coloridas. `{{cards: seção/página, ...}}` monta os cartões de navegação.
- **Links.** `[texto](wiki:seção/página#âncora)` leva a outra página da wiki e `[texto](site:terms/)` leva a uma página do site. Link ou âncora que não existe faz o build falhar.
- **Nova página.** Crie o `.md`, ponha o nome em `wiki/nav.mjs` e rode `npm run wiki:build`. Os nomes de arquivo e de pasta são em inglês, em kebab-case, como no resto do projeto.
- **O teste de cobertura.** Todo comando público do bot precisa ser citado em alguma página. Criou um comando? O `npm test` falha até a wiki falar dele.
- **O que a wiki não cobre ainda.** O painel da conta do site e as páginas de administração (`/admin*`, `/dev*`) não entram: o painel só vai à wiki quando for ligado.

O visual vem de `site/css/wiki.css`; a busca (tecla `/`) e a gaveta de menu do celular, de `site/js/wiki.js`. Sem JavaScript, a wiki continua inteira: o menu fica no topo da página e a busca nem aparece.

## Testes

```bash
npm test
```

Usa o executor nativo do Node (`node --test`). Cada arquivo de `tests/` roda num processo próprio, com um banco SQLite temporário, sem tocar em `data/` e sem chamar a VSync (a API é simulada).

## Banco de dados

SQLite, criado e migrado automaticamente ao iniciar. Os arquivos `*.db` não vão para o git. `/devbackup` gera uma cópia em `data/backups/`.
