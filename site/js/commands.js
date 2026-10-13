// Lista de comandos com filtro por categoria e busca.
(function () {
  "use strict";

  var H = window.Helena;
  var $ = H.$;
  var el = H.el;

  var categories = (H.data && H.data.categories) || [];

  var chips = $("#chips");
  var list = $("#list");
  var count = $("#count");
  var search = $("#search");

  if (!chips || !list) return;

  var state = { category: "todos", query: "" };

  var all = [];

  categories.forEach(function (category) {
    category.commands.forEach(function (command) {
      all.push({ category: category.id, command: command });
    });
  });

  function renderList() {
    var wanted = H.plain(state.query).replace(/^\//, "").trim();

    var shown = all.filter(function (entry) {
      if (state.category !== "todos" && entry.category !== state.category) return false;
      if (!wanted) return true;

      var c = entry.command;

      return H.plain([c.name].concat(c.aliases, [c.description]).join(" ")).indexOf(wanted) !== -1;
    });

    list.textContent = "";

    shown.forEach(function (entry, index) {
      var c = entry.command;
      var children = [el("span", { "class": "n", text: "/" + c.name })];

      if (c.aliases.length) {
        children.push(el("span", {
          "class": "a",
          text: "também: " + c.aliases.map(function (a) { return "/" + a; }).join("  ")
        }));
      }

      children.push(el("p", { text: c.description }));

      var item = el("article", { "class": "item" }, children);

      // só anima quando a lista muda por ação da pessoa, não na primeira carga
      if (state.touched && !H.reduced) {
        item.classList.add("pop");
        item.style.setProperty("--i", String(Math.min(index, 14)));
      }

      list.appendChild(item);
    });

    if (!shown.length) {
      list.appendChild(el("p", { "class": "empty", text: "Nenhum comando combina com essa busca." }));
    }

    count.textContent = shown.length === all.length
      ? all.length + " comandos"
      : shown.length + " de " + all.length + " comandos";
  }

  function renderChips() {
    chips.textContent = "";

    [{ id: "todos", label: "Todos", emoji: "" }].concat(categories).forEach(function (category) {
      var chip = el("button", {
        "class": "chip",
        type: "button",
        "aria-pressed": String(state.category === category.id),
        text: (category.emoji ? category.emoji + " " : "") + category.label
      });

      chip.addEventListener("click", function () {
        state.category = category.id;
        state.touched = true;
        renderChips();
        renderList();
      });

      chips.appendChild(chip);
    });
  }

  search.addEventListener("input", function () {
    state.query = search.value;
    state.touched = true;
    renderList();
  });

  renderChips();
  renderList();
})();
