# Desenho das respostas do bot

[← Voltar ao README](../README.md) · [Índice da documentação](README.md)

Como as respostas da Helena no chat (embeds e o layout V2 do Discord) são desenhadas. É a mesma identidade do site (o livro-caixa): recibo para números, carimbo para estados, a pelúcia para o humor. Quem cria ou muda um comando segue esta página.

## Anatomia de uma resposta

```
[ícone] HELENA · BANCO            <- seção (autor do embed), em maiúsculas
💰 Título em frase normal         <- um emoji só, no começo; sem "Helena X" nem ponto de exclamação à toa
Uma frase na voz da Helena.       <- direta, com bom humor e no máximo duas linhas
┌────────────────────────────┐
│ Pagamento ······ +R$ 420,00│    <- o recibo: nome e valor ligados por pontilhado
│ Carteira ····· R$ 1.350,00 │
└────────────────────────────┘
-# O que fazer a seguir.          <- nota pequena (opcional)
[miniatura]                       <- humor da pelúcia, ou o avatar quando a tela é sobre a pessoa
[ícone] dica curta do rodapé
```

Tudo sai de `createEmbed` e `ledgerEmbed` (`utils/embed.mjs`); o recibo e o carimbo estão em `utils/receipt.mjs`; as cores, o ícone e as imagens em `config/theme.mjs`.

## Cores (a barra do embed)

As cores são as do tema escuro do site, uma por função:

| Função | Cor | `HELENA_COLORS` | Quando |
|---|---|---|---|
| Marca | violeta `#8555ff` | `primary` | listas, ajuda, informação |
| Dinheiro | ouro `#e7b643` | `economy` / `money` | saldo, banco, loja, transferência |
| Deu certo | verde `#3ad693` | `success` | renda, compra feita, resgate |
| Risco ou falha | vermelho `#ff6367` | `error` | erro, flagrante, cadeia, duelo perdido |
| Espera | azul-acinzentado `#7684b1` | `wait` | recarga, energia baixa, "volte depois" |
| Aviso | âmbar `#ffa746` | `warning` | falta algo, confirmação |
| Carinho | rosa `#fa86b6` | `love` | casamento, família |

## Humores da pelúcia

A miniatura de cada resposta é a pelúcia, com a cor do carimbo correspondente. As imagens saem de `npm --prefix site run bot-images` (pasta `site/public/bot/`) e vão ao ar com o site.

| Humor | Use em |
|---|---|
| `feliz` | deu certo, resgates, compras |
| `dinheiro` | dinheiro entrando ou parado (banco, venda, jackpot) |
| `dormindo` | esperando: recarga, energia baixa |
| `preso` | flagrante, cadeia |
| `amor` | casamento, família, Gozofone |
| `alerta` | aviso, falta informação |
| `triste` | erro, recusa, saldo insuficiente |
| `mascara` | crime |
| `bravo` | duelo e combate |
| `festa` | conquista, missão, nível novo |

Tela sobre a pessoa (saldo, perfil, conquistas) usa o avatar dela no lugar do humor.

## O recibo

`receipt(linhas)` devolve um bloco de código com uma linha por conta:

```js
receipt([
    ["Pagamento", signed(reward, formatMoney(reward))],   // +R$ 420,00
    ["Experiência", "+25 XP"],
    null,                                                   // linha fina entre grupos
    ["Carteira", formatMoney(wallet)]
])
```

- Só número e dado curto. Sem emoji lá dentro (desalinha a coluna) e sem negrito (o bloco de código não aceita).
- Entrada com sinal `+`, saída com `-` (`signed`). O total fica embaixo, depois da linha fina.
- Nome de conta curto (até uns 14 caracteres); o recibo cresce sozinho até 38 colunas.
- O carimbo (`stamp("no lucro")`) é uma pastilha em código; no máximo um por resposta.

## Texto

- Segunda pessoa, frases curtas, sem "Parabéns!" nem exclamação em cadeia. Comando sempre em crase: `/lavagem`.
- Dinheiro com `formatMoney` ("R$ 1.350,00"), plural com `plural()` ("1 dia", "2 dias"), tempo com `formatDuration()` ("1h 2m 5s").
- O rodapé é uma dica curta (até uns 60 caracteres), sem o prefixo "Helena •". O ícone dela já vem no rodapé.
- Erros dizem o que aconteceu e o que fazer. Nada de "Ocorreu um erro" sem motivo.

## Prévia

`node scripts/dev/preview-replies.mjs --shots --v2` roda os comandos de verdade num banco temporário e desenha cada resposta (clássico e V2) num HTML parecido com o chat; os casos ficam em `scripts/dev/preview-cases.mjs`. Rode antes de dar um comando por pronto.

## Ao mexer num texto

1. Mude o comando (ou a tela em `services/`) e rode a prévia.
2. Atualize o teste do comando: o título, a linha do recibo e o rodapé são o que ele confere (`receiptOf` em `tests/helpers.mjs` lê o recibo de uma resposta).
3. Se a resposta aparece na conversa de exemplo do site (`/daily`, `/trabalhar`, `/loja`, `/crime`, `/prisao`), atualize `site/src/lib/sim.ts`; `tests/site-sim.test.mjs` avisa quando os dois se afastam.
4. Uma imagem nova (humor ou ícone) entra por `site/scripts/build-bot-images.mjs`, e o **site precisa ser publicado antes do bot**: o Discord só mostra imagem de embed por endereço https.
