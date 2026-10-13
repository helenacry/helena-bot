// Wiki: gaveta do menu no celular, busca e destaque do sumário. Sem este
// script a wiki continua inteira: o menu fica no topo e a busca nem aparece.
(function () {
  "use strict";

  var H = window.Helena || {};
  var $ = H.$;
  var $$ = H.$$;

  document.documentElement.classList.add("wiki-js");

  // ---------- menu no celular ----------
  var side = $("#wiki-side");
  var menuBtn = $("#wiki-menu-btn");

  if (side && menuBtn) {
    menuBtn.hidden = false;

    var setMenu = function (open) {
      side.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
    };

    menuBtn.addEventListener("click", function () {
      setMenu(!side.classList.contains("open"));
    });

    side.addEventListener("click", function (event) {
      if (event.target.closest("a")) setMenu(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setMenu(false);
    });
  }

  // ---------- busca ----------
  var box = $("#wiki-search-box");
  var input = $("#wiki-search");
  var results = $("#wiki-results");
  var index = H.wikiIndex;

  if (box && input && results && index && index.length) {
    box.hidden = false;

    var root = document.body.getAttribute("data-wiki-root") || "./";

    var docs = index.map(function (page) {
      return {
        page: page,
        title: H.plain(page.t),
        description: H.plain(page.d),
        text: H.plain(page.x)
      };
    });

    var snippet = function (page, term) {
      var at = H.plain(page.x).indexOf(term);

      if (at < 0) return page.d;

      var start = Math.max(0, at - 40);
      var cut = page.x.slice(start, start + 120).trim();

      return (start > 0 ? "…" : "") + cut + "…";
    };

    var search = function (query) {
      var terms = H.plain(query).split(/\s+/).filter(function (term) { return term.length >= 2; });

      if (!terms.length) return [];

      return docs
        .map(function (doc) {
          var score = 0;

          for (var i = 0; i < terms.length; i++) {
            var term = terms[i];

            if (doc.title.indexOf(term) >= 0) score += 6;
            if (doc.description.indexOf(term) >= 0) score += 3;
            if (doc.text.indexOf(term) >= 0) score += 1;
            else { score = 0; break; } // todos os termos precisam aparecer na página
          }

          return { doc: doc, score: score, term: terms[0] };
        })
        .filter(function (hit) { return hit.score > 0; })
        .sort(function (a, b) { return b.score - a.score; })
        .slice(0, 8);
    };

    var render = function (hits, query) {
      results.textContent = "";

      if (!query.trim()) {
        results.hidden = true;
        return;
      }

      if (!hits.length) {
        results.appendChild(H.el("li", { class: "none", text: "Nada encontrado para “" + query.trim() + "”." }));
      }

      hits.forEach(function (hit) {
        var page = hit.doc.page;

        var link = H.el("a", { href: root + page.u }, [
          H.el("b", { text: page.t }),
          H.el("small", { text: page.s + " · " + snippet(page, hit.term) })
        ]);

        results.appendChild(H.el("li", {}, [link]));
      });

      results.hidden = false;
    };

    input.addEventListener("input", function () {
      render(search(input.value), input.value);
    });

    box.addEventListener("submit", function (event) {
      event.preventDefault();

      var first = $("a", results);

      if (first) window.location.href = first.getAttribute("href");
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        input.value = "";
        render([], "");
      }
    });

    document.addEventListener("click", function (event) {
      if (!box.contains(event.target)) results.hidden = true;
    });

    // "/" abre a busca, como em outras wikis
    document.addEventListener("keydown", function (event) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);

      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        input.focus();
      }
    });
  }

  // ---------- sumário: destaca a seção que está na tela ----------
  var links = $$(".wiki-toc a");

  if (links.length && "IntersectionObserver" in window) {
    var headings = links
      .map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); })
      .filter(Boolean);

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;

        links.forEach(function (a) {
          a.classList.toggle("on", a.getAttribute("href") === "#" + entry.target.id);
        });
      });
    }, { rootMargin: "-80px 0px -70% 0px" });

    headings.forEach(function (heading) { observer.observe(heading); });
  }
})();
