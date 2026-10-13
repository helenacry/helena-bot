// Preenche, com os dados do bot (data/site-data.js), os números, a escada de
// salários, a tabela de empregos e as conquistas.
(function () {
  "use strict";

  var H = window.Helena;
  var $ = H.$;
  var $$ = H.$$;
  var el = H.el;

  var data = H.data || {};
  var stats = data.stats || {};
  var jobs = data.jobs || [];
  var achievements = data.achievements || [];
  var rarities = data.rarities || {};

  // ---------- números ----------
  $$("[data-stat]").forEach(function (node) {
    var value = stats[node.getAttribute("data-stat")];
    if (typeof value === "number") node.textContent = String(value);
  });

  // ---------- escada de salários ----------
  var bars = $("#ladder-bars");
  var axis = $("#ladder-axis");
  var readout = $("#ladder-readout");

  if (bars && jobs.length) {
    var top = jobs[jobs.length - 1].salary;
    var first = jobs[0].salary;
    var pressed = null;

    var show = function (index) {
      var job = jobs[index];

      if (pressed !== null) bars.children[pressed].setAttribute("aria-pressed", "false");
      bars.children[index].setAttribute("aria-pressed", "true");
      pressed = index;

      readout.textContent = "";

      readout.appendChild(el("h3", { text: job.name }));

      readout.appendChild(el("span", { "class": "pay" }, [
        document.createTextNode(H.brl(job.salary) + " "),
        el("small", { text: "por turno" })
      ]));

      var times = job.salary / first;

      readout.appendChild(el("span", {
        "class": "meta",
        text: "nível " + job.level + (times > 1 ? " · " + times.toFixed(1).replace(".", ",") + "x o primeiro emprego" : " · onde todo mundo começa")
      }));
    };

    jobs.forEach(function (job, index) {
      // raiz quadrada: sem ela, os primeiros empregos viram um traço ao lado do Magnata
      var height = Math.max(6, Math.sqrt(job.salary / top) * 100);

      var bar = el("button", {
        "class": "bar",
        type: "button",
        "aria-pressed": "false",
        "aria-label": job.name + ", nível " + job.level + ", " + H.brl(job.salary) + " por turno"
      }, [el("span")]);

      bar.style.setProperty("--i", String(index));
      bar.firstChild.style.setProperty("--h", height + "%");

      ["mouseenter", "focus", "click"].forEach(function (name) {
        bar.addEventListener(name, function () { show(index); });
      });

      bars.appendChild(bar);
      axis.appendChild(el("span", { text: String(job.level) }));
    });

    var start = jobs.map(function (j) { return j.name; }).indexOf("Programador");

    show(start >= 0 ? start : 0);
  }

  // ---------- tabela completa ----------
  var table = $("#jobs-table");

  if (table) {
    jobs.forEach(function (job) {
      table.appendChild(el("tr", {}, [
        el("td", { text: job.name }),
        el("td", { "class": "num", text: String(job.level) }),
        el("td", { "class": "num pay", text: H.brl(job.salary) })
      ]));
    });
  }

  // ---------- conquistas ----------
  var chips = $("#ach-list");

  if (chips) {
    achievements.forEach(function (achievement) {
      chips.appendChild(el("span", {
        "class": "ach " + achievement.rarity,
        title: achievement.description
      }, [document.createTextNode(achievement.emoji + " " + achievement.name)]));
    });
  }

  var legend = $("#ach-legend");

  if (legend) {
    Object.keys(rarities).forEach(function (id) {
      var item = el("span", { text: rarities[id] });
      item.style.setProperty("--rc", "var(--r-" + id + ")");
      legend.appendChild(item);
    });
  }
})();
