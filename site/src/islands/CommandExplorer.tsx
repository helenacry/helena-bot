/** Todos os comandos públicos do bot, com busca e filtro por categoria. Renderiza completo no HTML (SEO e sem JS) e filtra no navegador. */
import { useMemo, useState } from "preact/hooks";

import type { Category } from "../lib/game.ts";

import "./explorer.css";

interface Props {
  categories: Category[];
}

const plain = (text: string): string =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function CommandExplorer({ categories }: Props) {
  const [category, setCategory] = useState("todos");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState("");

  const all = useMemo(
    () => categories.flatMap(group => group.commands.map(command => ({ ...command, category: group.id, label: group.label, emoji: group.emoji }))),
    [categories]
  );

  const wanted = plain(query).replace(/^\//, "").trim();

  const shown = all.filter(entry => {
    if (category !== "todos" && entry.category !== category) return false;
    if (!wanted) return true;
    return plain([entry.name, ...entry.aliases, entry.description].join(" ")).includes(wanted);
  });

  async function copy(name: string) {
    const text = `/${name}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(name);
      window.setTimeout(() => setCopied(current => (current === name ? "" : current)), 1800);
    } catch {
      setCopied("");
    }
  }

  return (
    <div class="explorer">
      <div class="ex-tools">
        <div class="ex-search">
          <label class="sr-only" for="ex-q">Buscar comando</label>
          <input
            id="ex-q"
            type="search"
            placeholder="Buscar pelo nome ou pelo que faz"
            autocomplete="off"
            spellcheck={false}
            value={query}
            onInput={event => setQuery((event.currentTarget as HTMLInputElement).value)}
          />
        </div>

        <div class="ex-chips" role="group" aria-label="Filtrar por categoria">
          {[{ id: "todos", label: "Todos", emoji: "", count: all.length }, ...categories.map(group => ({ id: group.id, label: group.label, emoji: group.emoji, count: group.commands.length }))].map(chip => (
            <button
              key={chip.id}
              type="button"
              class="ex-chip"
              aria-pressed={category === chip.id}
              onClick={() => setCategory(chip.id)}
            >
              {chip.label} <small class="tabular">{chip.count}</small>
            </button>
          ))}
        </div>
      </div>

      <p class="ex-count" role="status" aria-live="polite">
        {shown.length === all.length ? `${all.length} comandos` : `${shown.length} de ${all.length} comandos`}
      </p>

      {shown.length === 0 ? (
        <p class="ex-empty">Nenhum comando combina com essa busca. Tente só um pedaço do nome, como <code>sal</code>.</p>
      ) : (
        <ul class="ex-list" role="list">
          {shown.map(entry => (
            <li key={entry.name}>
              <button type="button" class="ex-item" onClick={() => copy(entry.name)}>
                <span class="ex-name">/{entry.name}</span>
                <span class="ex-desc">{entry.description}</span>
                <span class="ex-meta">
                  <span class="ex-cat">{entry.label}</span>
                  {entry.aliases.length > 0 && <span class="ex-alias">também {entry.aliases.map(alias => `/${alias}`).join(" ")}</span>}
                </span>
                <span class="ex-copy" aria-hidden="true">{copied === entry.name ? "copiado" : "copiar"}</span>
                <span class="sr-only">, copiar comando</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p class="sr-only" role="status" aria-live="polite">{copied ? `Copiado: /${copied}` : ""}</p>
    </div>
  );
}
