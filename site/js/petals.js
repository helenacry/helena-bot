// Pétalas de sakura no herói. Duas profundidades (as de trás são menores e
// mais lentas) e um vento que reage à rolagem da página. Pausa fora da tela
// e não roda com movimento reduzido.
//
// A física (quem se move, para onde, quando volta) não toca na página e fica em
// Helena.petalsLib, testada em tests/petals.test.mjs. O resto só desenha.
(function () {
  "use strict";

  var H = window.Helena;

  // Os valores de velocidade abaixo são "pixels por quadro a 60 quadros por
  // segundo". O movimento é multiplicado pelo tempo que passou de verdade, então
  // a animação anda igual em telas de 60, 120 ou 144 Hz.
  var FRAME_MS = 1000 / 60;

  // Passou mais que isto sem desenhar (aba em segundo plano, celular que travou):
  // não pula de uma vez, só anda este tanto.
  var MAX_STEP_MS = 50;

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  // Quantas pétalas cabem na tela: uma por área, nem poucas demais no celular
  // nem uma tempestade no monitor largo.
  function countFor(w, h) {
    return clamp(Math.round((w * h) / 36000), 12, 44);
  }

  // mode: "anywhere" (já na tela, no começo), "top" ou "bottom" (fora da tela,
  // por onde a pétala entra: nunca nasce aparecendo no meio da tela).
  function make(state, mode) {
    var rng = state.rng;
    var z = rng(); // 0 = longe, 1 = perto

    return {
      x: rng() * state.w,
      y: mode === "anywhere" ? rng() * state.h : mode === "top" ? -20 : state.h + 20,
      z: z,
      size: 4 + z * 9,
      vx: -(0.08 + z * 0.4),
      vy: 0.12 + z * 0.45,
      angle: rng() * 6.28,
      spin: (rng() - 0.5) * 0.025,
      phase: rng() * 6.28,
      alpha: 0.14 + z * 0.42,
      pink: rng() < 0.35
    };
  }

  function create(w, h, rng) {
    var state = { w: w, h: h, rng: rng || Math.random, wind: 0, petals: [], respawned: [] };

    for (var i = countFor(w, h); i > 0; i--) state.petals.push(make(state, "anywhere"));

    return state;
  }

  // A área mudou (rotação do celular, fontes que carregam e esticam o herói):
  // ajusta a quantidade, sem recomeçar as que já estão caindo.
  function resize(state, w, h) {
    state.w = w;
    state.h = h;

    var wanted = countFor(w, h);

    while (state.petals.length > wanted) state.petals.pop();
    while (state.petals.length < wanted) state.petals.push(make(state, "anywhere"));
  }

  // Avança dtMs milissegundos. scrollPx é quanto a página rolou desde o último
  // quadro (rolar para baixo empurra as pétalas para cima).
  function step(state, dtMs, scrollPx) {
    var k = clamp(dtMs / FRAME_MS, 0, MAX_STEP_MS / FRAME_MS);

    state.respawned = [];

    if (k === 0) return state;

    // velocidade da rolagem em "pixels por quadro a 60 Hz", suavizada
    var velocity = scrollPx / k;
    var target = clamp(velocity * 0.25, -6, 6);

    state.wind += (target - state.wind) * (1 - Math.pow(1 - 0.08, k));

    for (var i = 0; i < state.petals.length; i++) {
      var p = state.petals[i];

      p.x += (p.vx + Math.sin(p.y / 60 + p.phase) * 0.25 * (0.4 + p.z)) * k;
      p.y += (p.vy - state.wind * p.z * 0.6) * k;
      p.angle += p.spin * k;

      // As pétalas derivam para a esquerda: ao sair por ali, voltam pela direita,
      // na mesma altura. Sem isso o lado direito da tela esvazia com o tempo.
      if (p.x < -20) p.x = state.w + 20;

      if (p.y > state.h + 20) {
        p = state.petals[i] = make(state, "top");

        state.respawned.push(p);
      } else if (p.y < -60) {
        p = state.petals[i] = make(state, "bottom");

        state.respawned.push(p);
      }
    }

    return state;
  }

  H.petalsLib = {
    FRAME_MS: FRAME_MS,
    MAX_STEP_MS: MAX_STEP_MS,
    countFor: countFor,
    create: create,
    resize: resize,
    step: step
  };

  // ---------- desenho ----------
  var canvas = H.$("#petals");

  if (!canvas || H.reduced) return;

  var ctx = canvas.getContext("2d");

  if (!ctx) return;

  var state = null;
  var frame = 0;
  var lastTime = 0;
  var lastY = window.scrollY;

  // as cores vêm do CSS (css/tokens.css), para a paleta ficar em um lugar só
  var styles = getComputedStyle(document.documentElement);
  var colors = [
    styles.getPropertyValue("--petal-1").trim() || "#e29be0",
    styles.getPropertyValue("--petal-2").trim() || "#f4acce"
  ];

  // Acompanha o tamanho que o canvas tem na tela (que muda sem a janela mudar,
  // por exemplo quando uma fonte ou imagem carrega e o herói cresce). Se o
  // tamanho interno ficasse para trás, as pétalas apareceriam esticadas.
  function resizeCanvas() {
    var box = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (box.width < 1 || box.height < 1) return;

    var width = Math.round(box.width * dpr);
    var height = Math.round(box.height * dpr);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (state) resize(state, box.width, box.height);
    else state = create(box.width, box.height);
  }

  function draw() {
    ctx.clearRect(0, 0, state.w, state.h);

    for (var i = 0; i < state.petals.length; i++) {
      var p = state.petals[i];

      if (p.x < -20 || p.x > state.w + 20) continue; // fora da tela

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.pink ? colors[1] : colors[0];
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }
  }

  function tick(now) {
    var y = window.scrollY;
    var dt = lastTime ? now - lastTime : FRAME_MS;

    lastTime = now;

    step(state, dt, y - lastY);

    lastY = y;

    draw();

    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (frame) return;

    lastY = window.scrollY;
    lastTime = 0;
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  resizeCanvas();

  if (!state) return;

  if ("ResizeObserver" in window) {
    new ResizeObserver(resizeCanvas).observe(canvas);
  } else {
    window.addEventListener("resize", resizeCanvas);
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) start(); else stop();
    }).observe(canvas);
  } else {
    start();
  }
})();
