/** A conversa de exemplo: dá para usar os comandos de verdade do bot, com as regras e os textos reais. */
import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

import {
  COMMANDS,
  COOLDOWN_LABEL,
  availability,
  initialState,
  isJailed,
  jobOption,
  pickJob,
  remainingSeconds,
  run,
  type Command,
  type Embed,
  type Reply,
  type SimState
} from "../lib/sim.ts";
import { span } from "../lib/format.ts";
import { receipt } from "../lib/sim.ts";

import "./simulator.css";

export interface SimulatorProps {
  card: { src: string; width: number; height: number };
  avatar: { src: string; width: number; height: number };
  /** A pasta das imagens do bot (a pelúcia de cada humor e o ícone), com a barra no fim. */
  bot: string;
  /** O painel da conta, para onde o botão "Coletar no site" do /daily leva. */
  account: string;
}

interface Message {
  id: number;
  command: Command;
  /** undefined = o bot ainda está "digitando". */
  reply?: Reply;
}

const PRETTY: Record<Command, string> = {
  perfil: "/perfil",
  daily: "/daily",
  trabalhar: "/trabalhar",
  loja: "/loja",
  crime: "/crime",
  prisao: "/prisao"
};

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** **negrito** e `código`, sem innerHTML. */
function rich(text: string): ComponentChildren[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map(part => {
    if (part.startsWith("**")) return <strong>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code>{part.slice(1, -1)}</code>;
    return part;
  });
}

/** Uma linha por linha: "> " é citação, "-# " é letra pequena e "### " é título, como no chat. */
function Lines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => {
        if (line === "") return <span class="sim-line" key={index}><br /></span>;
        if (line.startsWith("### ")) return <span class="sim-line head" key={index}>{rich(line.slice(4))}</span>;
        if (line.startsWith("> ")) return <span class="sim-line quote" key={index}>{rich(line.slice(2))}</span>;
        if (line.startsWith("-# ")) return <span class="sim-line small" key={index}>{rich(line.slice(3))}</span>;
        return <span class="sim-line" key={index}>{rich(line)}</span>;
      })}
    </>
  );
}

/** O recibo é um bloco de código; para quem ouve a tela, uma frase por conta, sem o pontilhado. */
function Receipt({ rows, remaining }: { rows: Embed["rows"]; remaining: number | null }) {
  const shown = rows.map(row => (row !== null && remaining !== null && row[0] === "Tempo restante" ? ([row[0], span(remaining)] as const) : row));
  const lines = receipt(shown);

  if (!lines.length) return null;

  const spoken = shown.filter(row => row !== null).map(row => `${row[0]}: ${row[1]}`).join("; ");

  // A fonte acompanha a largura da caixa e o tamanho da linha mais comprida (veja .sim-receipt).
  const columns = Math.max(...lines.map(line => [...line].length));

  return (
    <pre class="sim-receipt" role="img" aria-label={spoken} style={`--cols: ${columns}`}>
      {lines.join("\n")}
    </pre>
  );
}

function EmbedView({ embed, remaining, bot }: { embed: Embed; remaining: number | null; bot: string }) {
  return (
    <div class={`sim-embed accent-${embed.accent}${embed.plain ? " plain" : ""}`}>
      {embed.plain ? (
        <p class="sim-embed-title">{embed.title}</p>
      ) : (
        <div class="sim-embed-head">
          <div class="sim-embed-top">
            <p class="sim-author">
              <img src={`${bot}helena.png`} width={128} height={128} alt="" />
              <span>HELENA · {embed.section.toUpperCase()}</span>
            </p>
            <p class="sim-embed-title">{embed.title}</p>
          </div>

          <img class="sim-thumb" src={`${bot}mood-${embed.mood}.png`} width={256} height={256} alt="" />
        </div>
      )}

      <p class="sim-embed-desc"><Lines text={embed.say} /></p>

      <Receipt rows={embed.rows} remaining={remaining} />

      {embed.note && <p class="sim-embed-desc"><Lines text={`-# ${embed.note}`} /></p>}

      {embed.fields.length > 0 && (
        <dl class="sim-fields">
          {embed.fields.map(field => (
            <div class={field.inline ? "sim-field" : "sim-field wide"} key={field.name}>
              <dt>{field.name}</dt>
              <dd><Lines text={field.value} /></dd>
            </div>
          ))}
        </dl>
      )}

      {!embed.plain && (
        <p class="sim-embed-foot">
          <img src={`${bot}helena.png`} width={128} height={128} alt="" />
          <span>{embed.footer}</span>
        </p>
      )}
    </div>
  );
}

interface ControlsProps {
  reply: Extract<Reply, { kind: "embed" }>;
  account: string;
  /** Já tem emprego: o menu de empregos de uma mensagem antiga não escolhe mais nada. */
  employed: boolean;
  onPick: () => void;
}

