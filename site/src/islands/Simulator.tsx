/** A conversa de exemplo: dá para usar os comandos de verdade do bot, com as regras e os textos reais. */
import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";

import {
  COMMANDS,
  COOLDOWN_LABEL,
  availability,
  initialState,
  isJailed,
  remainingSeconds,
  run,
  type Command,
  type Embed,
  type Reply,
  type SimState
} from "../lib/sim.ts";
import { clock } from "../lib/format.ts";

import "./simulator.css";

export interface SimulatorProps {
  card: { src: string; width: number; height: number };
  avatar: { src: string; width: number; height: number };
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

function Lines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <span class="sim-line" key={index}>{line === "" ? <br /> : rich(line)}</span>
      ))}
    </>
  );
}

function EmbedView({ embed, remaining }: { embed: Embed; remaining: number | null }) {
  return (
    <div class={`sim-embed accent-${embed.accent}`}>
      <p class="sim-embed-title">{embed.title}</p>
      <p class="sim-embed-desc"><Lines text={embed.description} /></p>
      <dl class="sim-fields">
        {embed.fields.map(field => {
          const live = remaining !== null && field.name.startsWith("⏳ Tempo restante");

          return (
            <div class={field.inline ? "sim-field" : "sim-field wide"} key={field.name}>
              <dt>{field.name}</dt>
              <dd aria-live={live ? "off" : undefined}>
                <Lines text={live ? `**${clock(remaining)}**` : field.value} />
              </dd>
            </div>
          );
        })}
      </dl>
      <p class="sim-embed-foot">{embed.footer}</p>
    </div>
  );
}

function Controls({ reply }: { reply: Extract<Reply, { kind: "embed" }> }) {
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

export default function Simulator({ card, avatar }: SimulatorProps) {
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
                    <EmbedView embed={message.reply.embed} remaining={message.reply.live === "jail" ? remaining : null} />
                    <Controls reply={message.reply} />
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
