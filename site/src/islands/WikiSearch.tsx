/** Busca da wiki com o Pagefind: o índice é gerado no build (site/dist/pagefind) e só baixa quando a pessoa abre a busca. */
import { useEffect, useRef, useState } from "preact/hooks";

import "./search.css";

interface Props {
  /** Endereço-base do site, com barra no fim ("/helena-bot/"). */
  base: string;
  idSuffix?: string;
}

interface Hit {
  url: string;
  title: string;
  section: string;
  excerpt: string;
}

interface PagefindResult {
  data: () => Promise<{ url: string; excerpt: string; meta: { title?: string; section?: string } }>;
}

interface PagefindModule {
  options: (options: { baseUrl: string }) => Promise<void>;
  init: () => Promise<void>;
  debouncedSearch: (query: string, options?: object, wait?: number) => Promise<{ results: PagefindResult[] } | null>;
}

let loading: Promise<PagefindModule | null> | null = null;

function loadPagefind(base: string): Promise<PagefindModule | null> {
  loading ??= (async () => {
    try {
      const module = (await import(/* @vite-ignore */ `${base}pagefind/pagefind.js`)) as PagefindModule;
      await module.options({ baseUrl: base });
      await module.init();
      return module;
    } catch {
      return null;
    }
  })();

  return loading;
}

const decoder = typeof document === "undefined" ? null : document.createElement("textarea");

/** O trecho do Pagefind vem escapado e com <mark>; aqui só o <mark> sobrevive. */
function excerptParts(html: string) {
  return html.split(/(<mark>.*?<\/mark>)/g).filter(Boolean).map(part => {
    const marked = part.startsWith("<mark>");
    const raw = marked ? part.slice(6, -7) : part;
    let text = raw.replace(/<[^>]+>/g, "");

    if (decoder) {
      decoder.innerHTML = text;
      text = decoder.value;
    }

    return marked ? <mark>{text}</mark> : text;
  });
}

/** Padrão ARIA de combobox com lista. O tipo do Preact pede um <datalist> para esse papel, então vai por spread. */
const comboboxAttributes = (expanded: boolean, listId: string, activeId: string | undefined): Record<string, unknown> => ({
  role: "combobox",
  "aria-expanded": expanded,
  "aria-controls": listId,
  "aria-activedescendant": activeId,
  "aria-autocomplete": "list"
});

const isTyping = (target: EventTarget | null) => {
  const node = target as HTMLElement | null;
  return Boolean(node && (node.isContentEditable || /^(input|textarea|select)$/i.test(node.tagName)));
};

export default function WikiSearch({ base, idSuffix = "" }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [active, setActive] = useState(0);

  const open = () => {
    dialog.current?.showModal();
    void loadPagefind(base).then(module => { if (!module) setStatus("error"); });
  };

  // "/" e Ctrl+K abrem a busca. Duas cópias da ilha existem (menu de computador e de
  // celular); só a que está visível responde.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const visible = root.current && root.current.getClientRects().length > 0;
      if (!visible) return;

      const combo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && !isTyping(event.target) && !event.ctrlKey && !event.metaKey && !event.altKey;

      if (combo || slash) {
        event.preventDefault();
        open();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [base]);

  useEffect(() => {
    const text = query.trim();

    if (text.length < 2) {
      setHits([]);
      setStatus(status === "error" ? "error" : "idle");
      return;
    }

    let current = true;
    setStatus(previous => (previous === "error" ? "error" : "loading"));

    (async () => {
      const module = await loadPagefind(base);

      if (!module) {
        if (current) setStatus("error");
        return;
      }

      const search = await module.debouncedSearch(text, {}, 120);

      if (!search || !current) return;

      const data = await Promise.all(search.results.slice(0, 8).map(result => result.data()));

      if (!current) return;

      setHits(data.map(item => ({
        url: item.url,
        title: item.meta.title ?? item.url,
        section: item.meta.section ?? "Wiki",
        excerpt: item.excerpt
      })));
      setActive(0);
      setStatus("done");
    })();

    return () => { current = false; };
  }, [query, base]);

  const go = (hit: Hit | undefined) => {
    if (hit) window.location.href = hit.url;
  };

  const onInputKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(index => Math.min(hits.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(index => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(hits[active]);
    }
  };

  const listId = `search-list${idSuffix}`;
  const optionId = (index: number) => `search-opt${idSuffix}-${index}`;

  return (
    <div class="ws" ref={root}>
      <button type="button" class="ws-trigger" onClick={open} aria-haspopup="dialog">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4" /></svg>
        <span>Buscar na wiki</span>
        <kbd aria-hidden="true">/</kbd>
      </button>

      <dialog class="ws-dialog" ref={dialog} aria-label="Buscar na wiki" onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}>
        <div class="ws-box">
          <div class="ws-field">
            <label class="sr-only" for={`ws-q${idSuffix}`}>Buscar na wiki</label>
            <input
              id={`ws-q${idSuffix}`}
              ref={input}
              type="search"
              {...comboboxAttributes(hits.length > 0, listId, hits.length > 0 ? optionId(active) : undefined)}
              placeholder="Buscar: daily, roubo, casamento…"
              autocomplete="off"
              spellcheck={false}
              value={query}
              onInput={event => setQuery((event.currentTarget as HTMLInputElement).value)}
              onKeyDown={onInputKey}
            />
            <button type="button" class="ws-close" onClick={() => dialog.current?.close()}>Fechar</button>
          </div>

          <p class="ws-status" role="status" aria-live="polite">
            {status === "loading" && "Procurando…"}
            {status === "done" && (hits.length === 0 ? "Nada encontrado. Tente outra palavra." : `${hits.length} ${hits.length === 1 ? "resultado" : "resultados"}`)}
            {status === "error" && "A busca não carregou. Ela só existe no site publicado, não no servidor de desenvolvimento."}
            {status === "idle" && "Digite pelo menos duas letras."}
          </p>

          <ul class="ws-list" id={listId} role="listbox" aria-label="Resultados">
            {hits.map((hit, index) => (
              <li key={hit.url} id={optionId(index)} role="option" aria-selected={index === active}>
                <a href={hit.url} onMouseEnter={() => setActive(index)}>
                  <span class="ws-section">{hit.section}</span>
                  <b>{hit.title}</b>
                  <span class="ws-excerpt">{excerptParts(hit.excerpt)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </div>
  );
}
