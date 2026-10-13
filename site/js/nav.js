// Cabeçalho (menu do celular, seção atual), links do convite e do servidor.
(function () {
  "use strict";

  var H = window.Helena;
  var $ = H.$;
  var $$ = H.$$;

  // ---------- links configuráveis ----------
  function setLink(anchor, url) {
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.hidden = false;
    anchor.textContent = anchor.getAttribute("data-on") || anchor.textContent;
  }

  $$('[data-cta="invite"]').forEach(function (a) {
    if (H.config.inviteUrl) setLink(a, H.config.inviteUrl);
  });

  [["support", H.config.supportUrl], ["code", H.config.codeUrl], ["contact", H.config.contactUrl]].forEach(function (pair) {
    if (!pair[1]) return;
    $$('[data-link="' + pair[0] + '"]').forEach(function (a) { setLink(a, pair[1]); });
  });

  // ---------- painel da conta (só aparece com a API configurada) ----------
  if (H.config.apiUrl) {
    $$("[data-account]").forEach(function (a) { a.hidden = false; });
  }

  // ---------- menu no celular ----------
  // As páginas de termos e privacidade usam este mesmo script só para os
  // links, e não têm menu nem seções: o que falta lá é simplesmente pulado.
  var menuBtn = $("#menu-btn");
  var nav = $("#nav");

  if (menuBtn && nav) {
    menuBtn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });

    nav.addEventListener("click", function (event) {
      if (event.target.tagName === "A") {
        nav.classList.remove("open");
        menuBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // ---------- cabeçalho encolhe ao rolar ----------
  var bar = $("#top-bar");

  if (bar) {
    var onScroll = function () {
      bar.classList.toggle("scrolled", window.scrollY > 24);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // ---------- destaca a seção que está na tela ----------
  var links = $$(".nav a");

  var sections = links
    .map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); })
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;

        links.forEach(function (a) {
          a.classList.toggle("on", a.getAttribute("href") === "#" + entry.target.id);
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });

    sections.forEach(function (section) { observer.observe(section); });
  }
})();