function Controls({ reply, account, employed, onPick }: ControlsProps) {
  if (reply.link) {
    return (
      <div class="sim-comps">
        <div class="sim-row">
          <a class="sim-btn link" href={account}>
            <span aria-hidden="true">{reply.link.emoji}</span> {reply.link.label} <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    );
  }

  // O menu de verdade: um <select> (teclado e leitor de tela de graça). Escolher vale na hora.
  if (reply.picker) {
    const option = jobOption();

    return (
      <div class="sim-comps">
        <select
          class="sim-select"
          aria-label="Escolha uma profissão"
          disabled={employed}
          onChange={event => {
            if ((event.currentTarget as HTMLSelectElement).value) onPick();
          }}
        >
          <option value="" selected>Escolha uma profissão</option>
          <option value="job">{option.label} · {option.description}</option>
        </select>
      </div>
    );
  }

  if (reply.shop) {
    return (
      <div class="sim-comps" aria-hidden="true">
        <div class="sim-select">📂 Escolha uma prateleira</div>
        <div class="sim-row">
          <span class="sim-btn ok">🍎 1. Maçã</span>
          <span class="sim-btn ok">☕ 2. Café</span>
          <span class="sim-btn">⚡ 3. Energético</span>
        </div>
        <div class="sim-row">
          <span class="sim-btn off">◀️ Anterior</span>
          <span class="sim-btn off">1/1</span>
          <span class="sim-btn off">▶️ Próxima</span>
        </div>
        <div class="sim-row">
          <span class="sim-btn primary">🏠 Início</span>
          <span class="sim-btn primary">🔎 Por nome</span>
          <span class="sim-btn ok">💰 Vender</span>
          <span class="sim-btn danger">✖️ Fechar</span>
        </div>
      </div>
    );
  }

  if (reply.escape) {
    return (
      <div class="sim-comps" aria-hidden="true">
        <div class="sim-row"><span class="sim-btn danger">🏃 Tentar fuga</span></div>
      </div>
    );
  }

  return null;
}

export default function Simulator({ card, avatar, bot, account }: SimulatorProps) {
  const [sim, setSim] = useState<SimState>(initialState);
  const [messages, setMessages] = useState<Message[]>([{ id: 1, command: "perfil", reply: { kind: "card" } }]);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const nextId = useRef(2);
  const timers = useRef<number[]>([]);

  // Relógio da cadeia: só corre enquanto existe pena em curso.
  const jailed = now > 0 && isJailed(sim, now);

  useEffect(() => {
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (!jailed) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [jailed]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  // Mantém a última resposta à vista, só dentro da caixa da conversa (e não na
  // primeira pintura, para a conversa abrir no começo).
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }

    const box = log.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [messages]);

  function send(command: Command) {
    if (busy) return;

    const stamp = Date.now();
    const { state: after, reply } = run(sim, command, stamp);
    const id = nextId.current++;

    setNow(stamp);
    setBusy(true);
    setMessages(list => [...list, { id, command }]);

    const wait = reducedMotion() ? 0 : 650;

    timers.current.push(
      window.setTimeout(() => {
        setSim(after);
        setMessages(list => list.map(message => (message.id === id ? { ...message, reply } : message)));
        setBusy(false);
      }, wait)
    );
  }

  // Escolher no menu de empregos edita a própria mensagem (sem "digitando"), como o Discord faz.
  function pick(id: number) {
    if (busy || sim.employed) return;

    const { state: after, reply } = pickJob(sim);

    setSim(after);
    setMessages(list => list.map(message => (message.id === id ? { ...message, reply } : message)));
  }

  function reset() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setSim(initialState());
    setMessages([{ id: nextId.current++, command: "perfil", reply: { kind: "card" } }]);
    setBusy(false);
  }

  const remaining = jailed ? remainingSeconds(sim, now) : null;

  return (
    <div class="sim" role="group" aria-label="Conversa de exemplo com a Helena">
      <div class="sim-bar">
        <span class="sim-channel"># geral</span>
        <span class="sim-tag">exemplo com as regras reais</span>
      </div>

      <div class="sim-log" ref={log} role="log" aria-live="polite" aria-relevant="additions" tabIndex={0} aria-label="Mensagens">
        {messages.map(message => (
          <div class="sim-group" key={message.id}>
            <div class="sim-msg">
              <span class="sim-avatar user" aria-hidden="true">J</span>
              <div class="sim-body">
                <div class="sim-meta"><b>jogadora</b> usou <span class="sim-slash">{PRETTY[message.command]}</span></div>
              </div>
            </div>

            <div class="sim-msg">
              <img class="sim-avatar" src={avatar.src} width={40} height={40} alt="" />
              <div class="sim-body">
                <div class="sim-meta"><b>Helena</b><span class="sim-bot">BOT</span></div>

                {message.reply === undefined && (
                  <p class="sim-typing" aria-label="A Helena está digitando">
                    <i /><i /><i />
                  </p>
                )}

                {message.reply?.kind === "card" && (
                  <figure class="sim-card">
                    <img
                      src={card.src}
                      width={card.width}
                      height={card.height}
                      alt="Cartão de perfil da Helena: posição no ranking, estado civil, nível, foto, título, bio e os valores de banco, gemas, carteira, arma e emprego."
                    />
                  </figure>
                )}

                {message.reply?.kind === "embed" && (
                  <>
                    <EmbedView embed={message.reply.embed} remaining={message.reply.live === "jail" ? remaining : null} bot={bot} />
                    <Controls reply={message.reply} account={account} employed={sim.employed} onPick={() => pick(message.id)} />
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div class="sim-composer">
        <p class="sim-hint" id="sim-hint">Toque em um comando. O dinheiro, a energia e a cadeia valem até você recomeçar.</p>
        <div class="sim-chips" role="group" aria-describedby="sim-hint" aria-label="Comandos">
          {COMMANDS.map(command => {
            const state = availability(sim, command, now);
            const hidden = command === "prisao" && !jailed;
            const disabled = busy || !state.ok;

            return hidden ? null : (
              <button
                key={command}
                type="button"
                class="sim-chip"
                disabled={disabled}
                title={!state.ok ? state.why : undefined}
                onClick={() => send(command)}
              >
                {PRETTY[command]}
                {state.ok === false && command !== "prisao" && COOLDOWN_LABEL[command] ? <small>{COOLDOWN_LABEL[command]}</small> : null}
              </button>
            );
          })}
          <button type="button" class="sim-chip ghost" onClick={reset} aria-label="Recomeçar o exemplo">↺ recomeçar</button>
        </div>
      </div>
    </div>
  );
}
