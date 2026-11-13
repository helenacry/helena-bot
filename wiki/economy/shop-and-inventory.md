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
> A vara de pesca e a mochila **ainda não fazem nada**: a própria descrição fala em atividades e expansões futuras. Compre só se quiser colecionar.

## Pacotes: `/abrir`

O **Pacote de suprimentos** vem sempre com o mesmo conteúdo, que aparece na loja antes de você pagar: **3 maçãs, 2 cafés e 1 energético**. Sai mais barato que comprar as peças soltas. O `/abrir` abre um pacote e põe tudo no seu inventário; com `quantidade` (um número, ou `max`) abre vários, até 25 de uma vez.

- A comida só começa a **vencer** na hora em que você abre o pacote, não na compra.
- Se algum item do conteúdo **não couber** no inventário (já está no limite), o pacote **não é aberto** e nada se perde. O bot diz quantos dá para abrir.
- O pacote não é vendável.

> [!NOTE]
> A Helena não tem caixas de recompensa pagas: tudo o que se compra tem **conteúdo à vista**. A **caixa misteriosa**, de conteúdo sorteado, não é mais vendida. Quem já tinha uma continua com ela guardada, e ela ainda não abre.

## Preços mudam: a bolsa

Os preços da loja não são fixos. O índice do mercado do servidor sobe e desce, e um item fica em alta na venda. Veja em [Bolsa](wiki:economy/market).

## Inventário: `/inventario`

O `/inventario` (atalho `/inv`) lista o que você tem por prateleira, **12 itens por página**, com o preço de venda de agora ao lado. 🟢 marca a arma equipada e 🔥 marca o item em alta.

- **Descartar** destrói itens, **sem reembolso**, depois de uma tela de confirmação com o botão **Confirmar descarte**. Também existe o comando **`/descartar`**.
- **Atualizar** recarrega a tela.
- Ao lado de cada comida que vence, o inventário mostra **quanto falta para a unidade mais antiga vencer**. Comida vencida aparece no aviso "Comida vencida" e sai da mochila.

## Comida que vence

Parte da comida e da bebida **vence**: depois do prazo, a unidade se perde. O prazo conta a partir da compra, e a loja avisa antes de você pagar ("Vence 12h depois da compra").

{{table:shelf-life}}

- O que **não** está na tabela, como o energético, não vence.
- O inventário e o painel do `/usaritem` mostram quanto falta para a unidade **mais antiga** de cada comida vencer.
- Ao comer, o bot gasta **primeiro a que vence antes**.
- Comida que você já tinha antes dessa regra, ou que chegou por outro caminho, ganha o prazo **completo** na primeira vez que você abre o inventário ou o `/usaritem`.
- Vender e descartar também tiram primeiro a mais antiga.

## Usar itens: `/usaritem`

O `/usaritem` (atalho `/usar`) abre um menu com o que dá para usar. Sem opções, ele mostra o painel; com `item` e `quantidade`, usa direto. **Tudo é privado**: o painel e o resultado de cada uso só aparecem para você. Pelo prefixo `h` a resposta sai no canal, porque o Discord não tem mensagem privada nesse caso.

- **Comida e bebida** repõem energia, um item por vez. Veja os valores em [Energia](wiki:character/energy).
- **Comida vencida** não dá para usar: ela sai da mochila antes de qualquer uso.
- Com a **energia cheia**, o uso é recusado e o item **não é gasto**. O que passaria de {{v:energy.max}} se perderia.
- **Armas** são equipadas, e equipar não gasta o item.
- **`max`** usa quantos itens forem preciso para a energia encher.

## Na cadeia

`/comprar`, `/vender`, `/descartar`, `/usaritem` e `/abrir` ficam **bloqueados** enquanto você cumpre pena. Abrir a loja e o inventário para olhar continua liberado.

## Próximo passo

{{cards: economy/market, character/energy, combat/weapons}}
