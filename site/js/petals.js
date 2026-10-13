// Pétalas de sakura no herói. Duas profundidades (as de trás são menores e
// mais lentas) e um vento que reage à rolagem da página. Pausa fora da tela
// e não roda com movimento reduzido.
(function () {
  "use strict";

  var H = window.Helena;
  var canvas = H.$("#petals");

  if (!canvas || H.reduced) return;

  var ctx = canvas.getContext("2d");
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  var w = 0;
  var h = 0;
  var petals = [];
  var frame = 0;
  var wind = 0;
  var lastY = window.scrollY;

  // as cores vêm do CSS (css/tokens.css), para a paleta ficar em um lugar só
  var styles = getComputedStyle(document.documentElement);
  var colors = [
    styles.getPropertyValue("--petal-1").trim() || "#e29be0",
    styles.getPropertyValue("--petal-2").trim() || "#f4acce"
  ];

  function resize() {
    var box = canvas.getBoundingClientRect();

    w = box.width;
    h = box.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function make(anywhere) {
    var z = Math.random(); // 0 = longe, 1 = perto

    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -20,
      z: z,
      size: 4 + z * 9,
      vx: -(0.08 + z * 0.4),
      vy: 0.12 + z * 0.45,
      angle: Math.random() * 6.28,
      spin: (Math.random() - 0.5) * 0.025,
      phase: Math.random() * 6.28,
      alpha: 0.14 + z * 0.42,
      pink: Math.random() < 0.35
    };
  }

  function tick() {
    var y = window.scrollY;
    var delta = y - lastY;

    lastY = y;

    // suaviza o vento: rolar para baixo empurra as pétalas para cima
    wind += (Math.max(-6, Math.min(6, delta * 0.25)) - wind) * 0.08;

    ctx.clearRect(0, 0, w, h);

    petals.forEach(function (p, i) {
      p.x += p.vx + Math.sin(p.y / 60 + p.phase) * 0.25 * (0.4 + p.z);
      p.y += p.vy - wind * p.z * 0.6;
      p.angle += p.spin;

      if (p.y > h + 20 || p.x < -20 || p.y < -60) petals[i] = make(p.y < -60 ? true : false);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.pink ? colors[1] : colors[0];
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    });

    frame = requestAnimationFrame(tick);
  }

  function start() { if (!frame) { lastY = window.scrollY; frame = requestAnimationFrame(tick); } }
  function stop() { cancelAnimationFrame(frame); frame = 0; }

  resize();

  for (var i = 0; i < 24; i++) petals.push(make(true));

  window.addEventListener("resize", resize);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) start(); else stop();
    }).observe(canvas);
  } else {
    start();
  }
})();
