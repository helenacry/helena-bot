---
title: Roubar jogadores
description: Como roubar a carteira de outro jogador, a chance de cada arma, quanto dá para levar e o que acontece se der errado.
---

O `/roubar` tira dinheiro da **carteira** de outro jogador do servidor. O banco é seguro: só o que está na carteira corre risco. Para roubar, você precisa de uma arma equipada.

## Resumo

| O quê | Como é |
| --- | --- |
| Comando | `/roubar alvo:<nome, @menção ou ID>` (atalho `/assaltar`) |
| Custo | {{v:robbery.energy}} de energia por tentativa, mesmo se falhar |
| Espera | {{v:robbery.cooldown}} depois de cada tentativa |
| Você precisa | estar solto, ter pelo menos {{v:robbery.minHp}} de vida e uma arma equipada |
| O alvo precisa | ter **mais de {{v:robbery.minTarget}}** na carteira |
| Se der certo | você leva de {{v:robbery.steal}} da carteira do alvo, com um teto |

No prefixo, escreva `hroubar` e a pessoa: `hroubar @fulano`.

## A arma decide a chance

Cada arma tem a sua chance de sucesso. Arma que não está na tabela usa **{{v:robbery.defaultChance}}%**.

{{table:weapons}}

- **Arma de fogo** precisa de **pelo menos 1 munição** para tentar, e só gasta a munição quando o roubo **dá certo**.
- **Arma branca** não usa munição.
- A arma precisa ter durabilidade. Cada roubo bem-sucedido gasta 1 ponto.
- Equipe com `/equipar` ou pelo `/usaritem`.

> [!NOTE]
> Compare a coluna de preço com a de chance antes de comprar: a arma mais cara nem sempre é a melhor para roubar.

## Quanto dá para levar

Um roubo bem-sucedido leva uma parte sorteada entre **{{v:robbery.steal}}** da carteira do alvo, mas nunca passa de um teto: carteiras até {{v:robbery.capThreshold}} rendem no máximo {{v:robbery.capBase}}. Acima disso o teto cresce devagar e para em {{v:robbery.capMax}}.

{{table:robbery-cap}}

Do que você leva, **{{v:robbery.clean}} vem limpo** para a sua carteira e **{{v:robbery.dirty}} vira dinheiro sujo**, que precisa de [lavagem](wiki:crime/laundering).

Depois de um roubo bem-sucedido ainda existe a chance de **{{v:robbery.escapeInjury}}** de se ferir na fuga. O ferimento é leve, moderado ou grave: {{v:robbery.injuries}}.

## Se der errado

- Você **não vai preso**. Perde a energia e a espera, e a tentativa entra na sua ficha criminal.
- Se o alvo estava **armado** (e, com arma de fogo, tinha munição), existe **{{v:robbery.retaliation}} de chance de revide**: você perde de {{v:robbery.retaliationHp}} de vida.
- Se a carteira do alvo tinha **{{v:robbery.minTarget}} ou menos**, o roubo **sempre falha**. Não vale tentar.

> [!WARNING]
> Toda tentativa de roubo, dando certo ou não, soma um registro na ficha criminal e coloca você em `/procurados`.

## Como não ser roubado

- **Deposite** o que não vai usar agora. O banco não pode ser roubado.
- Ter uma arma equipada e com munição dá ao ladrão frustrado o risco do revide.

## Próximo passo

{{cards: crime/laundering, crime/wanted-and-prison}}
