// Serve o site montado (site/dist) com o MESMO servidor de arquivos que o bot usa em produção
// (services/web/static-site.mjs): cabeçalhos, política de conteúdo (CSP), redirecionamentos e 404 saem
// iguais ao que o visitante recebe. Os testes de navegador rodam contra ele, e não contra o
// `astro preview`, para que uma página que a política bloqueia quebre o teste e não o visitante.
//
//   node scripts/serve-dist.mjs [porta]
import http from "node:http";
import { fileURLToPath } from "node:url";

import { createStaticSite } from "../../services/web/static-site.mjs";

const port = Number(process.argv[2] ?? 4322);

const site = await createStaticSite({ root: fileURLToPath(new URL("../dist/", import.meta.url)) });

if (!site.enabled) {
  console.error("site/dist não existe: rode `npm --prefix site run build` antes.");
  process.exit(1);
}

http
  .createServer(async (req, res) => {
    if (!(await site.serve(req, res))) {
      // só a API do bot responde fora do site; aqui não há API
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Sem API neste servidor de teste.");
    }
  })
  .listen(port, "127.0.0.1", () => console.log(`Site de teste em http://127.0.0.1:${port}/`));
