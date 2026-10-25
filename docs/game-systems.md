# Sistemas do jogo

[← Voltar ao README](../README.md) · [Índice da documentação](README.md)

Como cada parte do bot funciona por dentro: crime, perfil, painéis, layout V2, intervalo entre comandos e bolsa.

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

O cartão do `/perfil` é uma imagem 1600×1200 (`services/social/profile-card.mjs`, SVG convertido pelo `sharp`, sem gravar nada em disco): lateral com o **RANK**, chip do estado civil com o cônjuge, anel do nível, foto em pentágono, nome e título, bio e cinco cartões (banco, gemas, carteira, arma e emprego). O RANK é a posição no ranking de patrimônio do `/ranking` (`services/economy/player-rank.mjs`). A fonte é o **Poppins**, que vai no próprio projeto (`assets/fonts/`, licença OFL; o `services/social/card-fonts.mjs` aponta o fontconfig para essa pasta), então o cartão sai igual no PC e na nuvem. Se ele falhar, valem Nunito, Segoe UI e DejaVu Sans, e o log de início avisa (`[CARTÃO] Fonte Poppins carregada.` ou o aviso de que não foi achada). **Emojis em cores:** nome, bio e cônjuge mostram os emojis comuns (rostos, bandeiras, tons de pele, teclas 1️⃣ e emojis compostos como 👨‍👩‍👧 e 🏳️‍🌈). O SVG do sharp não desenha emoji colorido, então cada emoji vira uma **imagem** no meio da linha: o `@twemoji/parser` acha os emojis no texto e diz o arquivo de cada um, e o `@twemoji/svg` traz os desenhos (`services/social/card-emoji.mjs`; as letras vêm da largura do Poppins em `card-glyphs.mjs`, e o `rich()` do `profile-card.mjs` põe um marcador no lugar de cada emoji para o texto seguir pelo mesmo corte e quebra de linha, com o emoji pesando uns 2,3 caracteres). Na subida o log confere o desenho (`[CARTÃO] Emojis coloridos prontos (Twemoji).`); se a máquina não desenhar, o cartão volta a tirar os emojis do texto, sem buracos. Emoji novo demais para o conjunto de desenhos (Emoji 16 em diante) e os caracteres invisíveis saem do texto; **emprego, arma e título** não levam emoji colorido (saem do texto). Os desenhos são do **Twemoji** (veja [Créditos](../README.md#créditos)). A exceção do título é o emoji do **título equipado** ("💰 Rico"): os 10 emojis dos títulos das conquistas são desenhados em vetor (`EMOJI_ART`, grade de 32 x 32), ao lado do texto. **Desenho atual (18/10/2026):** textos menores e mais leves (nome 48, valores 30, rótulos 17 sem espaçamento), anel do nível mais fino (traço de 12, o trecho do 0% fica à esquerda do topo e o progresso cresce no sentido anti-horário), moldura com vão escuro e linha clara interna, pentágono um pouco mais largo que alto e fundo com degradê que clareia para a esquerda, embaixo. As medidas, as cores e os degradês foram tirados da imagem de referência e travados em `tests/profile-card.test.mjs` (cada texto fica a até 1 px de onde está no desenho). A imagem de exemplo do site sai do mesmo gerador: `npm run site:card` (`scripts/site/build-card.mjs`).

- `/perfil` mostra o seu cartão. `/perfil usuario:<@usuário>` (ou `hperfil maria`, `hperfil @maria`, `hperfil <@menção>`) mostra o de outra pessoa do servidor. A busca é só pelo **@usuário** (o nome de usuário, que é único, sem diferenciar maiúsculas) ou por menção: apelidos e nomes de exibição das plataformas não entram. A mensagem menciona a pessoa e, se não achar ninguém, avisa que não encontrou. O cartão é enviado direto para o Discord, sem gravar nada em disco.
- `/userinfo` (alias `ui`) funciona igual: `/userinfo usuario:<@usuário>` (ou `hui maria`, `hui @maria`, `hui <@menção>`) mostra as insígnias, as datas e o que o servidor sabe de outra pessoa. Também só pelo **@usuário exato** ou menção; a mensagem menciona a pessoa e, se não achar ninguém, avisa. Sem argumento mostra os seus. Bots também têm informações. Os dados vêm do próprio Discord: a **conta** (as insígnias públicas em `public_flags`, a data de criação tirada do ID e a foto) e o **membro** (apelido, entrada no servidor, cargos, impulso e castigo). O comando de barra e a mensagem do prefixo já entregam o membro de quem usou o comando; só a pesquisa de outra pessoa chama a API (`GET /guilds/:g/members/search`, que não exige intenção privilegiada), e o banner, que só existe no perfil completo da conta (`GET /users/:id`), é buscado quando a pessoa o pede (`services/social/userinfo-account.mjs`). O cartão traz: autor `usuário (nome)`, Menção na descrição, Tag e ID em caixas de código lado a lado, insígnias só em ícones, Nitro só com sinal, datas com a idade em negrito (o tempo que passou, nas três maiores unidades, com horas e minutos para quem tem menos de um dia), e o rodapé com o avatar de quem usou. "Assinante Nitro desde", "Impulsionando desde" e as insígnias de Nitro e de impulso (atual e próxima) só aparecem se a pessoa informou as datas em "Meu histórico" (`userinfo-declared.mjs`, tabela `userinfo_declared`), marcadas como informadas, porque o Discord não as entrega a bots. Dois menus embaixo (só para quem usou o comando): **Mais informações.** (avatar em tamanho grande, banner, cores do perfil, insígnias, Nitro e impulso, datas, cargos, nomes anteriores, ícones e banners antigos e, só no próprio cartão, **Meu histórico**, sempre em mensagem privada) e **Ver informações de outros membros no servidor.** (quem já joga ali, mais **Procurar por @usuário...**, que abre um formulário). Telas em `services/social/userinfo-view.mjs`, insígnias em `userinfo-badges.mjs`, menus em `userinfo-components.mjs` e cliques em `services/panels/userinfo-panel.mjs`. O contador de visualizações fica no banco (tabela `userinfo_views`). O histórico de nomes, ícones e banners (`services/social/userinfo-history.mjs`, tabelas `userinfo_history` e `userinfo_privacy`) é só de quem já usou a Helena, e a privacidade dele fica em `userinfo-privacy.mjs`.
- Nos comandos de dinheiro (`/depositar`, `/sacar`, `/transferir`, `/lavagem`), `tudo` ou `all` usa o saldo inteiro: `hdep all`, `hsacar tudo`.

### Insígnias do /userinfo

O Discord guarda as insígnias públicas de uma conta num número em bits (`public_flags` e `flags`): cada bit é uma insígnia (equipe do Discord, parceiro, HypeSquad, caçador de bugs, apoiador inicial, desenvolvedor verificado, moderador certificado, desenvolvedor ativo, bot verificado) ou um aviso da conta (spam, equipe, quarentena). A tabela de bits segue https://flags.lewisakura.moe e a documentação do Discord; como ela passa do bit 31, a conta é feita com `BigInt`. Quem impulsiona o servidor ganha mais uma, que vem do membro. O catálogo está em `services/social/userinfo-badges.mjs`, na ordem em que aparecem, e `tests/userinfo-flags.test.mjs` confere cada bit.

**O que a API não entrega, e como a Helena contorna:**

- **Nitro.** O `premium_type` só vai ao dono da conta (OAuth2). `nitroSigns()` deduz pelos sinais públicos que só o Nitro libera (avatar animado, banner, foto ou banner só do servidor) e diz "provável", "possível" ou "não detectado".
- **Insígnia de impulso.** O Discord a troca aos 1, 2, 3, 6, 9, 12, 15, 18 e 24 meses de impulso, somando todos os servidores. A Helena só vê o `premium_since` de ESTE servidor, então `boostLadder()` é uma estimativa por aqui (nível, próximo nível e quantos dias faltam).
- **Perfil completo.** O banner, as flags completas e a etiqueta de servidor só vêm de `GET /users/:id`, que o cartão busca uma vez (guardada por um minuto, em `userinfo-account.mjs`).

- **Cada insígnia tem um desenho próprio** (`assets/emojis/badge_*.svg` e `nitro.svg`). No catálogo ela leva um emoji comum só dela (🔱, 🤝, 🦁...), que o bot troca pelo desenho no envio (veja "Emojis próprios" em `docs/bot-design.md`).
- **Um bit que o Discord criar depois** é ignorado até entrar no catálogo.
- **Prisma, Pulse e tempo de tela não existem no Discord**: eram da VSync.

## Painéis e modais

Alguns comandos mostram botões que abrem formulários (modais) do Discord:

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

O Discord aceita blocos de layout nas mensagens de bots (`text`, `separator`, `section` com miniatura, `container` com barra de cor), misturados com as linhas de botões e menus. Com `HELENA_V2` ligada, o embed de cada resposta sai como um container (`utils/components-v2.mjs`): título e descrição viram texto, os campos viram "**nome** + valor", a cor do embed vira a barra do container, os botões e menus ficam dentro dele e o rodapé sai em letra pequena. Com miniatura (`/userinfo`), os primeiros textos viram uma seção com a miniatura ao lado.

- **Layout próprio por tela.** Quando botão ao lado do texto ajuda, a tela monta o próprio desenho (campo `layout` da resposta, com o kit de `utils/components-v2.mjs`), em vez de converter o embed: `/cooldowns`, `/loja`, `/saldo`, `/ajuda`, `/missoes`, `/ranking`, `/bolsa`, `/inventario` e `/usaritem`. O clássico nunca vê esse campo, e um layout fora das regras da doc cai na conversão do embed.
- **Nunca é a única chance.** A doc não diz tudo (como o V2 convive com texto, anexo, mensagem privada e atualização). Se o Discord recusar, a mesma resposta sai de novo como embed e o log mostra `[V2] O Discord recusou o layout (...)`. Antes de enviar, o layout é conferido contra as regras da doc (40 componentes, container sem container, `customId` único), e uma resposta que não cabe nelas fica no clássico.
- **Fica no clássico, de propósito:** resposta com texto no `body` (é ele que notifica quem foi mencionado), com anexo (o cartão do `/perfil`), com imagem no embed (o layout não tem bloco de imagem), com mais de um embed, e as mensagens com atualização ao vivo (a contagem da prisão e a fuga), que o bot edita depois com embeds.
- **Como ligar:** variável `HELENA_V2=owner` no Discloud (aba Variáveis, depois Commit ou Rebuild) para ver só nas suas respostas; `on` para todos; apagar a variável (ou `off`) volta tudo ao clássico, sem mexer no código.

## Intervalo entre comandos

Depois de usar um comando, a mesma pessoa espera **3 segundos** para o próximo, para o bot não ser sobrecarregado. O valor fica em `config/anti-spam.mjs` e a regra em `services/platform/anti-spam.mjs`.

- **Vale para** os comandos de barra e para o prefixo `h`, e é um intervalo só por pessoa (vale em todos os servidores). **O dono (`HELENA_OWNER_ID`) também espera**, para ele conseguir testar; se quiser que os donos passem direto, troque `exemptOwners` para `true` em `config/anti-spam.mjs`.
- **Não vale para** botões, menus e formulários: eles já pertencem a uma mensagem aberta por um comando. Comando que não existe e conversa que só começa com "h" não gastam o intervalo.
- **Comando barrado não executa.** Na barra, a pessoa recebe um aviso só para ela ("Espere mais 2s"). No prefixo, só a primeira tentativa de cada rodada recebe aviso; as outras são ignoradas, senão o aviso viraria spam no canal.
- **Tentar de novo não empurra a espera:** o intervalo conta do último comando aceito.
- **Desligar:** `HELENA_ANTI_SPAM=off`. Os testes rodam com ele desligado (`tests/helpers.mjs`); `tests/anti-spam.test.mjs` cria o seu com relógio controlado (`createPrefixRunner({ gate })`).

## Bolsa

O `/bolsa` é o painel de mercado do servidor (ele não é uma bolsa de ações: é um índice que mexe nos preços). Cada servidor tem o seu mercado, sem ninguém precisar ligar nada. Regras em `config/market.mjs`, estado e preços em `services/economy/market.mjs`, tela em `services/panels/market-view.mjs`.

- **Índice:** de 0 a 90, sorteado com a mesma chance para cada número a cada 30 minutos, sem olhar o anterior. O 45 é o preço de tabela; o 0 vale 90% e o 90 vale 110%, em linha reta (a cada 9 pontos, 2%). Faixas só para o texto: Baixo (0 a 29), Médio (30 a 60) e Alto (61 a 90).
- **Preços:** a compra vale a tabela de `config/items.mjs` vezes o preço do índice; a venda também, e mais o bônus do item em alta. Vale na loja, nos formulários, em `/comprar`, `/vender` e no inventário. O preço que vale é o da hora em que você confirma, não o que estava na tela.
- **Item em alta:** a cada sorteio, um item vendável (hoje: maçã, café, energético, vara de pesca e mochila) paga de +5,5% a +24,5% na venda, por cima do índice. Armas não se vendem, então nunca ficam em alta.
- **Sorteio sob demanda:** o índice novo sai na primeira consulta depois dos 30 minutos (uma compra, uma venda ou o `/bolsa`), e o prazo seguinte conta dali. Com o bot desligado nada acontece; na volta sai um sorteio só. Tendência é só a comparação com o sorteio anterior, não uma previsão.
- **Sem lucro garantido:** o melhor caso (comprar no índice 0 e vender no 90 com o bônus máximo) ainda perde dinheiro, e o teste confere isso item por item.
- **Desligar:** `HELENA_MARKET=off` deixa tudo na tabela e o `/bolsa` avisa que está desligada. Os testes rodam com ela desligada (`tests/helpers.mjs`) para a loja valer a tabela; `tests/market.test.mjs` liga e controla o sorteio com `setMarketRandom`.
- **Escopo:** a bolsa cobre só a venda de itens da loja: o "item em alta" vale para ela e não há cotação de peixe nem de fazenda.
