# Desenvolvimento

[← Voltar ao README](../README.md) · [Índice da documentação](README.md)

Como rodar, testar e estender o bot.

## Requisitos

- **Node.js 24** (testado nessa versão). O banco usa o módulo `node:sqlite`, que já vem com o Node.
- Um aplicativo de bot criado no [portal do desenvolvedor do Discord](https://discord.com/developers/applications), com o token do bot e a **Message Content Intent** ligada. O passo a passo está em [Configurar no Discord](discord-setup.md).

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
| Bot | o oficial | **outro** aplicativo de bot no Discord |
| Banco | `data/helena.db` | `data/helena-test.db` |

Fluxo: desenvolva e teste na `testes`; quando estiver validado, traga para a `main`.

Para montar o ambiente de testes:

1. Crie um segundo aplicativo de bot no portal do Discord e adicione-o a um servidor seu de teste.
2. Copie `.env.test.example` para `.env.test` e preencha com o token do bot de testes e o seu ID.
3. **Deixe vazios** `HELENA_SUPPORT_GUILD_ID` e todos os `HELENA_*_CHANNEL_ID` dos contadores. Se preenchidos, o bot de testes sobrescreve os contadores do servidor de suporte da produção.
4. `npm run start:test`.

> O Discord limita as conexões de gateway por bot (2). Ao reiniciar, encerre o processo anterior; se instâncias antigas ficarem rodando, a nova é recusada com `Muitas sessões`.

## Idiomas (traduções)

O bot escreve tudo em português; quem escolhe o inglês em `/config` recebe as respostas traduzidas **na hora de enviar**, pelo transporte (`services/discord/transport.mjs` chama `services/platform/i18n.mjs`). Nenhum comando precisa saber disso.

- O dicionário do inglês é um conjunto de arquivos em `config/locales/`, que `en-US.mjs` junta:
  - `en-US-catalog.mjs`: o que vem dos catálogos (itens, empregos, missões, conquistas, histórias do crime, descrições dos comandos e das opções), **ligado por id**. Item, emprego, missão, conquista ou comando novo sem tradução faz o teste `tests/i18n-coverage.test.mjs` falhar e dizer qual.
  - `en-US-responses.mjs`: o que cada comando escreve. `RESPONSES_EXACT` é o texto inteiro; `RESPONSES_PATTERNS` são as frases com partes que mudam, escritas com `tpl("Você comprou **{n}** munição.", "You bought **{n}** ammo.")` (`config/locales/template.mjs`). Os marcadores têm tipo: `{n}` número, `{u}` menção, `{m}` dinheiro e o resto qualquer texto; `{x:t}` na tradução traduz também o que foi capturado, e a tradução pode ser uma função (plural).
  - `en-US-userinfo.mjs`: o `/userinfo` (as insígnias vêm da tabela do comando, por id).
  - `en-US.mjs`: o básico (seções, contas do recibo, botões) e `SAME`, os textos iguais nos dois idiomas ("Katana", "Legal").
- O tradutor (`services/platform/i18n.mjs`) tenta, nesta ordem: o texto inteiro, os padrões, o nome da conta do recibo (e traduz o valor), o texto dentro de negrito ou depois de um emoji, os nomes de itens/empregos numa linha só de nomes e preços, e por fim **decompõe** a linha: tira a contagem "(15)" e divide por ` · `, ` • `, ` — ` e ` | `, traduzindo pedaço por pedaço. O que só tem comandos (`/saldo`), código entre crases, menções, endereços, números e XP não é texto: passa sem aviso.
- O que não está no dicionário sai em português. Com `HELENA_I18N_LOG=on`, o log mostra uma vez cada texto sem tradução (`[I18N] sem tradução (en-US): "..."`).
- **Achar o que falta sem esperar alguém reclamar:** `node --disable-warning=ExperimentalWarning scripts/dev/i18n-scan.mjs` roda os comandos dos jogadores em inglês, num banco de teste, clica nos botões e preenche os formulários, e lista (1) cada texto sem tradução e (2) cada linha com português no meio do inglês. `SCAN_ROUNDS=20` faz mais sorteios, `--only=trabalhar,crime` roda só alguns e `--seed=7` repete os mesmos sorteios. O teste de cobertura roda a mesma coisa com semente fixa.
- A lista de comandos que o Discord mostra ao digitar `/` também sai em inglês para quem usa o Discord em inglês (`description_localizations`, montado em `command-registry.mjs` com este mesmo dicionário). É o idioma do aplicativo do Discord da pessoa; o `/config` escolhe o idioma das respostas.
- Para um idioma novo: crie `config/locales/<idioma>.mjs`, registre em `LOCALES` (`services/platform/i18n.mjs`) e em `LANGUAGES` (`config/i18n.mjs`) e libere o código na tabela `user_settings` (`database/settings-migrations.mjs`).
- Os nomes dos comandos (`/saldo`, `/loja`...) e os ícones não são traduzidos.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DISCORD_BOT_TOKEN` | Token do bot. |
| `HELENA_OWNER_ID` | IDs dos proprietários (comandos `/dev*` e selo DEV). Aceita vários, separados por vírgula. |
| `HELENA_ADMIN_IDS` | IDs autorizados nos comandos `/admin*`. |
| `HELENA_MARKET` | `off` (ou `0`, `false`, `no`) desliga a bolsa e deixa todos os preços na tabela. Padrão: ligada. |
| `HELENA_ANTI_SPAM` | `off` (ou `0`, `false`, `no`) desliga o intervalo de 3 segundos entre comandos. Padrão: ligado. |
| `HELENA_DATABASE_PATH` | Caminho do banco SQLite. Padrão: `./data/helena.db`. |
| `HELENA_SUPPORT_GUILD_ID` e os canais `HELENA_USERS_CHANNEL_ID`, `HELENA_SERVERS_CHANNEL_ID`, `HELENA_SHARDS_CHANNEL_ID`, `HELENA_TOPXP_CHANNEL_ID`, `HELENA_TOPLEVEL_CHANNEL_ID`, `HELENA_TOPCOINS_CHANNEL_ID` | Contadores do servidor de suporte: canais de voz renomeados com usuários, servidores, shards, Top XP, Top Level e Top Coins (globais). Canal sem ID fica de fora; basta um. |
| `HELENA_STATS_INTERVAL` | Intervalo de atualização (ms) dos contadores. Mínimo 300000. |
| `HELENA_MEMBERS_INTENT` | `on` pede a Server Members Intent (ligada antes no portal) para a Helena dar boas-vindas, no chat, aos criadores (`HELENA_OWNER_ID`) quando entram em um servidor com ela. Padrão `off`; com `on` e a intent desligada o Discord derruba a conexão (4014). A resposta às menções dos criadores não depende disso. |
| `HELENA_I18N_LOG` | `on` lista no log, uma vez cada, os textos sem tradução para quem usa o inglês (veja Idiomas, acima). |
| `HELENA_SHARDS` | Fragmentos (shards) do gateway: vazio ou `auto` segue o Discord (1 até 2500 servidores); um número força o total. |
| `HELENA_V2` | Layout V2 do Discord no lugar dos embeds: `off` (padrão), `owner` (só nas respostas do dono, para testar em produção) ou `on` (todos). Veja [Componentes V2](game-systems.md#componentes-v2). |
| `HELENA_LIVE_INTERVAL_MS` | Intervalo das contagens ao vivo, como o tempo da prisão. Padrão 10000, mínimo 2000. |

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

Comando novo entra sozinho na central de ajuda (`/ajuda`), na lista do site e na wiki, sem lista escrita à mão. A categoria vem da **pasta** (`commands/economy` é Economia, `commands/social` é Social...), e as exceções, como o combate que mora em `crime/`, estão em `config/command-categories.mjs`. Comandos de `admin/`, `dev/` e o de teste não aparecem para os jogadores. A wiki exige um texto sobre o comando novo (veja [Site e wiki](site.md#wiki)).

Escreva uma `description` clara (até 100 caracteres, é o que o Discord mostra na lista de comandos) e uma `description` em cada opção: a ajuda usa os dois para montar o "como usar".

### Aliases

`aliases: ["ex"]` faz o comando responder também a `hex` e `/ex`. Cada alias é registrado no Discord como um comando próprio, com a mesma descrição e opções.

- Nome de 1 a 32 caracteres: minúsculas sem acento, números, `-` ou `_`.
- Não pode repetir o nome de um comando nem de outro alias. O bot recusa iniciar se repetir.
- O Discord aceita no máximo **100 comandos globais** (comandos mais aliases). O bot recusa registrar se passar disso.

## Testes

```bash
npm test               # o bot, a lógica que o site compartilha com ele, a política de privacidade e a wiki
npm run site:check     # tipos do site
npm run site:build && npm run site:verify && npm run site:test   # o site (depois de npm run site:install)
```

`npm test` usa o executor nativo do Node (`node --test`). Cada arquivo de `tests/` roda num processo próprio, com um banco SQLite temporário, sem tocar em `data/` e sem chamar o Discord (a API é simulada). Rode a suíte **sozinha**, sem o navegador dos testes do site em paralelo: `prison-escape.test.mjs` fica instável por CPU. Os testes de navegador (`site/tests/e2e`) abrem o Edge instalado (no CI, o Chromium) e conferem acessibilidade com **axe** (WCAG 2.2 AA), rolagem lateral e elementos que vazam da margem, nenhum pedido a terceiros e erros no console, em 3 larguras e 2 temas, além dos fluxos (conversa de exemplo, laboratório do crime, busca de comandos e da wiki, tema, menu do celular e o painel da conta com a API simulada).

## Banco de dados

SQLite, criado e migrado automaticamente ao iniciar. Os arquivos `*.db` não vão para o git. `/devbackup` gera uma cópia em `data/backups/`.
