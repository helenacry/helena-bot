// Ferramentas pequenas usadas pelos outros scripts.
(function () {
  "use strict";

  var H = (window.Helena = window.Helena || {});

  H.$ = function (selector, root) { return (root || document).querySelector(selector); };

  H.$$ = function (selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  };

  // el("div", { class: "x", text: "oi" }, [filhos])
  H.el = function (tag, props, children) {
    var node = document.createElement(tag);

    Object.keys(props || {}).forEach(function (key) {
      if (key === "text") node.textContent = props[key];
      else if (key === "class") node.className = props[key];
      else node.setAttribute(key, props[key]);
    });

    (children || []).forEach(function (child) { node.appendChild(child); });

    return node;
  };

  H.brl = function (value) {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  };

  // minúsculas e sem acento, para a busca
  H.plain = function (text) {
    return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  };

  H.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  H.finePointer = window.matchMedia("(pointer: fine)").matches;

  H.data = H.data || {};
})();
