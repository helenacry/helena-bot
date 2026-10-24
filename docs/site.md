# Site e wiki

[← Voltar ao README](../README.md) · [Índice da documentação](README.md)

O site (Astro), a wiki em Markdown e os portões de qualidade.

## Site

A pasta `site/` é um projeto **Astro 7** à parte, com as próprias dependências (`site/package.json`): saída 100% estática, TypeScript estrito, CSS escrito à mão (sem Tailwind) e Preact só nas ilhas que precisam de interação. O bot não carrega nada dele (o `.discloudignore` ignora `site/` inteiro).

```bash
npm run site:install   # uma vez (npm ci dentro de site/)
npm run site:dev       # http://127.0.0.1:4321/helena-bot/
npm run site:build     # astro build + índice de busca (Pagefind) em site/dist
npm run site:check     # tipos (astro check)
npm run site:verify    # contraste, links, metadados, peso (depois do build)
npm run site:test      # navegador: axe, rolagem lateral, terceiros e os fluxos (depois do build)
```

```
site/
  src/
    pages/             index, wiki/, account/, terms/, privacy/, 404, robots.txt
    layouts/           Base (head, tema, rodapé), Wiki (menu, sumário, busca), Legal
    components/        Header, Footer, home/ (Hero, Pockets, Career, Crime, Commands, Faq, Start), ui/
    islands/           Preact: Simulator, CrimeLab, CommandExplorer, WikiSearch, Account
    lib/               game (tipos dos dados), sim e crime-math (as contas), account, faq, wiki, url, format
    styles/            fonts, tokens (o sistema de design), base, components, prose
    data/game.json     gerado por `npm run site:data` (não edite à mão)
    content/wiki.json  gerado por `npm run wiki:build` (não edite à mão)
    assets/            cartão de exemplo (gerado) e as fontes variáveis (OFL)
    config.ts          links, criadores e chaves públicas
  public/              favicon, ícone do iPhone e imagem de compartilhamento
  scripts/             contrast.mjs, verify.mjs, build-icons.mjs
  tests/e2e/           Playwright (Edge nesta máquina, Chromium no CI)
scripts/site/          geradores que leem o bot: dados, cartão de exemplo e wiki
```

- **No ar:** https://helenacry.github.io/helena-bot/. O workflow `.github/workflows/pages.yml` confere (tipos, build, `verify`, testes de navegador) e publica `site/dist` a cada mudança relevante na `main`; só publica se tudo passar. Os testes do bot rodam num job à parte. O endereço vem de `config/site.mjs`, o mesmo arquivo que o bot lê: trocar para `helena.is-a.bot` é mudar uma linha lá (o `base` do Astro acompanha).
- **Identidade:** o livro-caixa. Papel lilás e tinta quase preta, recibo de papel térmico, carimbos e a pelúcia preta da Helena (redesenhada em vetor a partir da foto de perfil) como logotipo. Violeta elétrico para marca e ação, rosa para carinho, dourado só para dinheiro, verde para renda e vermelho para risco. Tema claro e escuro (segue o sistema; o botão do cabeçalho guarda a escolha em `helena-theme`). Tipografia: Bricolage Grotesque (títulos), Instrument Sans (texto) e Martian Mono (comandos, números e recibos), **todas hospedadas no próprio site** (nenhum visitante tem o IP enviado ao Google).
- **Cores e contraste:** todas ficam em `site/src/styles/tokens.css` (oklch, pares `light-dark()`). `npm run site:verify` mede o contraste WCAG de **70 pares** de texto e fundo nos dois temas e falha abaixo de 4,5:1 (texto) ou 3:1 (texto grande e controles). `tests/site.test.mjs` falha se aparecer cor hexadecimal solta fora dos tokens.
- **A conversa de exemplo e o laboratório do crime** (`islands/Simulator.tsx`, `islands/CrimeLab.tsx`) usam as regras e os textos reais do bot: `lib/sim.ts` e `lib/crime-math.ts` leem `data/game.json` (gerado do código) e `tests/site-sim.test.mjs` confere os números contra o bot (inclusive a média por milhares de sorteios) e confere que cada título e linha do recibo das respostas ainda existe nos comandos. As respostas de exemplo têm o desenho das de verdade ([Desenho das respostas do bot](bot-design.md)): a seção com o ícone no topo, a pelúcia do humor, o recibo em bloco de código (`receipt()` em `lib/sim.ts` é a mesma regra de `utils/receipt.mjs`, e o teste compara as duas), as cores das barras (`--embed-*` em `tokens.css`, conferidas contra `HELENA_COLORS`) e o rodapé. As imagens são as de `site/public/bot/` (`npm --prefix site run bot-images`); o recibo usa a fonte de código do sistema, mais estreita que a do site, para caber no celular.
- **Links, criadores e chaves:** `site/src/config.ts`. O convite e o servidor oficial estão lá; os criadores (`@matheustonon1`, `@agorismo`) e a organização (`helenacry`) aparecem no rodapé e nos contatos dos termos e da privacidade. `codeUrl` (link do repositório) está vazio e o item some do rodapé enquanto não for preenchido.
- **Termos e privacidade:** `site/src/pages/terms/` e `privacy/` são texto escrito à mão para a Helena (versão 2.0, revisada em 22/10/2026: veja as [Notas jurídicas](legal-notes.md), com as normas em que se apoiam e as decisões que ainda faltam). Os prazos (sessão de 6 horas, até 5 sessões, 90 dias do registro) são lidos de `config/web.mjs` na hora do build, não digitados. O `npm test` falha se surgir uma tabela nova no banco sem ser descrita na política, se o site gravar uma chave nova no navegador sem citá-la, se uma página falar com domínio que a política não cita, ou se o sumário não bater com as seções. Ao mudar o que o bot guarda, mude o texto e o número da versão no topo das duas páginas. Não é aconselhamento jurídico: vale uma revisão de quem entende de LGPD.
- **Números e comandos:** rode `npm run site:data` depois de criar, renomear ou remover comandos, empregos, itens, conquistas ou mexer nas regras do crime, da lavagem, do daily ou da energia. O script lê o bot de verdade (com um banco temporário, sem tocar em `data/`). Comandos de `admin/` e `dev/` não aparecem. O `npm test` falha se `site/src/data/game.json` ficar para trás.
- **Movimento:** tudo nasce no estado final e visível; as animações de entrada só rodam com `prefers-reduced-motion: no-preference`. Sem JS ou com movimento reduzido, a página está completa e parada.
- **Imagens:** o cartão de exemplo NÃO é desenhado à mão: `npm run site:card` o gera com o mesmo gerador do `/perfil` (`services/social/profile-card.mjs`), com uma jogadora fictícia e a foto da Helena (`assets/helena_pfp.png`, que também vira o avatar da conversa). O Astro otimiza (WebP, no tamanho usado). O ícone do iPhone e a imagem de compartilhamento saem de `npm --prefix site run icons`. As imagens de perfil (avatar do bot, avatar da organização no GitHub e ícone do servidor, 1024 x 1024, mais o banner do app no Discord, 1500 x 500) saem de `npm --prefix site run profiles` e ficam em `docs/assets/brand/`; o mesmo comando regrava `assets/helena_pfp.png` como o avatar do bot, então depois de rodá-lo gere o cartão de novo com `npm run site:card`.
- **Orçamento de peso (conferido no `verify`):** home com até 60 KB de JS e 30 KB de CSS (gzip), no máximo 2 fontes pré-carregadas e nenhuma imagem acima de 220 KB. Hoje: cerca de 20 KB de JS e 10 KB de CSS.
- **Skills do Claude Code** (em `.claude/skills/`, só na sua máquina porque `.claude/` está no `.gitignore`): `front-sem-cara-de-ia` (identidade e o que evitar), `ui-ux-craft` (método de UI/UX), `web-quality-gates` (acessibilidade, desempenho, SEO e privacidade com números), `astro-static-site` (as convenções desta stack), `pt-br-product-writing` (voz e microtexto) e `node-backend-hardening` (backend).

