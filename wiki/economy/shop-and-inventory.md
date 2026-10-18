---
title: Loja e inventário
description: O que a loja vende, como comprar e vender pelos botões, como usar os itens e como organizar o inventário.
---

A loja e o inventário são painéis com botões: você navega, escolhe um item e informa a quantidade num formulário.

## Loja: `/loja`

O `/loja` (atalho `/store`) abre a vitrine, com uma prateleira para cada tipo de item. Cada prateleira mostra **5 itens por página**, com o preço de compra, o de venda, o que você já tem e se cabe na sua carteira (✅ quantos dá para comprar, 🔒 quanto falta, 📦 limite do item atingido). O botão do item fica **verde** quando você pode comprar.

- **Número do item**: abre o formulário de quantidade (um número, ou `max` para o máximo que dá).
- **Por nome**: compra digitando o nome ou o ID do item.
- **Vender**: formulário de venda, que aceita `metade` e `tudo`.

Para ir direto a uma prateleira, use a opção `categoria`, como em `hloja categoria:weapon`.

Também funcionam os comandos diretos **`/comprar`** e **`/vender`**, com `item` e `quantidade`.

> [!NOTE]
> Cada compra aceita de 1 a 99 unidades, e cada item tem um **limite** no inventário (na tabela abaixo). Passou do limite, a compra é recusada.

## O que a loja vende

As armas ficam em [Armas](wiki:combat/weapons). O resto:

{{table:shop}}

Itens vendáveis voltam pela **metade do preço** de compra.

> [!WARNING]
> A caixa misteriosa, a vara de pesca e a mochila **ainda não fazem nada**: a própria descrição fala em "futuras" atividades e expansões. Compre só se quiser colecionar.

## Preços mudam: a bolsa

Os preços da loja não são fixos. O índice do mercado do servidor sobe e desce, e um item fica em alta na venda. Veja em [Bolsa](wiki:economy/market).

## Inventário: `/inventario`

O `/inventario` (atalho `/inv`) lista o que você tem por prateleira, **12 itens por página**, com o preço de venda de agora ao lado. 🟢 marca a arma equipada e 🔥 marca o item em alta.

- **Descartar** destrói itens, **sem reembolso**, depois de uma tela de confirmação com o botão **Confirmar descarte**. Também existe o comando **`/descartar`**.
- **Atualizar** recarrega a tela.

## Usar itens: `/usaritem`

O `/usaritem` (atalho `/usar`) abre um menu com o que dá para usar. Sem opções, ele mostra o painel; com `item` e `quantidade`, usa direto.

- **Comida e bebida** repõem energia, um item por vez. Veja os valores em [Energia](wiki:character/energy).
- Com a **energia cheia**, o uso é recusado e o item **não é gasto**. O que passaria de {{v:energy.max}} se perderia.
- **Armas** são equipadas, e equipar não gasta o item.
- **`max`** usa quantos itens forem preciso para a energia encher.

## Na cadeia

`/comprar`, `/vender`, `/descartar` e `/usaritem` ficam **bloqueados** enquanto você cumpre pena. Abrir a loja e o inventário para olhar continua liberado.

## Próximo passo

{{cards: economy/market, character/energy, combat/weapons}}
