---
title: Tempos de espera
description: Todas as esperas do jogo reunidas, de quanto em quanto tempo você pode repetir cada ação e como conferir.
---

Quase tudo na Helena tem um tempo de espera. Esta é a lista de todos, com o comando de cada um.

## Todas as esperas

{{table:cooldowns}}

## Conferir o que está liberado: `/cooldowns`

O `/cooldowns` (atalho `/cd`) mostra o tempo que falta para o **daily**, o **trabalho**, o **bônus de gemas**, o **crime**, o **roubo** e a **lavagem**, separados em **Legal** e **Ilegal**, com ✅ para o que já está liberado e ⏳ com o tempo que falta. Quem é casado(a) vê também o **Gozofone**, e quem está preso vê a **cadeia**. O botão **Atualizar** refaz a lista com a hora de agora.

> [!NOTE]
> O `/cooldowns` não mostra tudo desta tabela. Duelos, fugas e o sorteio da bolsa têm a espera tratada em outro lugar: veja a página de cada um.

## O intervalo entre comandos

Separado de tudo isso, a Helena espera **{{v:antiSpam.interval}}** entre um comando seu e o próximo, seja de barra ou com o prefixo `h`. É só para ela não ficar sobrecarregada: o comando que chega cedo demais é ignorado e o aviso diz quanto falta. Mais em [Perguntas frequentes](wiki:help/faq).

## Detalhes que pegam gente de surpresa

- **Crime e roubo** gastam a espera mesmo quando a tentativa **dá errado**.
- A **lavagem** tem **uma espera só** para as duas lavanderias: depois de lavar na pública, você espera o tempo da pública antes de usar qualquer uma. Veja em [Lavagem de dinheiro](wiki:crime/laundering).
- O **daily** espera {{v:daily.cooldown}} depois do último resgate. As **missões** contam por **dia UTC**, que vira à meia-noite UTC (21h em Brasília).
- A **fuga da prisão** conta a espera do **começo** da tentativa anterior, e não do fim.
- A cadeia **não pausa** as esperas de crime, roubo, trabalho e daily: o tempo continua correndo enquanto você está preso. Só as lavagens em andamento ficam em pausa.

> [!TIP]
> Quer fazer tudo em ordem? Resgate o daily, trabalhe, resgate as missões e só então pense em crime.

## Próximo passo

{{cards: character/energy, start/earning-money}}
