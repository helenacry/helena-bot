---
title: Perfil e bio
description: O cartão de perfil, como ler cada parte, como mudar a bio e como ver o perfil de outra pessoa.
---

O **`/perfil`** (atalho `/profile`) mostra o seu cartão de perfil: uma imagem com o resumo de quem você é no servidor.

## O que o cartão mostra

- **RANK**: a sua posição no ranking de patrimônio (veja [Ranking](wiki:economy/rankings));
- o **estado civil**, solteiro(a) ou casado(a) (veja [Casamento](wiki:character/marriage));
- o **nível**, num anel que mostra quanto falta para o próximo (com 0% sobra um pequeno trecho do anel, à esquerda do topo);
- a sua **foto**, o **nome** (os emojis do nome aparecem em cores) e o **título** equipado, com o emoji do título ao lado do texto (💰 Rico, 🔥 Persistente...);
- o selo **DEV**, para o dono do bot;
- a **bio**;
- o **banco**, a **carteira** e as **gemas**;
- a **arma equipada** (com o dano) e o **emprego atual**.

## Ver o perfil de outra pessoa

Use a opção `usuario` com o nome, uma @menção ou o ID: `/perfil usuario:@pessoa`, ou `hperfil @pessoa` no prefixo.

## Mudar a bio

A bio é o texto que aparece no cartão. Ela tem **até 160 caracteres** (cada emoji conta como 1).

- **`/bio texto:Seu texto aqui`** troca na hora.
- **`/bio`** sem texto abre um editor, com o botão **Editar bio**, já preenchido com a bio atual.

> [!NOTE]
> O cartão desenha letras latinas, números, a pontuação comum e os **emojis comuns, em cores** (rostos, bandeiras, tons de pele, 1️⃣, 👨‍👩‍👧, 🏳️‍🌈...), na bio, no nome e no nome do cônjuge. **Símbolos decorativos (★, ✿, ꒰), emojis personalizados do Discord, menções e outros alfabetos (japonês, coreano, árabe, cirílico) ficam de fora do cartão**, para não aparecerem como quadradinhos, e o mesmo vale para emojis lançados de 2023 em diante, que ainda não têm desenho. A bio guardada continua inteira, e o `/bio` avisa como ela fica no cartão quando algo fica de fora. Letras em fonte estilizada (𝓑𝓲𝓸) viram letras comuns.
>
> Os emojis do cartão são do [Twemoji](https://github.com/jdecked/twemoji) (© Twitter, Inc. e colaboradores), usados sob a licença [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> [!WARNING]
> A bio aparece para qualquer pessoa que veja o seu perfil. Os [termos de uso](site:terms/) pedem que ela não tenha conteúdo ilegal, ofensivo ou que exponha dados de outras pessoas.

## Perfil do Discord: `/userinfo`

O `/userinfo` (atalho `/ui`) é outra coisa: mostra as **informações e insígnias de um usuário do Discord**, não do jogo. Funciona com qualquer pessoa, mesmo que ela nunca tenha jogado a Helena.

O cartão mostra a **menção**, o **@usuário** e o **ID** (em caixas de código, fáceis de copiar), as **insígnias** da conta, cada uma com o **nome** (equipe do Discord, HypeSquad, apoiador inicial, desenvolvedor verificado, desenvolvedor ativo e as outras que o Discord dá, mais a de quem **impulsiona** o servidor), o **Nitro**, a **etiqueta de servidor** (se a pessoa usa uma), quando a conta foi criada e quando entrou no servidor, cada data com a **idade** em anos, meses e dias. Quem impulsiona o servidor vê também desde quando e, lado a lado, a **insígnia de impulso atual** (o nível, com a gema de cada um dos 9 níveis, e há quanto tempo) e a **próxima** (o nível e em quanto tempo ela chega). Bots levam a marca 🤖 e quem está de castigo vê até quando. No rodapé aparecem quem usou o comando, quantas vezes aquele perfil já foi consultado e a hora.

Embaixo do cartão há dois menus, só para quem usou o comando:

- **Mais informações.** abre o **avatar** (em tamanho grande), o **banner**, as **cores do perfil** (a cor de destaque, as cores do nome, a plaquinha e a decoração do avatar, quando existem), cada **insígnia** com o que ela quer dizer, o **Nitro e o impulso** (os sinais de Nitro e os 9 níveis da insígnia de impulso), as **datas e idades**, os **cargos** e o histórico: **nomes anteriores**, **ícones antigos** e **banners antigos**. No seu próprio cartão há também **Meu histórico**.

> [!NOTE]
> **O Nitro é deduzido.** O Discord só conta a assinatura do Nitro ao próprio dono da conta. A Helena mostra "provável" quando o perfil tem algo que só o Nitro libera (avatar animado, banner, foto ou banner só do servidor). Quem tem Nitro e não usa nada disso aparece como "não detectado". As insígnias de Nitro e de Quests também não chegam a bots.
- **Ver informações de outros membros no servidor.** lista quem já joga ali e tem a opção **Procurar por @usuário...**, que abre um formulário. O resultado também aparece só para você.

### Histórico de nomes, ícones e banners

O Discord não guarda o que uma pessoa já foi, então a Helena só mostra o que **ela mesma viu**, e só de **quem usa a Helena**: quando você usa um comando (ou alguém consulta o seu `/userinfo`) e o seu @usuário, o nome de exibição, a foto ou o banner mudou, ela anota. O histórico **começa no seu primeiro uso**, nunca antes, guarda no máximo **25 de cada tipo** e só tem o que o Discord já mostra para todo mundo (o código da foto e do banner, não a imagem). **Nunca** guarda mensagens, calls nem a lista de servidores de ninguém.

Em **Meu histórico** (no menu do seu próprio cartão) você escolhe, com três botões: **Ocultar** (a Helena para de guardar e não mostra o que já tinha), **Mostrar** de novo ou **Apagar tudo**. Também dá para escrever `hui ocultar`, `hui mostrar` ou `hui apagar`. A [política de privacidade](site:privacy/) tem os detalhes.

> [!NOTE]
> **O que a Helena não consegue mostrar.** O Discord não entrega a bots a data em que alguém assinou o Nitro, a bio, os pronomes, as conexões nem o tema de duas cores do perfil: isso só o próprio dono da conta vê. Por isso a Helena não mostra "assinante Nitro desde" nem a insígnia de Nitro, e o impulso é contado só neste servidor.

## Próximo passo

{{cards: character/achievements-and-titles, character/marriage}}
