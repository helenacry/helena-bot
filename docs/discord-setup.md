# Configurar a Helena no Discord

[← Voltar ao README](../README.md) · [Índice da documentação](README.md)

Tudo o que é preciso fazer **no Discord** (e nas variáveis do bot e do site) para a Helena entrar no ar. O código já fala com o Discord; o que falta é o aplicativo, o token e os IDs, que só você pode criar.

## 1. Criar o aplicativo

1. Entre em <https://discord.com/developers/applications> e clique em **New Application**. Nome: **Helena**.
2. Em **General Information**, copie o **Application ID**. Ele é público. Vai em dois lugares:
   - `site/src/config.ts`, na constante `DISCORD_CLIENT_ID` (monta o botão de convite e o login do painel);
   - `HELENA_OAUTH_CLIENT_ID`, nas variáveis do bot (só se o painel do site estiver ligado).
3. Ainda em **General Information**, ponha o nome, a descrição e o ícone (`docs/assets/brand/bot-avatar.png` é o avatar) e, em **Tags**, as que quiser. A descrição é a biografia da Helena (o Portal aceita até 400 caracteres e entende negrito e emoji); use este texto, que é o `bioText()` de `config/about.mjs` (`tests/about.test.mjs` confere que são iguais):

   ```
   🌸 Olá! Sou a **Helena**, a bot de economia e RPG: trabalhe, lave dinheiro, case e fuja da cadeia!
   ✨ Meu prefixo é **h**, use **hajuda** para descobrir todos os meus comandos.
   💌 Suporte: https://discord.gg/NDBwQW99RZ
   🌐 Site: https://helena.discloud.dev/
   ```

4. Os emojis próprios da Helena (a flor, a carta, o globo, o notebook e os outros, em `assets/emojis/`) são enviados ao aplicativo com `node --env-file=.env scripts/dev/emojis.mjs upload`, que só manda os que ainda não existem. Enquanto um emoji não estiver no aplicativo, o bot usa o comum no lugar. Veja [Design do bot](bot-design.md).

## 2. O bot e o token

1. Aba **Bot**. Clique em **Reset Token** e copie o token **uma vez**. Ele vai em `DISCORD_BOT_TOKEN` (no `.env` e nas variáveis do Discloud). **Nunca** cole o token em chat, issue, commit ou captura de tela: quem o tem controla o bot. Se vazar, redefina na mesma tela.
2. Em **Privileged Gateway Intents**, ligue só a **Message Content Intent**. É ela que deixa a Helena ler o texto dos comandos de prefixo (`hdaily`, `hperfil`...). Sem ela o Discord fecha a conexão com o código 4014, e o log do bot diz exatamente isso.
   - Deixe **desligada** a *Presence Intent*: a Helena não usa (a busca de pessoas usa a rota de pesquisa do Discord, que não precisa dela).
   - A *Server Members Intent* também fica **desligada**, a menos que você queira as boas-vindas aos criadores quando eles entram em um servidor com a Helena (veja `HELENA_MEMBERS_INTENT` na tabela abaixo). Ligue a intent no portal **antes** de pôr a variável em `on`: com a variável ligada e a intent desligada, o Discord fecha a conexão (4014).
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
| `HELENA_SUPPORT_GUILD_ID` e `HELENA_USERS_CHANNEL_ID`, `HELENA_SERVERS_CHANNEL_ID`, `HELENA_SHARDS_CHANNEL_ID`, `HELENA_TOPXP_CHANNEL_ID`, `HELENA_TOPLEVEL_CHANNEL_ID`, `HELENA_TOPCOINS_CHANNEL_ID` | os contadores do servidor de suporte: crie um **canal de voz** para cada um e cole o ID. A Helena precisa de **Ver canal** e **Gerenciar canais** neles, e o Discord só deixa renomear um canal 2 vezes a cada 10 minutos (por isso o intervalo mínimo é de 5) |
| `HELENA_MEMBERS_INTENT` | `on` pede a *Server Members Intent*, que traz a entrada de membros: a Helena dá boas-vindas, no chat, aos criadores (os IDs de `HELENA_OWNER_ID`) quando entram em um servidor com ela, e a mais ninguém. Padrão `off`. Precisa da intent ligada no portal (seção 2). A resposta fofa quando os criadores mencionam a Helena **não** precisa disso |
| `HELENA_SHARDS` | os fragmentos (shards) do gateway. Vazio ou `auto` segue a recomendação do Discord, que é 1 até o bot passar de 2500 servidores |
| `HELENA_DATABASE_PATH` | o banco. **Comece de um arquivo novo** (veja abaixo) |

As demais estão em [Desenvolvimento](development.md#variáveis-de-ambiente).

## 6. O banco começa do zero

Os jogadores da VSync têm outros IDs, e as duas plataformas não se conhecem: não há como casar uma conta com a outra sozinho. Por isso a Helena no Discord começa com um banco novo. Aponte `HELENA_DATABASE_PATH` para um arquivo que não existe (as tabelas são criadas na primeira subida) e **guarde o banco antigo** (`npm run db:export` faz uma cópia) caso um dia valha trazer algo dele.

## 7. Como o bot responde

- **Comandos de barra**: o bot registra os comandos dos jogadores e os apelidos a cada subida (o log mostra `N comandos registrados!`; o limite do Discord é 100 na lista global). Os comandos do dono (`admin` e `dev`) vão só para o servidor de suporte (`HELENA_SUPPORT_GUILD_ID`) e não gastam vaga. Comandos globais podem levar alguns minutos para aparecer em todos os servidores.
- **Prefixo `h`**: `hdaily`, `hperfil`... funcionam como na VSync, pela Message Content Intent.
- **Só a menção** (`@Helena`, sem mais nada): ela responde com um cartão de apresentação (o prefixo, a ajuda e os links de suporte, site, wiki e código). Há uma espera de 20 s por canal e de 60 s por pessoa; bots, bloqueados e criadores (que têm a resposta carinhosa) não recebem, e em manutenção ela fica quieta. Os links saem sem prévia. O texto está em `config/about.mjs`.
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
