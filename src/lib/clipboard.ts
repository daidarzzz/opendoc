// Portapapeles con reserva: la API asíncrona puede no estar disponible o
// rechazarse según el webview; entonces se usa execCommand con un
// textarea temporal (siempre dentro de un gesto del usuario).
export async function copyText(text: string): Promise<boolean> {
  if (text === "") return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Se intenta la reserva.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    area.style.pointerEvents = "none";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Texto del portapapeles, o null si el webview no lo permite. */
export async function readText(): Promise<string | null> {
  try {
    if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
  } catch {
    // Sin permiso o sin API.
  }
  return null;
}
