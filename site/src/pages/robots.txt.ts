// robots.txt gerado com o endereço de config/site.mjs (muda sozinho quando o domínio próprio entrar).
import type { APIRoute } from "astro";

import { absolute } from "../lib/url";

export const GET: APIRoute = ({ site }) => {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /account/",
    "",
    `Sitemap: ${absolute("/sitemap-index.xml", site)}`,
    ""
  ].join("\n");

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
