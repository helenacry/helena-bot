# Configurar a Helena no Discord

[← Voltar ao README](../README.md) · [Índice da documentação](README.md)

Tudo o que é preciso fazer **no Discord** (e nas variáveis do bot e do site) para a Helena entrar no ar. O código já fala com o Discord; o que falta é o aplicativo, o token e os IDs, que só você pode criar.

## 1. Criar o aplicativo

1. Entre em <https://discord.com/developers/applications> e clique em **New Application**. Nome: **Helena**.
2. Em **General Information**, copie o **Application ID**. Ele é público. Vai em dois lugares:
   - `site/src/config.ts`, na constante `DISCORD_CLIENT_ID` (monta o botão de convite e o login do painel);
   - `HELENA_OAUTH_CLIENT_ID`, nas variáveis do bot (só se o painel do site estiver ligado).
3. Ainda em **General Information**, ponha o nome, a descrição e o ícone (`docs/assets/brand/bot-avatar.png` é o avatar) e, em **Tags**, as que quiser.

## 2. O bot e o token

1. Aba **Bot**. Clique em **Reset Token** e copie o token **uma vez**. Ele vai em `DISCORD_BOT_TOKEN` (no `.env` e nas variáveis do Discloud). **Nunca** cole o token em chat, issue, commit ou captura de tela: quem o tem controla o bot. Se vazar, redefina na mesma tela.
2. Em **Privileged Gateway Intents**, ligue só a **Message Content Intent**. É ela que deixa a Helena ler o texto dos comandos de prefixo (`hdaily`, `hperfil`...). Sem ela o Discord fecha a conexão com o código 4014, e o log do bot diz exatamente isso.
   - Deixe **desligadas** a *Server Members Intent* e a *Presence Intent*: a Helena não usa (a busca de pessoas usa a rota de pesquisa do Discord, que não precisa delas).
   - Até **100 servidores** a Message Content Intent é só um botão. Passando disso, o Discord pede a verificação do bot e a aprovação dessa intenção.
3. Marque **Public Bot** se qualquer pessoa puder adicionar a Helena.

## 3. O login do painel do site (opcional)

Só se o painel da conta (daily e gemas pelo navegador) estiver ligado. Aba **OAuth2**:

1. **Redirects**: adicione `https://helena.discloud.dev/account/` (com a barra no fim, escrito igual ao que está em `HELENA_OAUTH_REDIRECTS`). Quando houver domínio próprio, adicione o dele também.
2. **Client Secret**: *Reset Secret* e copie. Vai em `HELENA_OAUTH_CLIENT_SECRET`, só nas variáveis do bot (nunca no site). Se o aplicativo estiver marcado como **Public Client**, o segredo não é necessário, e o login funciona só com o PKCE.
3. As outras variáveis do painel estão em [Painel do site (API)](panel-api.md).

## 4. Adicionar a Helena a um servidor

O link de convite é este, com o seu Application ID:

```
https://discord.com/oauth2/authorize?client_id=<APPLICATION_ID>&scope=bot%20applications.commands&permissions=379904
```

O `379904` são as permissões que a Helena usa: **ver canais**, **enviar mensagens**, **incorporar links** (os embeds), **anexar arquivos** (o cartão do `/perfil`), **ler o histórico** e **usar emojis de fora**. Quem convida pode tirar o que quiser, mas sem *Incorporar links* e *Enviar mensagens* as respostas não aparecem.

O site monta esse mesmo link sozinho quando o `DISCORD_CLIENT_ID` está preenchido.

## 5. Variáveis do bot

