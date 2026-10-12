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
| `/lavagem` | Converte dinheiro sujo em limpo. Lavanderia **pública** (35% a 55%, uma por vez no servidor) ou **privada** (75% a 85%, exige gemas uma vez). |
| `/lavageminfo` | Tempo restante da lavagem em andamento. |
| `/prisao` | Pena restante e ficha criminal. |

- Dinheiro sujo não compra, deposita nem transfere: só serve depois de lavado.
- Preso, o jogador não trabalha, não compra e não movimenta dinheiro. A lista de comandos bloqueados está em `config/crime.mjs`.
- O tempo da prisão é atualizado ao vivo na própria mensagem (a cada 10 s por padrão).
- Valores, histórias, custos e limites ficam todos em `config/crime.mjs`.

## Banco de dados

SQLite, criado e migrado automaticamente ao iniciar. Os arquivos `*.db` não vão para o git. `/devbackup` gera uma cópia em `data/backups/`.
