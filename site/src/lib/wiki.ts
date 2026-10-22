// Conteúdo da wiki, gerado por `npm run wiki:build` (wiki/*.md + números do bot)
// em src/content/wiki.json. Não edite o JSON à mão.
import raw from "../content/wiki.json" with { type: "json" };

export interface Heading {
  level: 2 | 3;
  id: string;
  text: string;
}

export interface Neighbour {
  id: string;
  path: string;
  title: string;
}

export interface WikiPage {
  /** "index" para a página inicial; "economy/market" para as outras. */
  id: string;
  /** Endereço a partir da raiz do site, sem o subcaminho do GitHub Pages. */
  path: string;
  title: string;
  description: string;
  section: { id: string; title: string } | null;
  /** HTML do corpo; links começam em "/" (use withBase). */
  html: string;
  headings: Heading[];
  previous: Neighbour | null;
  next: Neighbour | null;
}

export interface WikiSection {
  id: string;
  title: string;
  pages: string[];
}

interface Wiki {
  nav: WikiSection[];
  pages: WikiPage[];
}

export const wiki = raw as unknown as Wiki;

const byId = new Map(wiki.pages.map(page => [page.id, page]));

export const pageById = (id: string): WikiPage => {
  const page = byId.get(id);
  if (!page) throw new Error(`Página da wiki não existe: ${id}`);
  return page;
};

/** Seções do menu já com o título de cada página. */
export const menu = wiki.nav.map(section => ({
  ...section,
  items: section.pages.map(id => ({ id, path: pageById(id).path, title: pageById(id).title }))
}));
