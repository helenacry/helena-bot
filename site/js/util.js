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

  // Aberto direto do disco (file://), o navegador não abre o index.html de uma
  // pasta: o link "pasta/" vira uma listagem de arquivos. Online, "pasta/" é o
  // endereço limpo e funciona, então só aqui o link passa a dizer o arquivo.
  H.localHref = function (href) {
    var path = /^[^?#]*/.exec(href)[0];

    if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href) || path.slice(-1) !== "/") return href;

    return path + "index.html" + href.slice(path.length);
  };

  if (window.location && window.location.protocol === "file:") {
    var fixLinks = function (root) {
      var links = root.nodeName === "A" ? [root] : [];

      if (root.querySelectorAll) links = links.concat(Array.prototype.slice.call(root.querySelectorAll("a[href]")));

      links.forEach(function (a) {
        var href = a.getAttribute("href");
        var fixed = href === null ? href : H.localHref(href);

        if (fixed !== href) a.setAttribute("href", fixed);
      });
    };

    fixLinks(document);

    // links que os scripts criam depois (resultados da busca da wiki)
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        Array.prototype.forEach.call(record.addedNodes, function (node) {
          if (node.nodeType === 1) fixLinks(node);
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
