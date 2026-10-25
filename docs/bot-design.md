# Desenho das respostas do bot

[← Voltar ao README](../README.md) · [Índice da documentação](README.md)

Como as respostas da Helena no chat (embeds e o layout V2 do Discord) são desenhadas. É a identidade do site (o livro-caixa, a pelúcia, a paleta), com as contas em linhas de emoji como as do `/work` da Alfacusa. Quem cria ou muda um comando segue esta página.

## Anatomia de uma resposta

```
[ícone] HELENA · BANCO            <- seção (autor do embed), em maiúsculas
💰 Título em frase normal         <- um emoji só, no começo; sem "Helena X" nem ponto de exclamação à toa
Uma frase na voz da Helena.       <- direta, com bom humor e no máximo duas linhas
💵 | Pagamento: **+R$ 420,00**     <- as contas: emoji, barra, nome e valor em negrito
👛 | Carteira: **R$ 1.350,00**
-# O que fazer a seguir.          <- nota pequena (opcional)
[miniatura]                       <- humor da pelúcia, ou o avatar quando a tela é sobre a pessoa
[ícone] dica curta do rodapé
```

Tudo sai de `createEmbed` e `ledgerEmbed` (`utils/embed.mjs`); as contas e o carimbo estão em `utils/receipt.mjs`; as cores, o ícone e as imagens em `config/theme.mjs`; os emojis próprios da Helena em `config/icons.mjs`.

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

## As contas

`receipt(linhas)` devolve uma linha por conta, no estilo do `/work` da Alfacusa (`💵 | Você trabalhou… **$700.00**`): o emoji do assunto, uma barra, o nome e o valor em negrito.

```js
receipt([
    ["Pagamento", signed(reward, formatMoney(reward))],   // 💵 | Pagamento: **+R$ 420,00**
    ["Experiência", "+25 XP"],                              // ✨ | Experiência: **+25 XP**
    null,                                                   // uma linha em branco entre grupos
    ["Carteira", formatMoney(wallet)]                       // 👛 | Carteira: **R$ 1.350,00**
])
```

- O emoji vem do nome da conta (`iconFor`): os nomes comuns têm o seu, o resto cai em palavras-chave e, por fim, num `🔹`. Conta nova com assunto novo? Acrescente o nome na lista de `utils/receipt.mjs`.
- Entrada com sinal `+`, saída com `-` (`signed`). O total fica embaixo, depois da linha em branco.
- Listas (empregos, preços da bolsa) seguem a mesma ideia: `💼 **Nome** · R$ 150,00 · nível 1`, uma por linha, com `🔒` no que está bloqueado.
- O carimbo (`stamp("no lucro")`) é uma pastilha em código; no máximo um por resposta.
- O site tem o recibo dele (o papel térmico, em `site/src/lib/sim.ts`), que é outro desenho e fica como está.

## Emojis próprios

Os desenhos ficam em `assets/emojis/<nome>.svg` (a pelúcia, tinta escura, lilás e sombra em violeta: contorno de 6, sombra deslocada em `#3b1ba0`, cores da paleta) e a lista em `config/icons.mjs`, que diz qual emoji comum cada um substitui (um desenho pode valer por vários: 🔧 🛠️ ⚙️ viram a chave inglesa). No Discord cada um é um emoji do aplicativo chamado `h_<nome>`, que vale em qualquer servidor.

**Nenhum comando precisa saber disso.** O código continua escrevendo o emoji comum. Na hora de enviar, `services/discord/format.mjs` troca pelo da Helena (`customize()`, de `services/platform/app-emojis.mjs`) no título, na descrição e nos campos do embed, no texto do layout V2, no corpo da mensagem e nos emojis de botões e menus. Fica de fora o que não aceita emoji personalizado (autor e rodapé do embed, rótulos, placeholders e descrições de menu). Se a troca estourar o limite de caracteres, o texto sai com os emojis comuns. Emoji que ainda não foi enviado ao aplicativo, os de itens do jogo e os quadradinhos coloridos de status ficam como são.

- **Desenhar um novo:** crie o SVG em `assets/emojis/<nome>.svg` (128 × 128, fundo transparente), acrescente o nome e o emoji comum em `config/icons.mjs`, veja a folha com `npm run emojis:sheet -- folha.png` e envie com `node --env-file=.env scripts/dev/emojis.mjs upload` (só envia os que faltam; `--replace` troca os que já existem). `tests/icons.test.mjs` confere que cada nome tem desenho e que cada PNG cabe no limite do Discord.

## Texto

- Segunda pessoa, frases curtas, sem "Parabéns!" nem exclamação em cadeia. Comando sempre em crase: `/lavagem`.
- Dinheiro com `formatMoney` ("R$ 1.350,00"), plural com `plural()` ("1 dia", "2 dias"), tempo com `formatDuration()` ("1h 2m 5s").
- O rodapé é uma dica curta (até uns 60 caracteres), sem o prefixo "Helena •". O ícone dela já vem no rodapé.
- Erros dizem o que aconteceu e o que fazer. Nada de "Ocorreu um erro" sem motivo.

## A lista de comandos do Discord

Quando a pessoa digita `/`, o Discord mostra cada comando com a descrição embaixo. No registro (`command-registry.mjs`), a Helena abre cada descrição com a categoria entre colchetes, como a Alfacusa: `[💰 Economia] Consulte o seu saldo`, `[🕵️ Crime] Cometa um crime em busca de dinheiro sujo`. A categoria vem de `config/command-categories.mjs` (`slashTag` e `slashDescription`); os comandos do dono levam `[🔧 Admin]` e `[🧪 Dev]`. A descrição é cortada com "…" para caber nos 100 caracteres do Discord.

- O emoji é o **comum**: o Discord não desenha emoji personalizado na descrição de um comando.
- A etiqueta existe **só no registro**. A ajuda, o site e a wiki mostram a descrição pura, porque já mostram a categoria ao lado.
- Comando novo não precisa de nada: a categoria sai da pasta onde ele mora (e o arquivo de categorias cobre as exceções). Escreva a descrição sem etiqueta, em até uns 85 caracteres.
- O Discord guarda o registro em cache: uma descrição nova pode levar alguns minutos para aparecer.

## Prévia

`node scripts/dev/preview-replies.mjs --shots --v2` roda os comandos de verdade num banco temporário e desenha cada resposta (clássico e V2) num HTML parecido com o chat; os casos ficam em `scripts/dev/preview-cases.mjs`. Rode antes de dar um comando por pronto.

## Ao mexer num texto

1. Mude o comando (ou a tela em `services/`) e rode a prévia.
2. Atualize o teste do comando: o título, as contas e o rodapé são o que ele confere (`receiptOf` em `tests/helpers.mjs` lê as contas de uma resposta).
3. Se a resposta aparece na conversa de exemplo do site (`/daily`, `/trabalhar`, `/loja`, `/crime`, `/prisao`), o texto e os números continuam espelhados em `site/src/lib/sim.ts`; só o desenho das contas (o recibo de papel) é do site.
4. Uma imagem nova (humor ou ícone) entra por `site/scripts/build-bot-images.mjs`, e o **site precisa ser publicado antes do bot**: o Discord só mostra imagem de embed por endereço https.
