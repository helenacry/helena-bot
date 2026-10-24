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

O cartão mostra a **menção**, o **@usuário** e o **ID** (em caixas de código, fáceis de copiar), as **insígnias** da conta (equipe do Discord, HypeSquad, apoiador inicial, desenvolvedor verificado e as outras que o Discord dá, mais a de quem **impulsiona** o servidor), quando a conta foi criada e quando entrou no servidor, cada data com a **idade** em anos, meses e dias. Quem impulsiona o servidor vê também desde quando. Bots levam a marca 🤖 e quem está de castigo vê até quando. No rodapé aparecem quem usou o comando, quantas vezes aquele perfil já foi consultado e a hora.

Embaixo do cartão há dois menus, só para quem usou o comando:

- **Mais informações.** abre o **avatar** (em tamanho grande), o **banner**, o nome de cada **insígnia**, as **datas e idades** e os **cargos**. Só aparece o que a pessoa tem.
- **Ver informações de outros membros no servidor.** lista quem já joga ali e tem a opção **Procurar por @usuário...**, que abre um formulário. O resultado também aparece só para você.

## Próximo passo

{{cards: character/achievements-and-titles, character/marriage}}
