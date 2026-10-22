/** Painel da conta: entrar com a VSync, ver os servidores em comum e coletar o daily e as gemas. */
import { useCallback, useEffect, useRef, useState } from "preact/hooks";

import {
  OFFLINE,
  SAMPLE_LADDER,
  buildAuthorizeUrl,
  errorText,
  formatDuration,
  formatMoney,
  parseCallback,
  pkce,
  randomState,
  redirectUri,
  safeImage,
  shortMoney,
  sortGuilds,
  tally,
  waitProgress,
  weekPips,
  type Guild,
  type Me,
  type Session
} from "../lib/account.ts";

import "./account.css";

export interface AccountProps {
  apiUrl: string;
  clientId: string;
  turnstileSiteKey: string;
}

type View =
  | { kind: "boot" }
  | { kind: "off" }
  | { kind: "login"; message?: string }
  | { kind: "busy"; title: string; text: string }
  | { kind: "down"; message: string }
  | { kind: "dashboard" };

interface Result {
  status: number;
  data: Record<string, any>;
}

interface Say {
  text: string;
  kind: "ok" | "bad";
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id: string) => void;
    };
  }
}

const STORAGE_KEY = "helena.session";
const PKCE_KEY = "helena.oauth";

// ---------------------------------------------------------------- armazenamento
// Pode estar bloqueado (janela privada, dados do site bloqueados): nada quebra.
function readJson<T>(storage: Storage, key: string): T | null {
  try {
    return JSON.parse(storage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage, key: string, value: unknown): void {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem armazenamento: o login vale só nesta página */
  }
}

function loadSession(): Session | null {
  const saved = readJson<Session>(window.localStorage, STORAGE_KEY);

  if (saved?.token && saved.expiresAt > Date.now() / 1000) return saved;

  writeJson(window.localStorage, STORAGE_KEY, null);
  return null;
}

// ---------------------------------------------------------------- peças

/** Contagem de verdade: diminui a cada segundo e chama onDone no zero. */
function Clock({ seconds, total, onDone, label }: { seconds: number; total: number; onDone: () => void; label: string }) {
  const [left, setLeft] = useState(Math.ceil(seconds));
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    setLeft(Math.ceil(seconds));

    const timer = window.setInterval(() => {
      setLeft(value => {
        if (value <= 1) {
          window.clearInterval(timer);
          queueMicrotask(() => done.current());
          return 0;
        }

        return value - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [seconds]);

  return (
    <div class="acc-wait">
      <p>{label} <b class="acc-clock tabular" aria-live="off">{formatDuration(left)}</b></p>
      <span class="acc-meter" aria-hidden="true"><i style={`--p:${waitProgress(left, total).toFixed(4)}`} /></span>
    </div>
  );
}

function Avatar({ url, name, size }: { url: string | null; name: string; size: number }) {
  const src = safeImage(url);

  return src ? (
    <img class="acc-avatar" src={src} alt="" width={size} height={size} referrerpolicy="no-referrer" />
  ) : (
    <span class="acc-avatar acc-initial" aria-hidden="true">{(name || "?").trim().charAt(0).toUpperCase()}</span>
  );
}

function Track({ guild, ladder }: { guild: Guild; ladder: readonly number[] }) {
  const pips = weekPips(guild.daily.nextStreak);

  return (
    <ol class="acc-track" aria-label="Dias da sequência, com o prêmio de cada um em reais">
      {pips.map(pip => {
        const prize = ladder[pip.day - 1];
        const spoken = { done: "coletado", next: "é o de hoje", todo: "ainda não" }[pip.state];

        return (
          <li class={`stop ${pip.state}${pip.weekly ? " weekly" : ""}`} key={pip.day} title={`Dia ${pip.day}${pip.weekly ? " (bônus semanal)" : ""}${prize !== undefined ? `: ${formatMoney(prize)}` : ""}`}>
            <i aria-hidden="true" />
            <span aria-hidden="true">{prize !== undefined ? shortMoney(prize) : pip.day}</span>
            <span class="sr-only">Dia {pip.day}{pip.weekly ? ", bônus semanal" : ""}, {spoken}</span>
          </li>
        );
      })}
    </ol>
  );
}

interface RowProps {
  guild: Guild;
  me: Pick<Me, "daily">;
  preview?: boolean;
  busy?: boolean;
  onClaim?: (guild: Guild) => void;
  onRefresh?: () => void;
}

function ServerRow({ guild, me, preview = false, busy = false, onClaim, onRefresh }: RowProps) {
  const { daily } = guild;
  const mode = guild.prison ? "jail" : daily.available ? "ready" : "wait";
  const ladder = me.daily.ladder;

  return (
    <li class={`acc-row ${mode}`}>
      <div class="acc-row-id">
        <Avatar url={guild.icon} name={guild.name} size={46} />
        <div>
          <h3>{guild.name || "Servidor"}</h3>
          {guild.player ? (
            <span class="acc-stats">
              Carteira <b>{formatMoney(guild.player.wallet)}</b> · banco <b>{formatMoney(guild.player.bank)}</b> · nível <b>{guild.player.level}</b>
            </span>
          ) : (
            <span class="acc-stats">Você ainda não jogou aqui</span>
          )}
          <span class="acc-streak">{daily.streak > 0 ? `sequência de ${daily.streak} ${daily.streak === 1 ? "dia" : "dias"}` : "sequência nova"}</span>
        </div>
      </div>

      <Track guild={guild} ladder={ladder} />

      <div class="acc-row-act">
        {mode === "jail" && guild.prison && (
          <p class="acc-jail">Preso, falta <b>{formatDuration(guild.prison.remaining)}</b>. Preso não coleta o daily.</p>
        )}

        {mode === "ready" && (
          <>
            <button
              type="button"
              class="btn btn-primary acc-go"
              disabled={preview || busy}
              tabIndex={preview ? -1 : undefined}
              aria-busy={busy ? "true" : undefined}
              onClick={() => onClaim?.(guild)}
            >
              Resgatar {formatMoney(daily.nextReward.total)}
            </button>
            {daily.nextReward.weeklyBonus > 0 && <span class="acc-note">inclui o bônus semanal</span>}
          </>
        )}

        {mode === "wait" && <Clock seconds={daily.remaining} total={me.daily.cooldown || 86400} onDone={() => onRefresh?.()} label="Próximo resgate em" />}
      </div>
    </li>
  );
}

function Sample() {
  const guild: Guild = {
    id: "exemplo",
    name: "Servidor de exemplo",
    icon: null,
    player: { wallet: 120000, bank: 450000, level: 8 },
    daily: { available: true, remaining: 0, streak: 2, nextStreak: 3, nextReward: { total: SAMPLE_LADDER[2], weeklyBonus: 0 } },
    prison: null
  };

  return (
    <aside class="acc-sample" aria-hidden="true">
      <span class="acc-sample-tag">Exemplo</span>
      <ol class="acc-list"><ServerRow guild={guild} me={{ daily: { cooldown: 86400, ladder: [...SAMPLE_LADDER] } }} preview /></ol>
    </aside>
  );
}

// ---------------------------------------------------------------- ilha

export default function Account({ apiUrl, clientId, turnstileSiteKey }: AccountProps) {
  const api = apiUrl.replace(/\/+$/, "");

  const [view, setView] = useState<View>({ kind: "boot" });
  const [me, setMe] = useState<Me | null>(null);
  const [say, setSay] = useState<Say | null>(null);
  const [claiming, setClaiming] = useState("");

  const session = useRef<Session | null>(null);
  const captchaToken = useRef("");
  const captchaWidget = useRef<string | null>(null);
  const captchaSlot = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const wantsCaptcha = Boolean(me?.captcha && turnstileSiteKey) && view.kind === "dashboard";

  // ---------- chamadas à API ----------
  const call = useCallback(async (path: string, options: { method?: string; body?: unknown } = {}): Promise<Result> => {
    const headers: Record<string, string> = {};

    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (session.current) headers.Authorization = `Bearer ${session.current.token}`;

    try {
      const response = await fetch(api + path, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });

      return { status: response.status, data: await response.json().catch(() => ({})) };
    } catch {
      return { status: 0, data: { error: "offline" } };
    }
  }, [api]);

  const textFor = (result: Result): string =>
    result.data.error === "offline" ? OFFLINE : errorText(result.data.error, result.data);

  const loginScreen = useCallback((message?: string) => {
    setMe(null);
    setView({ kind: "login", message });
  }, []);

  const load = useCallback(async (quiet: boolean) => {
    if (!quiet) setView({ kind: "busy", title: "Carregando…", text: "Buscando os seus servidores." });

    const result = await call("/api/me");

    if (result.status === 401) {
      session.current = null;
      writeJson(window.localStorage, STORAGE_KEY, null);
      loginScreen(errorText(result.data.error));
      return;
    }

    if (result.status !== 200) {
      if (quiet) {
        setSay({ text: textFor(result), kind: "bad" });
        return;
      }

      setView({ kind: "down", message: textFor(result) });
      return;
    }

    setMe(result.data as Me);
    setView({ kind: "dashboard" });
  }, [call, loginScreen]);

  const signOut = useCallback((message?: string) => {
    if (session.current) void call("/api/auth/logout", { method: "POST" });

    session.current = null;
    setSay(null);
    writeJson(window.localStorage, STORAGE_KEY, null);
    loginScreen(message);
  }, [call, loginScreen]);

  const finishLogin = useCallback(async (params: ReturnType<typeof parseCallback>) => {
    const saved = readJson<{ state: string; verifier: string }>(window.sessionStorage, PKCE_KEY);

    writeJson(window.sessionStorage, PKCE_KEY, null);
    // limpa o ?code=...&state=... do endereço
    window.history.replaceState(null, "", window.location.pathname);

    if (params.error) {
      loginScreen(params.error === "access_denied" ? "Login cancelado. Você pode tentar de novo quando quiser." : errorText("login_failed"));
      return;
    }

    if (!saved?.state || saved.state !== params.state) {
      loginScreen("Não consegui confirmar este login (o endereço não bate com o pedido). Tente de novo.");
      return;
    }

    setView({ kind: "busy", title: "Entrando…", text: "Falando com a VSync." });

    const result = await call("/api/auth/login", {
      method: "POST",
      body: { code: params.code, codeVerifier: saved.verifier, redirectUri: redirectUri(window.location) }
    });

    if (result.status === 200 && result.data.token) {
      session.current = { token: result.data.token, expiresAt: result.data.expiresAt };
      writeJson(window.localStorage, STORAGE_KEY, session.current);
      setSay(null);
      void load(false);
      return;
    }

    loginScreen(textFor(result));
  }, [call, load, loginScreen]);

  // ---------- começo ----------
  useEffect(() => {
    if (!api) {
      setView({ kind: "off" });
      return;
    }

    const params = parseCallback(window.location.search);

    if (params.code || params.error) {
      void finishLogin(params);
      return;
    }

    session.current = loadSession();

    if (session.current) void load(false);
    else loginScreen();
  }, []);

  // O foco vai para o título quando a tela troca (quem usa leitor de tela ouve onde está).
  useEffect(() => {
    if (view.kind !== "boot") heading.current?.focus({ preventScroll: true });
  }, [view.kind]);

  // ---------- anti-robô (Turnstile): carregado só quando a API pede ----------
  useEffect(() => {
    if (!wantsCaptcha || captchaWidget.current !== null || !captchaSlot.current) return;

    const draw = () => {
      if (captchaWidget.current !== null || !window.turnstile || !captchaSlot.current) return;

      captchaWidget.current = window.turnstile.render(captchaSlot.current, {
        sitekey: turnstileSiteKey,
        theme: "auto",
        language: "pt-br",
        callback: (token: string) => { captchaToken.current = token; },
        "expired-callback": () => { captchaToken.current = ""; },
        "error-callback": () => { captchaToken.current = ""; }
      });
    };

    if (window.turnstile) {
      draw();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = draw;
    document.head.append(script);
  }, [wantsCaptcha, turnstileSiteKey]);

  // ---------- ações ----------
  async function startLogin() {
    const codes = await pkce();
    const token = randomState();

    writeJson(window.sessionStorage, PKCE_KEY, { state: token, verifier: codes.verifier });

    window.location.assign(buildAuthorizeUrl({ clientId, redirectUri: redirectUri(window.location), state: token, challenge: codes.challenge }));
  }

  /** Coleta (daily ou gemas): confere o anti-robô, chama a API e atualiza. */
  async function collect(key: string, path: string, body: Record<string, unknown>, okText: (data: any) => string) {
    if (me?.captcha) {
      if (!captchaToken.current) {
        setSay({ text: errorText("captcha_required"), kind: "bad" });
        return;
      }

      body.turnstile = captchaToken.current;
    }

    setClaiming(key);
    const result = await call(path, { method: "POST", body });
    setClaiming("");

    // o desafio vale uma vez: pede outro para a próxima coleta
    captchaToken.current = "";
    if (captchaWidget.current !== null) window.turnstile?.reset(captchaWidget.current);

    if (result.status === 401) {
      signOut(errorText(result.data.error));
      return;
    }

    setSay(result.status === 200 ? { text: okText(result.data), kind: "ok" } : { text: textFor(result), kind: "bad" });
    void load(true);
  }

  const refreshQuietly = useCallback(() => { void load(true); }, [load]);

  // ---------- telas ----------
  const captchaBox = (
    <section class="acc-box acc-captcha" hidden={!wantsCaptcha}>
      <p class="acc-small">Antes de coletar, confirme que você não é um robô:</p>
      <div ref={captchaSlot} />
    </section>
  );

  if (view.kind === "boot") {
    return <p class="acc-small" role="status">Carregando o painel…</p>;
  }

  if (view.kind === "off") {
    return (
      <section class="acc-box acc-notice">
        <h1 ref={heading} tabIndex={-1}>Painel indisponível</h1>
        <p>O painel da conta ainda não foi ligado. Enquanto isso, resgate o daily com o comando <code>/daily</code>, direto na VSync.</p>
      </section>
    );
  }

  if (view.kind === "busy") {
    return (
      <section class="acc-box acc-notice" aria-busy="true">
        <h1 ref={heading} tabIndex={-1}>{view.title}</h1>
        <p role="status">{view.text}</p>
      </section>
    );
  }

  if (view.kind === "down") {
    return (
      <section class="acc-box acc-notice">
        <h1 ref={heading} tabIndex={-1}>Fora do ar</h1>
        <p role="alert">{view.message}</p>
        <button type="button" class="btn btn-primary" onClick={() => void load(false)}>Tentar de novo</button>
      </section>
    );
  }

  if (view.kind === "login") {
    return (
      <div class="acc-login-wrap">
        <section class="acc-login">
          <span class="label">Painel do jogador</span>
          <h1 ref={heading} tabIndex={-1}>Pegue o seu daily e as suas gemas</h1>
          <p class="acc-lede">
            Entre com a sua conta da VSync para resgatar a recompensa diária nos servidores onde a Helena está e coletar gemas, que valem em todos eles.
          </p>
          {view.message && <p class="acc-warn" role="alert">{view.message}</p>}
          <button type="button" class="btn btn-primary" onClick={() => void startLogin()}>Entrar com a VSync</button>
          <ul class="acc-facts">
            <li>A Helena vê só o seu nome, o seu avatar e a lista dos seus servidores.</li>
            <li>Ela nunca recebe a sua senha, e o acesso que a VSync dá é devolvido assim que você entra.</li>
            <li>A sessão dura 6 horas. Sair encerra tudo.</li>
          </ul>
        </section>
        <Sample />
      </div>
    );
  }

  // painel
  const data = me!;
  const guilds = sortGuilds(data.guilds);
  const totals = tally(guilds);
  const gems = data.gems;

  return (
    <>
      {captchaBox}

      <section class="acc-sheet">
        <div class="acc-who">
          <Avatar url={data.user.avatarUrl} name={data.user.displayName} size={76} />
          <div class="acc-who-text">
            <span class="label">Painel do jogador</span>
            <h1 ref={heading} tabIndex={-1}>{data.user.displayName || data.user.username}</h1>
            <span class="acc-handle">@{data.user.username}</span>
          </div>
          <button type="button" class="acc-exit" onClick={() => signOut()}>Sair</button>
        </div>

        <section class="acc-purse" aria-label="Gemas">
          <span class="label">Gemas</span>
          <div class="acc-purse-top">
            <b class="acc-purse-num tabular">{Number(gems.balance).toLocaleString("pt-BR")}</b>
            <span class="acc-purse-note">valem em todos os servidores</span>
          </div>

          {gems.available ? (
            <button
              type="button"
              class="btn btn-primary acc-go"
              disabled={claiming === "gems"}
              aria-busy={claiming === "gems" ? "true" : undefined}
              onClick={() => collect("gems", "/api/claim/gems", {}, d => `+${d.amount} ${d.amount === 1 ? "gema" : "gemas"}. Saldo: ${d.balance}.`)}
            >
              Pegar gemas
            </button>
          ) : (
            <Clock seconds={gems.remaining} total={gems.cooldown} onDone={refreshQuietly} label="Próxima coleta em" />
          )}

          <p class="acc-small">Cada coleta rende de {gems.min} a {gems.max} gemas, a cada {gems.cooldown / 3600} horas.</p>
        </section>
      </section>

      <p class={`acc-say ${say?.kind ?? ""}`} role="status" aria-live="polite">{say?.text ?? ""}</p>

      <section class="acc-servers">
        <div class="acc-servers-head">
          <div>
            <span class="label">Seus servidores</span>
            <h2>Daily por servidor</h2>
          </div>
          {guilds.length > 0 && (
            <p class="acc-tally">
              {totals.ready > 0 ? (
                <>
                  <b>{totals.ready}</b> {totals.ready === 1 ? "liberado" : "liberados"} · <b>{formatMoney(totals.total)}</b> para resgatar
                </>
              ) : totals.nextIn !== null ? (
                `Nenhum liberado agora · o próximo em ${formatDuration(totals.nextIn)}`
              ) : (
                "Nenhum liberado agora"
              )}
            </p>
          )}
        </div>
        <p class="acc-small">Cada servidor tem a própria recarga de 24 horas e a própria sequência.</p>

        {guilds.length > 0 ? (
          <ol class="acc-list">
            {guilds.map(guild => (
              <ServerRow
                key={guild.id}
                guild={guild}
                me={data}
                busy={claiming === guild.id}
                onRefresh={refreshQuietly}
                onClaim={target => collect(target.id, "/api/claim/daily", { guildId: target.id }, d => `Daily resgatado em ${target.name || "o servidor"}: ${formatMoney(d.reward.total)}. Sequência: ${d.streak}.`)}
              />
            ))}
          </ol>
        ) : (
          <section class="acc-box acc-notice">
            <h2>Nenhum servidor em comum</h2>
            <p>A Helena não está em nenhum servidor seu. Adicione-a a um servidor da VSync e volte aqui.</p>
          </section>
        )}
      </section>
    </>
  );
}
