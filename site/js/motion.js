// Movimento da página. Tudo parte do estado final e visível (veja css/motion.css):
// aqui só se adiciona a classe "in" e se acompanham o mouse e a rolagem.
(function () {
  "use strict";

  var H = window.Helena;
  var $ = H.$;
  var $$ = H.$$;

  // ---------- relógio da prisão (conteúdo, não enfeite: roda sempre) ----------
  $$("[data-countdown]").forEach(function (node) {
    var left = Number(node.getAttribute("data-countdown")) || 1781;

    function format(seconds) {
      return Math.floor(seconds / 60) + "m " + (seconds % 60) + "s";
    }

    node.textContent = format(left);

    setInterval(function () {
      left = left <= 1 ? 1800 : left - 1;
      node.textContent = format(left);
    }, 1000);
  });

  // ---------- ヘレナ se escreve de novo quando o mouse passa ----------
  // (vale também com movimento reduzido: ver a exceção em css/motion.css)
  var kanji = $(".kanji");

  if (kanji && H.finePointer) {
    kanji.addEventListener("pointerenter", function () {
      kanji.classList.remove("draw");
      void kanji.getBoundingClientRect(); // força o navegador a reiniciar a animação
      kanji.classList.add("draw");
    });
  }

  if (H.reduced) return;

  // ---------- entrada por rolagem ----------
  // O que já está na tela ao carregar recebe "in" na hora (antes da primeira
  // pintura, sem piscar); o resto, um pouco antes de aparecer.
  var targets = $$("[data-reveal]");

  if ("IntersectionObserver" in window) {
    var viewport = window.innerHeight;

    var reveal = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;

        entry.target.classList.add("in");
        reveal.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px 8% 0px" });

    targets.forEach(function (target) {
      var box = target.getBoundingClientRect();

      if (box.top < viewport * 1.08 && box.bottom > 0) target.classList.add("in");
      else reveal.observe(target);
    });

    // ---------- números do início contam até o valor ----------
    var counters = $$(".ledger [data-stat]");

    var counting = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;

        counting.unobserve(entry.target);
        countUp(entry.target);
      });
    }, { threshold: 0.6 });

    counters.forEach(function (node) { counting.observe(node); });
  }

  function countUp(node) {
    var end = Number(node.textContent);

    if (!isFinite(end) || end <= 0) return;

    var begin = null;
    var duration = 1000;

    node.textContent = "0";

    function step(time) {
      if (begin === null) begin = time;

      var progress = Math.min(1, (time - begin) / duration);

      node.textContent = String(Math.round(end * (1 - Math.pow(1 - progress, 3))));

      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);

    // garante o valor final mesmo se o navegador pausar os quadros de animação
    setTimeout(function () { node.textContent = String(end); }, duration + 300);
  }

  // ---------- cartão do herói inclina com o mouse ----------
  var tilt = $(".tilt");

  if (tilt && H.finePointer) {
    var host = tilt.parentElement;

    host.addEventListener("pointermove", function (event) {
      var box = tilt.getBoundingClientRect();
      var x = (event.clientX - box.left) / box.width;
      var y = (event.clientY - box.top) / box.height;

      tilt.classList.add("live");
      tilt.style.setProperty("--ry", ((x - 0.5) * 10).toFixed(2) + "deg");
      tilt.style.setProperty("--rx", ((0.5 - y) * 8).toFixed(2) + "deg");
      tilt.style.setProperty("--gx", (x * 100).toFixed(1) + "%");
      tilt.style.setProperty("--gy", (y * 100).toFixed(1) + "%");
    });

    host.addEventListener("pointerleave", function () {
      tilt.classList.remove("live");
      tilt.style.setProperty("--rx", "0deg");
      tilt.style.setProperty("--ry", "0deg");
    });
  }

  // ---------- foco de luz que segue o mouse nos cartões ----------
  if (H.finePointer) {
    $$(".cell").forEach(function (cell) {
      cell.addEventListener("pointermove", function (event) {
        var box = cell.getBoundingClientRect();

        cell.style.setProperty("--mx", (event.clientX - box.left) + "px");
        cell.style.setProperty("--my", (event.clientY - box.top) + "px");
      });
    });
  }

  // ---------- a linha da rotina avança com a rolagem ----------
  var steps = $(".steps");

  if (steps) {
    var items = $$("li", steps);
    var waiting = false;

    var update = function () {
      waiting = false;

      var box = steps.getBoundingClientRect();
      var line = window.innerHeight * 0.62;
      var progress = Math.max(0, Math.min(1, (line - box.top) / box.height));

      steps.style.setProperty("--p", progress.toFixed(3));

      items.forEach(function (item) {
        item.classList.toggle("done", item.getBoundingClientRect().top + 26 < line);
      });
    };

    window.addEventListener("scroll", function () {
      if (!waiting) { waiting = true; requestAnimationFrame(update); }
    }, { passive: true });

    window.addEventListener("resize", update);

    update();
  }
})();
