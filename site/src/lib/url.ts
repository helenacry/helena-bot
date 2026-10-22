// O site vive num subcaminho no GitHub Pages (/helena-bot/) e na raiz quando o
// domínio próprio entrar. Todo link interno passa por aqui, nunca "/x" solto.

const base = import.meta.env.BASE_URL.replace(/\/+$/, "");

/** url("/wiki/") -> "/helena-bot/wiki/". Aceita "#ancora" e "?consulta". */
export function url(path = "/"): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(path)) return path;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${base}${clean}`;
}

/** Endereço absoluto público, para canonical, og:url e sitemap. */
export function absolute(path = "/", site: URL | string | undefined): string {
  return new URL(url(path), site ?? "http://localhost").href;
}

/** Em HTML vindo da wiki gerada: href="/x" vira href="/helena-bot/x". */
export function withBase(html: string): string {
  return html.replace(/(href|src)="\/(?!\/)/g, `$1="${base}/`);
}
