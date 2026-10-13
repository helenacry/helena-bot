// Clicar em um comando copia o texto dele.
(function () {
  "use strict";

  var H = window.Helena;

  function fallbackCopy(text) {
    var area = H.el("textarea", { "aria-hidden": "true" });

    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();

    try { document.execCommand("copy"); } catch (error) { /* sem como copiar */ }

    document.body.removeChild(area);
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-copy]");

    if (!button) return;

    var text = button.getAttribute("data-copy");
    var label = button.getAttribute("data-label") || button.textContent;

    button.setAttribute("data-label", label);

    function done() {
      button.classList.add("copied");
      button.textContent = "copiado";

      setTimeout(function () {
        button.classList.remove("copied");
        button.textContent = label;
      }, 1400);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  });
})();