| Variável | O que é |
|---|---|
| `DISCORD_BOT_TOKEN` | o token da aba Bot (obrigatória) |
| `HELENA_OWNER_ID` | o seu ID de usuário no Discord (ligue o **Modo desenvolvedor** em Configurações → Avançado, clique no seu perfil e em *Copiar ID do usuário*). Vários, separados por vírgula |
| `HELENA_ADMIN_IDS` | quem usa os comandos `/admin*` |
| `HELENA_SUPPORT_GUILD_ID`, `HELENA_USERS_CHANNEL_ID`, `HELENA_CLUSTERS_CHANNEL_ID` | os contadores do servidor de suporte. A Helena precisa da permissão **Gerenciar canais** nele, e o Discord só deixa renomear um canal 2 vezes a cada 10 minutos (por isso o intervalo mínimo é de 5) |
| `HELENA_DATABASE_PATH` | o banco. **Comece de um arquivo novo** (veja abaixo) |

As demais estão em [Desenvolvimento](development.md#variáveis-de-ambiente).

## 6. O banco começa do zero

Os jogadores da VSync têm outros IDs, e as duas plataformas não se conhecem: não há como casar uma conta com a outra sozinho. Por isso a Helena no Discord começa com um banco novo. Aponte `HELENA_DATABASE_PATH` para um arquivo que não existe (as tabelas são criadas na primeira subida) e **guarde o banco antigo** (`npm run db:export` faz uma cópia) caso um dia valha trazer algo dele.

## 7. Como o bot responde

- **Comandos de barra**: o bot registra os 72 comandos e os 26 apelidos (98 de 100, o limite do Discord) a cada subida. Comandos globais podem levar alguns minutos para aparecer em todos os servidores.
- **Prefixo `h`**: `hdaily`, `hperfil`... funcionam como na VSync, pela Message Content Intent.
- **O Discord exige resposta em até 3 segundos** a cada interação. A Helena responde na hora; o `/perfil` (que gera uma imagem) manda primeiro um aviso só para você e publica o cartão logo em seguida.
- **Menções**: o texto da mensagem (o `body`) avisa quem foi citado; dentro de um embed a menção aparece, mas não avisa. A Helena nunca marca `@everyone`, `@here` ou cargo.
- **Layout V2** (`HELENA_V2`): vale como antes. No Discord uma mensagem V2 não pode ter texto nem embed junto.

## 8. O que mudou em relação à VSync

| | VSync | Discord |
|---|---|---|
| `/userinfo` | insígnias, Prisma e Pulse da VSync | insígnias públicas da conta, impulso do servidor, cargos e banner |
| Busca de pessoa pelo nome | lista de membros do servidor | pesquisa do Discord (começo do @usuário ou do apelido) |
| Foto do `/userinfo` em tamanho grande | rota própria do bot (a VSync cortava a imagem) | direto da CDN do Discord |
| Contadores do servidor de suporte | renomear canal a cada 5 min | igual, e o mínimo passou a ser 5 min (limite do Discord) |
| `/devv2` | testava o que a VSync aceitava de V2 | removido (as regras do V2 no Discord são documentadas) |
| Idade mínima | a da VSync | 13 anos, a do Discord (os textos legais do site já dizem isso) |

## 9. Lista da virada

1. Criar o aplicativo e guardar o token (seções 1 e 2).
2. Testar antes: `npm run start:test` com **outro** aplicativo e um servidor seu de teste (veja [Desenvolvimento](development.md#ambientes-e-branches)). Rode `/ajuda`, `/daily`, `/perfil`, `/userinfo`, `hdaily` e um comando com botão.
3. Preencher `DISCORD_CLIENT_ID` e `supportUrl` em `site/src/config.ts` (o convite do servidor de suporte, `discord.gg/...`), conferir com `npm run site:verify` e **publicar o site antes do bot** (as imagens das respostas moram nele).
4. No Discloud: trocar as variáveis (sai `VSYNC_BOT_TOKEN`, entra `DISCORD_BOT_TOKEN`; novo `HELENA_DATABASE_PATH`) e subir o zip.
5. Conferir o log: `Online como Helena`, `98 comandos registrados!` e `/api/health` com `{"ok":true}`.
6. Rever os textos legais do site com a [lista de decisões](legal-notes.md) (a idade mínima e a plataforma mudaram).