## Wiki

A wiki fica em `wiki/` (um `.md` por página, no estilo da wiki da Alfacusa) e é publicada junto com o site, em `/wiki/`. O `npm run wiki:build` converte os `.md` em `site/src/content/wiki.json`, que **é inteiro gerado: não edite à mão**; o Astro o desenha (menu, sumário, anterior e próxima, busca). O `npm test` falha se o arquivo ficar para trás.

```
wiki/
  nav.mjs             o menu: seções e páginas, na ordem
  index.md            a página inicial
  <seção>/<página>.md uma página (cabeçalho com title e description)
scripts/site/
  wiki-markdown.mjs   o conversor de Markdown (títulos, listas, tabelas, avisos, cartões)
  wiki-values.mjs     os números e tabelas que vêm do bot
  wiki-pages.mjs      monta as páginas: links, âncoras, vizinhas (sem HTML de moldura)
  wiki-generate.mjs   junta tudo (usado pelo build e pelos testes)
  build-wiki.mjs      grava site/src/content/wiki.json
```

- **Números do bot.** Nunca escreva à mão um valor que existe no código. Use `{{v:crime.cooldown}}` no texto ou uma tabela como `{{table:jobs}}`, e o valor sai do bot quando a página é gerada. Os nomes disponíveis estão em `scripts/site/wiki-values.mjs`; um nome que não existe faz o build falhar.
- **Avisos e cartões.** `> [!TIP]`, `> [!NOTE]`, `> [!WARNING]`, `> [!MONEY]` e `> [!EXAMPLE]` viram caixas coloridas. `{{cards: seção/página, ...}}` monta a lista de páginas.
- **Links.** `[texto](wiki:seção/página#âncora)` leva a outra página da wiki e `[texto](site:terms/)` leva a uma página do site (as permitidas estão em `SITE_PAGES`, em `scripts/site/wiki-pages.mjs`). Link ou âncora que não existe faz o build falhar.
- **Nova página.** Crie o `.md`, ponha o nome em `wiki/nav.mjs` e rode `npm run wiki:build`. Os nomes de arquivo e de pasta são em inglês, em kebab-case, como no resto do projeto.
- **O teste de cobertura.** Todo comando público do bot precisa ser citado em alguma página. Criou um comando? O `npm test` falha até a wiki falar dele.
- **Busca.** [Pagefind](https://pagefind.app): o índice é gerado no build a partir do HTML (em `site/dist/pagefind`) e só baixa quando a pessoa abre a busca (tecla `/` ou `Ctrl+K`). No servidor de desenvolvimento ela avisa que só existe no site publicado; para testar, use `npm run site:build` e `npm --prefix site run preview`.
- **O que a wiki não cobre ainda.** O painel da conta do site e as páginas de administração (`/admin*`, `/dev*`) não entram: o painel só vai à wiki quando for ligado.

O visual vem de `site/src/styles/prose.css` e de `site/src/layouts/Wiki.astro`. Sem JavaScript, a wiki continua inteira (o menu vira uma gaveta nativa no celular e a busca fica de fora).
