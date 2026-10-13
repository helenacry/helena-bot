// Painel da conta: entrar com a VSync (OAuth2 + PKCE), ver os servidores em
// que a Helena também está e coletar o daily e as gemas. Fala com a API da
// Helena (services/web-api.mjs); veja o README, "Painel do site (API)".
//
// A primeira metade são funções puras (expostas em Helena.accountLib, onde os
// testes as exercitam); a segunda monta a tela. Todo texto vindo da API entra
// na página com textContent, nunca como HTML.
(function () {
  "use strict";

  var H = (window.Helena = window.Helena || {});

  var cfg = H.config || {};

  // ==========================================
  // FUNÇÕES PURAS
  // ==========================================

  function base64url(bytes) {
    var text = "";

    for (var i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);

    return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function randomBytes(size) {
    return crypto.getRandomValues(new Uint8Array(size));
  }

  // PKCE: o verifier fica só no navegador; a VSync recebe o desafio (S256).
  function pkce() {
    var verifier = base64url(randomBytes(32)); // 43 caracteres

    return crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(verifier))
      .then(function (digest) {
        return { verifier: verifier, challenge: base64url(new Uint8Array(digest)) };
      });
  }

  function randomState() {
    return base64url(randomBytes(16));
  }

  // Endereço de retorno = a própria página, terminando em "/". Tem de ser
  // igual ao cadastrado na VSync (e em HELENA_OAUTH_REDIRECTS).
  function redirectUri(location) {
    var path = location.pathname.replace(/index\.html$/, "");

    if (!/\/$/.test(path)) path += "/";

    return location.origin + path;
  }

  function buildAuthorizeUrl(options) {
    var query = new URLSearchParams({
      client_id: options.clientId,
      response_type: "code",
      redirect_uri: options.redirectUri,
      scope: "identify guilds",
      state: options.state,
      code_challenge: options.challenge,
      code_challenge_method: "S256"
    });

    return "https://vsync.lat/oauth2/authorize?" + query.toString();
  }

  // O que a VSync devolveu na volta do login.
  function parseCallback(search) {
    var query = new URLSearchParams(search);

    return {
      code: query.get("code") || "",
      state: query.get("state") || "",
      error: query.get("error") || ""
    };
  }

  // Centavos -> "R$ 1.234,56".
  function formatMoney(cents) {
    return ((Number(cents) || 0) / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  // 3725 -> "1h 2m 5s"; menos de 1 hora -> "2m 5s".
  function formatDuration(seconds) {
    var total = Math.max(0, Math.ceil(Number(seconds) || 0));
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var secs = total % 60;
    var parts = [];

    if (hours > 0) parts.push(hours + "h");
    if (hours > 0 || minutes > 0) parts.push(minutes + "m");

    parts.push(secs + "s");

    return parts.join(" ");
  }

  // Os 7 dias do ciclo da sequência: "done" já coletados, "next" o de hoje,
  // "todo" os que faltam. O sétimo dia é o do bônus semanal.
  function weekPips(nextStreak) {
    var position = ((Math.max(1, nextStreak) - 1) % 7) + 1;
    var pips = [];

    for (var day = 1; day <= 7; day++) {
      pips.push({
        day: day,
        weekly: day === 7,
        state: day < position ? "done" : (day === position ? "next" : "todo")
      });
    }

    return pips;
  }

  // Só imagens https entram na página (nada de javascript: ou data:).
  function safeImage(url) {
    return typeof url === "string" && /^https:\/\//.test(url) ? url : "";
  }

  // Texto para cada resposta da API.
  function errorText(code, extra) {
    extra = extra || {};

    var wait = extra.remaining !== undefined ? formatDuration(extra.remaining) : "";

    var texts = {
      cooldown: wait ? "Ainda não liberou. Falta " + wait + "." : "Ainda não liberou.",
      prison: "Você está preso nesse servidor" + (wait ? " (falta " + wait + ")" : "") + ". Preso não coleta o daily.",
      wallet_full: "Sua carteira está no limite. Deposite parte do dinheiro no banco e tente de novo.",
      guild_not_allowed: "A Helena não está nesse servidor ou você saiu dele. Entre de novo para atualizar a lista.",
      captcha_required: "Confirme a verificação anti-robô antes de coletar.",
      captcha_failed: "A verificação anti-robô falhou. Tente de novo.",
      captcha_unavailable: "Não consegui conferir a verificação agora. Tente de novo em instantes.",
      too_many_requests: "Muitas tentativas. Espere um pouco" + (extra.retryAfter ? " (" + formatDuration(extra.retryAfter) + ")" : "") + ".",
      session_expired: "Sua sessão acabou. Entre de novo.",
      unauthorized: "Sua sessão acabou. Entre de novo.",
      login_failed: "Não deu para entrar. Tente de novo.",
      invalid_redirect: "Este endereço não está autorizado a fazer login. Avise a equipe da Helena.",
      vsync_unavailable: "A VSync não respondeu agora. Tente de novo em instantes."
    };

    return texts[code] || "Algo deu errado. Tente de novo.";
  }

  H.accountLib = {
    base64url: base64url,
    pkce: pkce,
    randomState: randomState,
    redirectUri: redirectUri,
    buildAuthorizeUrl: buildAuthorizeUrl,
    parseCallback: parseCallback,
    formatMoney: formatMoney,
    formatDuration: formatDuration,
    weekPips: weekPips,
    safeImage: safeImage,
    errorText: errorText
  };

  // ==========================================
  // TELA
  // ==========================================

  var root = typeof document !== "undefined" ? document.getElementById("account") : null;

  if (!root) return;

  var el = H.el;

  var API = String(cfg.apiUrl || "").replace(/\/+$/, "");

  var STORAGE_KEY = "helena.session";
  var PKCE_KEY = "helena.oauth";

  var OFFLINE = "A Helena está fora do ar agora. Tente de novo mais tarde.";

  var state = {
    session: null,
    me: null,
    message: null, // { text, kind } do último resultado
    captchaToken: "",
    captchaWidget: null,
    timers: []
  };

  // O desafio do Turnstile mora numa caixa fixa da página (fora de #account):
  // mover um iframe pelo DOM o recarregaria e perderia a verificação resolvida.
  var captchaBox = document.getElementById("acc-captcha-box");
  var captchaSlot = document.getElementById("acc-captcha");

  // ---------- armazenamento (pode estar bloqueado: nada quebra) ----------
  function readJson(storage, key) {
    try {
      return JSON.parse(storage.getItem(key) || "null");
    } catch (error) {
      return null;
    }
  }

  function writeJson(storage, key, value) {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
    } catch (error) { /* sem armazenamento: o login vale só nesta página */ }
  }

  function loadSession() {
    var saved = readJson(window.localStorage, STORAGE_KEY);

    if (saved && saved.token && saved.expiresAt > Date.now() / 1000) return saved;

    writeJson(window.localStorage, STORAGE_KEY, null);

    return null;
  }

  // ---------- chamadas à API ----------
  function api(path, options) {
    options = options || {};

    var headers = {};

    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (state.session) headers.Authorization = "Bearer " + state.session.token;

    return fetch(API + path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    }).then(
      function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          return { status: response.status, data: data };
        });
      },
      function () {
        return { status: 0, data: { error: "offline" } };
      }
    );
  }

  function textFor(result) {
    return result.data.error === "offline"
      ? OFFLINE
      : errorText(result.data.error, result.data);
  }

  // ---------- peças de tela ----------
  function stopTimers() {
    state.timers.forEach(clearInterval);
    state.timers = [];
  }

  function show(children) {
    stopTimers();

    while (root.firstChild) root.removeChild(root.firstChild);

    children.forEach(function (child) { root.appendChild(child); });
  }

  function setCaptchaVisible(visible) {
    if (captchaBox) captchaBox.hidden = !visible;
  }

  // Aviso que ocupa a página inteira é o título dela (h1); dentro do painel
  // já logado o título é o nome da pessoa, então o aviso fica em h2.
  function notice(title, text, action, page) {
    var box = el("section", { "class": "acc-box acc-notice" }, [
      el(page ? "h1" : "h2", { text: title }),
      el("p", { text: text })
    ]);

    if (action) box.appendChild(action);

    return box;
  }

  function button(label, kind, onClick) {
    var node = el("button", { "class": "btn " + (kind || ""), type: "button", text: label });

    node.addEventListener("click", onClick);

    return node;
  }

  // Resultado da última ação, anunciado pelo leitor de tela. Fica guardado
  // em state.message e é redesenhado junto com o painel.
  function say(text, kind) {
    state.message = text ? { text: text, kind: kind || "" } : null;

    var area = document.getElementById("acc-say");

    if (area) {
      area.className = "acc-say " + (kind || "");
      area.textContent = text || "";
    }
  }

  // Conta de verdade: a cada segundo diminui; quando chega a zero, atualiza.
  function countdown(node, seconds, onDone) {
    var left = Math.ceil(seconds);

    node.textContent = formatDuration(left);

    var timer = setInterval(function () {
      left -= 1;

      if (left <= 0) {
        clearInterval(timer);
        onDone();

        return;
      }

      node.textContent = formatDuration(left);
    }, 1000);

    state.timers.push(timer);
  }

  // ---------- login ----------
  function loginScreen(message) {
    setCaptchaVisible(false);

    var enter = button("Entrar com VSync", "primary big", function () {
      enter.disabled = true;

      pkce().then(function (codes) {
        var token = randomState();

        writeJson(window.sessionStorage, PKCE_KEY, { state: token, verifier: codes.verifier });

        window.location.assign(H.accountLib.buildAuthorizeUrl({
          clientId: cfg.clientId,
          redirectUri: redirectUri(window.location),
          state: token,
          challenge: codes.challenge
        }));
      });
    });

    show([
      el("section", { "class": "acc-box acc-login" }, [
        el("span", { "class": "eyebrow", text: "Painel do jogador" }),
        el("h1", { text: "Pegue o seu daily e as suas gemas" }),
        el("p", { "class": "acc-lede", text: "Entre com a sua conta da VSync para resgatar a recompensa diária nos servidores onde a Helena está e coletar gemas, que valem em todos eles." }),
        message ? el("p", { "class": "acc-warn", role: "alert", text: message }) : el("span"),
        enter,
        el("ul", { "class": "acc-facts" }, [
          el("li", { text: "A Helena vê só o seu nome, o seu avatar e a lista dos seus servidores." }),
          el("li", { text: "Ela nunca recebe a sua senha, e o acesso que a VSync dá é devolvido assim que você entra." }),
          el("li", { text: "A sessão dura 6 horas. Sair encerra tudo." })
        ])
      ])
    ]);
  }

  function finishLogin(params) {
    var saved = readJson(window.sessionStorage, PKCE_KEY);

    writeJson(window.sessionStorage, PKCE_KEY, null);

    // limpa o ?code=...&state=... do endereço
    window.history.replaceState(null, "", window.location.pathname);

    if (params.error) {
      loginScreen(params.error === "access_denied"
        ? "Login cancelado. Você pode tentar de novo quando quiser."
        : errorText("login_failed"));

      return;
    }

    if (!saved || !saved.state || saved.state !== params.state) {
      loginScreen("Não consegui confirmar este login (o endereço não bate com o pedido). Tente de novo.");

      return;
    }

    show([notice("Entrando…", "Falando com a VSync.", null, true)]);

    api("/api/auth/login", {
      method: "POST",
      body: { code: params.code, codeVerifier: saved.verifier, redirectUri: redirectUri(window.location) }
    }).then(function (result) {
      if (result.status === 200 && result.data.token) {
        state.session = { token: result.data.token, expiresAt: result.data.expiresAt };
        state.message = null;

        writeJson(window.localStorage, STORAGE_KEY, state.session);

        refresh();

        return;
      }

      loginScreen(textFor(result));
    });
  }

  function signOut(message) {
    if (state.session) api("/api/auth/logout", { method: "POST" });

    state.session = null;
    state.me = null;
    state.message = null;

    writeJson(window.localStorage, STORAGE_KEY, null);

    loginScreen(message);
  }

  // ---------- painel ----------
  function load(quiet) {
    if (!quiet) show([notice("Carregando…", "Buscando os seus servidores.", null, true)]);

    api("/api/me").then(function (result) {
      if (result.status === 401) {
        state.session = null;
        writeJson(window.localStorage, STORAGE_KEY, null);

        loginScreen(errorText(result.data.error));

        return;
      }

      if (result.status !== 200) {
        if (quiet) {
          say(textFor(result), "bad");

          return;
        }

        setCaptchaVisible(false);

        show([notice("Fora do ar", textFor(result), button("Tentar de novo", "primary", refresh), true)]);

        return;
      }

      state.me = result.data;

      dashboard();
    });
  }

  function refresh() { load(false); }

  // Atualiza sem a tela de "Carregando…" piscando.
  function refreshQuietly() { load(true); }

  function avatar(url, name, size) {
    var src = safeImage(url);

    if (!src) {
      return el("span", {
        "class": "acc-avatar acc-initial",
        "aria-hidden": "true",
        text: (name || "?").trim().charAt(0).toUpperCase()
      });
    }

    return el("img", {
      "class": "acc-avatar",
      src: src,
      alt: "",
      width: String(size),
      height: String(size),
      referrerpolicy: "no-referrer"
    });
  }

  // Coleta (daily ou gemas): confere o anti-robô, chama a API e atualiza.
  // "okText" recebe a resposta e devolve a frase de sucesso.
  function collect(path, body, okText) {
    if (state.me.captcha) {
      if (!state.captchaToken) {
        say(errorText("captcha_required"), "bad");
        dashboard();

        return;
      }

      body.turnstile = state.captchaToken;
    }

    api(path, { method: "POST", body: body }).then(function (result) {
      // o desafio vale uma vez: pede outro para a próxima coleta
      state.captchaToken = "";

      if (state.captchaWidget !== null && window.turnstile) {
        window.turnstile.reset(state.captchaWidget);
      }

      if (result.status === 401) {
        signOut(errorText(result.data.error));

        return;
      }

      if (result.status === 200) say(okText(result.data), "ok");
      else say(textFor(result), "bad");

      refreshQuietly();
    });
  }

  // Cartão das gemas: saldo da conta e a coleta (de 5 em 5 horas).
  function gemCard(me) {
    var gems = me.gems;

    var card = el("section", { "class": "acc-box acc-gems" }, [
      el("span", { "class": "eyebrow", text: "Gemas" }),
      el("div", { "class": "acc-balance" }, [
        el("b", { text: Number(gems.balance).toLocaleString("pt-BR") }),
        el("span", { text: "valem em todos os servidores" })
      ]),
      el("p", {
        "class": "acc-small",
        text: "Cada coleta rende de " + gems.min + " a " + gems.max + " gemas, a cada " + (gems.cooldown / 3600) + " horas."
      })
    ]);

    if (gems.available) {
      var claim = button("Pegar gemas", "primary", function () {
        claim.disabled = true;
        claim.setAttribute("aria-busy", "true");

        collect("/api/claim/gems", {}, function (data) {
          return "+" + data.amount + (data.amount === 1 ? " gema" : " gemas") + ". Saldo: " + data.balance + ".";
        });
      });

      card.appendChild(claim);

    } else {
      var timer = el("b", { "class": "acc-clock" });

      card.appendChild(el("p", { "class": "acc-wait" }, [document.createTextNode("Próxima coleta em "), timer]));

      countdown(timer, gems.remaining, refreshQuietly);
    }

    return card;
  }

  // Cartão de um servidor: dinheiro, os 7 dias da sequência e o daily.
  function serverCard(guild) {
    var daily = guild.daily;

    var head = el("div", { "class": "acc-server-head" }, [
      avatar(guild.icon, guild.name, 44),
      el("div", {}, [
        el("h3", { text: guild.name || "Servidor" }),
        el("span", {
          "class": "acc-small",
          text: guild.player
            ? formatMoney(guild.player.wallet) + " na carteira · " + formatMoney(guild.player.bank) + " no banco · nível " + guild.player.level
            : "Você ainda não jogou aqui"
        })
      ])
    ]);

    var pips = el("ol", { "class": "acc-pips", "aria-label": "Dias da sequência" }, weekPips(daily.nextStreak).map(function (pip) {
      return el("li", {
        "class": "pip " + pip.state + (pip.weekly ? " weekly" : ""),
        title: "Dia " + pip.day + (pip.weekly ? " (bônus semanal)" : ""),
        text: String(pip.day)
      });
    }));

    var reward = el("p", { "class": "acc-reward" }, [
      document.createTextNode("Hoje: "),
      el("b", { text: formatMoney(daily.nextReward.total) }),
      document.createTextNode(daily.streak > 0
        ? " · sequência de " + daily.streak + (daily.streak === 1 ? " dia" : " dias")
        : " · sequência nova")
    ]);

    var action;

    if (guild.prison) {
      action = el("p", { "class": "acc-warn", text: "Preso, falta " + formatDuration(guild.prison.remaining) + ". Preso não coleta o daily." });

    } else if (daily.available) {
      action = button("Resgatar daily", "primary", function () {
        action.disabled = true;
        action.setAttribute("aria-busy", "true");

        collect("/api/claim/daily", { guildId: guild.id }, function (data) {
          return "Daily resgatado em " + (guild.name || "o servidor") + ": " + formatMoney(data.reward.total) + ". Sequência: " + data.streak + ".";
        });
      });

    } else {
      var timer = el("b", { "class": "acc-clock" });

      action = el("p", { "class": "acc-wait" }, [document.createTextNode("Próximo resgate em "), timer]);

      countdown(timer, daily.remaining, refreshQuietly);
    }

    return el("article", { "class": "acc-box acc-server" }, [head, pips, reward, action]);
  }

  // Desafio do Cloudflare Turnstile: carregado só quando a API pede, e
  // desenhado uma única vez na caixa fixa.
  function setupCaptcha() {
    var wanted = Boolean(state.me && state.me.captcha && cfg.turnstileSiteKey && captchaSlot);

    setCaptchaVisible(wanted);

    if (!wanted || state.captchaWidget !== null) return;

    function render() {
      if (state.captchaWidget !== null) return;

      state.captchaWidget = window.turnstile.render(captchaSlot, {
        sitekey: cfg.turnstileSiteKey,
        theme: "dark",
        language: "pt-br",
        callback: function (token) { state.captchaToken = token; },
        "expired-callback": function () { state.captchaToken = ""; },
        "error-callback": function () { state.captchaToken = ""; }
      });
    }

    if (window.turnstile) {
      render();

      return;
    }

    var script = document.createElement("script");

    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = render;

    document.head.appendChild(script);
  }

  function dashboard() {
    var me = state.me;

    var side = el("div", { "class": "acc-side" }, [
      el("section", { "class": "acc-box acc-me" }, [
        avatar(me.user.avatarUrl, me.user.displayName, 72),
        el("h1", { text: me.user.displayName || me.user.username }),
        el("span", { "class": "acc-small", text: "@" + me.user.username }),
        button("Sair", "", function () { signOut(); })
      ]),
      gemCard(me)
    ]);

    var servers = me.guilds.length
      ? me.guilds.map(serverCard)
      : [notice("Nenhum servidor em comum", "A Helena não está em nenhum servidor seu. Adicione-a a um servidor da VSync e volte aqui.")];

    var main = el("div", { "class": "acc-main" }, [
      el("div", { "class": "acc-main-head" }, [
        el("span", { "class": "eyebrow", text: "Seus servidores" }),
        el("h2", { text: "Daily por servidor" }),
        el("p", { "class": "acc-small", text: "Cada servidor tem a própria recarga de 24 horas e a própria sequência." })
      ])
    ].concat(servers));

    var message = state.message;

    show([
      el("div", { "class": "acc-grid" }, [side, main]),
      el("p", {
        id: "acc-say",
        "class": "acc-say " + (message ? message.kind : ""),
        role: "status",
        "aria-live": "polite",
        text: message ? message.text : ""
      })
    ]);

    setupCaptcha();
  }

  // ---------- começo ----------
  function start() {
    if (!API) {
      setCaptchaVisible(false);

      show([notice(
        "Painel indisponível",
        "O painel da conta ainda não foi ligado. Enquanto isso, resgate o daily com o comando /daily, direto na VSync.",
        null,
        true
      )]);

      return;
    }

    var params = parseCallback(window.location.search);

    if (params.code || params.error) {
      finishLogin(params);

      return;
    }

    state.session = loadSession();

    if (state.session) {
      refresh();

      return;
    }

    loginScreen();
  }

  start();
})();
