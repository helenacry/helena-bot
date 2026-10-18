---
title: Perfil e bio
description: O cartão de perfil, como ler cada parte, como mudar a bio e como ver o perfil de outra pessoa.
---

O **`/perfil`** (atalho `/profile`) mostra o seu cartão de perfil: uma imagem com o resumo de quem você é no servidor.

## O que o cartão mostra

- **RANK**: a sua posição no ranking de patrimônio (veja [Ranking](wiki:economy/rankings));
- o **estado civil**, solteiro(a) ou casado(a) (veja [Casamento](wiki:character/marriage));
- o **nível**, num anel que mostra quanto falta para o próximo;
- a sua **foto**, o **nome** e o **título** equipado;
- a **bio**;
- o **banco**, a **carteira** e as **gemas**;
- a **arma equipada** (com o dano) e o **emprego atual**.

## Ver o perfil de outra pessoa

Use a opção `usuario` com o nome, uma @menção ou o ID: `/perfil usuario:@pessoa`, ou `hperfil @pessoa` no prefixo.

## Mudar a bio

A bio é o texto que aparece no cartão. Ela tem **até 160 caracteres**.

- **`/bio texto:Seu texto aqui`** troca na hora.
- **`/bio`** sem texto abre um editor, com o botão **Editar bio**, já preenchido com a bio atual.

> [!WARNING]
> A bio aparece para qualquer pessoa que veja o seu perfil. Os [termos de uso](site:terms/) pedem que ela não tenha conteúdo ilegal, ofensivo ou que exponha dados de outras pessoas.

## Perfil da VSync: `/userinfo`

O `/userinfo` (atalho `/ui`) é outra coisa: mostra as **informações e insígnias de um usuário da VSync**, não do jogo. Funciona com qualquer pessoa, mesmo que ela nunca tenha jogado a Helena.

O cartão mostra a **menção**, o **@usuário** e o **ID** (em caixas de código, fáceis de copiar), as **insígnias**, quando a conta foi criada e quando entrou no servidor, cada data com a **idade** em anos, meses e dias. Quem tem **Prisma** ou **Pulse** vê também desde quando, há quanto tempo pulsa (no selo atual) e quanto falta para o próximo selo. Bots levam a marca 🤖 e quem está de castigo vê até quando. No rodapé aparecem quem usou o comando, quantas vezes aquele perfil já foi consultado e a hora.

Embaixo do cartão há dois menus, só para quem usou o comando:

- **Mais informações.** abre o **avatar** (uma imagem quadrada de 500x500, enviada como mensagem normal do canal, porque a VSync não aceita imagem em resposta privada), o **banner**, o nome de cada **insígnia**, as **datas e idades**, a **evolução do Pulse** (cada nível e quando chega), os **cargos** e o **status e a atividade** (online, status personalizado, o que está fazendo). Só aparece o que a pessoa tem, e o que ela escondeu na VSync não aparece.
- **Ver informações de outros membros no servidor.** lista quem já joga ali e tem a opção **Procurar por @usuário...**, que abre um formulário. O resultado também aparece só para você.

## Próximo passo

{{cards: character/achievements-and-titles, character/marriage}}
