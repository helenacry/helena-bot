---
title: Drops no chat
description: Os presentes que a Helena solta no chat quando o servidor liga os drops, o que pode vir, as regras e como quem administra liga e desliga com o /servidor.
---

Nos servidores que ligam os **drops**, a Helena às vezes solta um **presente** no chat: uma mensagem com o botão **Pegar!**. Quem aperta **primeiro** leva. É de graça, não se compra e não custa nada a ninguém: é a única forma de ganhar a **Caixa misteriosa**.

## Resumo

| O que | Como funciona |
| --- | --- |
| Quando aparece | Só onde há conversa: pelo menos **{{v:drops.minMessages}} mensagens** de **{{v:drops.minPeople}} pessoas** nos últimos **{{v:drops.window}}**. |
| Com que frequência | No máximo **um a cada {{v:drops.interval}}** em cada servidor. |
| Quanto tempo dura | O presente some em **{{v:drops.expire}}** se ninguém pegar. |
| Quem pode pegar | Quem já usou a Helena naquele servidor (tem conta) e não está bloqueado. |
| Limite | **{{v:drops.cap}} presentes por pessoa por dia**, em cada servidor (o dia vira à meia-noite UTC). |

## O que pode vir

{{table:drop-prizes}}

- O que não cabe no inventário (o limite do item ou a [mochila](wiki:economy/shop-and-inventory) cheia) vira **dinheiro**: o valor está na coluna "Se não couber".
- A **Caixa misteriosa** abre com `/abrir`: escolha `caixa` e ela sorteia o prêmio. Ela **nunca** é vendida.

## Ligar e desligar: `/servidor`

Os drops vêm **desligados**. Quem tem a permissão **Administrador** ou **Gerenciar servidor** usa o **`/servidor`** e aperta:

- **Ligar drops** ou **Desligar drops**;
- **Usar este canal** (os presentes só aparecem no canal onde você apertou) ou **Qualquer canal** (em qualquer canal com conversa).

O `/servidor` só funciona como comando de barra: o Discord só confirma as permissões nesse formato.

## O que a Helena guarda

Para saber se há conversa, a Helena **conta**, na memória e por poucos minutos, quantas mensagens e de quantas pessoas há em cada canal dos servidores que ligaram os drops. Ela **não lê nem guarda o texto** dessa conta, e nada dela vai para o banco. O que fica guardado é o ajuste do servidor (se os drops estão ligados e em que canal) e quantos presentes cada pessoa já pegou. Veja a [política de privacidade](site:privacy/).
