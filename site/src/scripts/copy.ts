// Botão de comando: um clique copia o texto de data-copy e avisa o leitor de tela.
// A API de área de transferência exige página segura (https ou localhost), que é
// o caso do site publicado; se falhar, a pessoa recebe o texto para digitar.
const announce = (text: string) => {
  const region = document.getElementById("announce");
  if (!region) return;
  region.textContent = "";
  // o texto precisa mudar para o leitor de tela falar de novo
  requestAnimationFrame(() => { region.textContent = text; });
};

document.addEventListener("click", async event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>("[data-copy]");
  if (!button) return;

  const text = button.dataset.copy ?? "";

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    announce(`Não consegui copiar. Digite ${text}`);
    return;
  }

  button.setAttribute("data-copied", "");
  announce(`Copiado: ${text}`);
  window.setTimeout(() => button.removeAttribute("data-copied"), 1800);
});
