---
title: Vida, colete e munição
description: Como a vida funciona, quanto custa se curar no hospital, o que é a proteção contra duelos e como cuidar do equipamento.
---

Duelar, errar um crime ou levar um revide custa vida. Esta página mostra como recuperar e como se equipar.

## Vida

A vida vai até **{{v:hospital.maxHp}}**. Você perde vida quando:

- **duela**;
- **erra um crime** e a história termina em ferimento;
- **leva revide** de um alvo armado num roubo que falhou, ou se **fere na fuga** de um roubo bem-sucedido.

Algumas coisas exigem vida mínima: o **crime** ({{v:crime.minHp}}), o **roubo** ({{v:robbery.minHp}}) e o **duelo** ({{v:duel.minHp}}).

Veja a sua vida em **`/statuscombate`** ou **`/hospital`**.

## Hospital

- **`/hospital`** mostra a sua vida, quanto custaria se curar e quanto falta da proteção.
- **`/curar`** leva a vida de volta a {{v:hospital.maxHp}}. Custa **{{v:hospital.costPerHp}} por ponto de vida que falta**, pago com o dinheiro da **carteira**.

Se a vida já está cheia, o `/curar` não faz nada. Se a carteira não cobre o valor, também não.

> [!EXAMPLE]
> Com 40 de vida, faltam 60 pontos, e curar custa 60 x {{v:hospital.costPerHp}}.

## Proteção contra duelos

Quem se cura no hospital ganha **{{v:hospital.protection}} de proteção**: nesse tempo, ninguém consegue desafiar essa pessoa e ela também não pode desafiar. **`/protecaopvp`** mostra quanto falta.

> [!NOTE]
> A proteção vale só para **duelos**. Ela não impede que roubem a sua carteira.

## Colete

O **`/colete`** custa **{{v:armory.vestPrice}}** e dá **{{v:armory.vestDefense}} pontos de defesa**. Comprar de novo substitui o colete que você tem. Na conta do duelo, a defesa tira dano do golpe, até um limite de pontos.

## Munição e conserto

- **`/municao quantidade:N`**: **{{v:armory.ammoPrice}}** cada, de 1 a {{v:armory.maxAmmo}} por compra.
- **`/reparar`**: **{{v:armory.repairPrice}}**, devolve a durabilidade da arma a {{v:armory.maxDurability}}.
- **`/recarregar`**: mostra a munição que você tem com a arma de fogo equipada.

Os detalhes de cada arma estão em [Armas](wiki:combat/weapons).

> [!WARNING]
> `/curar`, `/colete`, `/municao` e `/reparar` ficam bloqueados na cadeia. Se vai arriscar um crime, resolva isso antes.

## Próximo passo

{{cards: combat/duels, combat/weapons}}
