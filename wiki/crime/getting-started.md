---
title: "Crime: por onde começar"
description: Como o /crime funciona, o que você ganha, o que perde se der errado e como não parar na cadeia à toa.
---

O crime é a forma mais rápida de ganhar dinheiro na Helena, e a mais arriscada. O dinheiro que ele rende vem **sujo**: você só consegue gastar depois de [lavar](wiki:crime/laundering).

## Resumo

| O quê | Como é |
| --- | --- |
| Comando | `/crime` (no prefixo, `hcrime`) |
| Custo | {{v:crime.energy}} de energia por tentativa |
| Espera | {{v:crime.cooldown}} depois de cada tentativa, deu certo ou não |
| Chance de dar certo | {{v:crime.chance}}, em qualquer nível |
| Você precisa | estar solto e ter pelo menos {{v:crime.minHp}} de vida |
| Se der certo | dinheiro sujo e de {{v:crime.xp}} de XP |
| Se der errado | multa, às vezes ferimento e {{v:crime.jail}} de cadeia |

> [!NOTE]
> O nível **não muda a chance**. Ele muda o tamanho do prêmio e da multa.

## Se der certo

Você ganha **dinheiro sujo**, que fica numa conta à parte e não serve para comprar nada. Um crime comum rende entre {{v:crime.prize}} antes do multiplicador do seu nível. De vez em quando (cerca de {{v:crime.jackpot}} sucessos) sai uma história rara (um cofre aberto num escritório vazio) que rende {{v:crime.jackpotPrize}}, também antes do multiplicador.

Você ainda ganha **{{v:crime.xp}} de XP**, e o XP do crime conta para subir de nível na hora.

## Se der errado

- **Multa**: de {{v:crime.fine}}, antes do multiplicador, tirada da **carteira**. Ela nunca passa do que você tem nela.
- **Ferimento**: em {{v:crime.failureInjury}} das histórias de fracasso você sai ferido e perde de {{v:crime.injury}} de vida.
- **Cadeia**: {{v:crime.jail}} presa. Veja [o que dá e o que não dá para fazer na cadeia](wiki:crime/wanted-and-prison).

Dando certo ou errado, a tentativa entra na sua **ficha criminal**.

## O nível mexe no valor

O multiplicador começa em 1x no nível 1 e chega a cerca de {{v:crime.scale100}}x no nível 100.

{{table:crime-scale}}

## Dicas para não se dar mal

> [!TIP]
> A multa sai da carteira, então deposite o dinheiro limpo no banco antes de tentar um crime. O que está no banco não é tocado.

- Se a vida estiver abaixo de {{v:crime.minHp}}, o crime nem começa. Use `/curar` no hospital.
- Cada tentativa gasta {{v:crime.energy}} da energia, que enche 1 ponto a cada {{v:energy.regen}}. Veja `/energia` para acompanhar.
- O dinheiro sujo não rende nada parado. Quanto antes você lava, antes ele vira dinheiro de verdade.

## Próximo passo

{{cards: crime/laundering, crime/robbery, crime/wanted-and-prison}}
