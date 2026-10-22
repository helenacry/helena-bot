# Desenvolvimento

[← Voltar ao README](../README.md) · [Índice da documentação](README.md)

Como rodar, testar e estender o bot.

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
| `HELENA_V2` | Layout V2 da VSync no lugar dos embeds: `off` (padrão), `owner` (só nas respostas do dono, para testar em produção) ou `on` (todos). Veja [Componentes V2](game-systems.md#componentes-v2). |
| `HELENA_LIVE_INTERVAL_MS` | Intervalo das contagens ao vivo, como o tempo da prisão. Padrão 10000, mínimo 2000. |
| `BADGE_OUTPUT_DIR`, `BADGE_PUBLIC_BASE_URL` | Imagem de insígnias do `/userinfo` (opcional). |

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

Escreva uma `description` clara (até 100 caracteres, é o que a VSync mostra na lista de comandos) e uma `description` em cada opção: a ajuda usa os dois para montar o "como usar".

### Aliases

`aliases: ["ex"]` faz o comando responder também a `hex` e `/ex`. Cada alias é registrado na VSync como um comando próprio, com a mesma descrição e opções.

- Nome de 1 a 32 caracteres: minúsculas sem acento, números, `-` ou `_`.
- Não pode repetir o nome de um comando nem de outro alias. O bot recusa iniciar se repetir.
- A VSync aceita no máximo **100 comandos globais** (comandos mais aliases). O bot recusa registrar se passar disso.

## Testes

```bash
npm test               # o bot, a lógica que o site compartilha com ele, a política de privacidade e a wiki
npm run site:check     # tipos do site
npm run site:build && npm run site:verify && npm run site:test   # o site (depois de npm run site:install)
```

`npm test` usa o executor nativo do Node (`node --test`). Cada arquivo de `tests/` roda num processo próprio, com um banco SQLite temporário, sem tocar em `data/` e sem chamar a VSync (a API é simulada). Rode a suíte **sozinha**, sem o navegador dos testes do site em paralelo: `prison-escape.test.mjs` fica instável por CPU. Os testes de navegador (`site/tests/e2e`) abrem o Edge instalado (no CI, o Chromium) e conferem acessibilidade com **axe** (WCAG 2.2 AA), rolagem lateral e elementos que vazam da margem, nenhum pedido a terceiros e erros no console, em 3 larguras e 2 temas, além dos fluxos (conversa de exemplo, laboratório do crime, busca de comandos e da wiki, tema, menu do celular e o painel da conta com a API simulada).

## Banco de dados

SQLite, criado e migrado automaticamente ao iniciar. Os arquivos `*.db` não vão para o git. `/devbackup` gera uma cópia em `data/backups/`.
