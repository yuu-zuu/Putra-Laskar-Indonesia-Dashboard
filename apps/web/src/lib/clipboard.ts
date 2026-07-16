export async function copyText(value: string): Promise<void> {
  if (typeof navigator?.clipboard?.writeText === "function") {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.readOnly = true;
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Clipboard tidak tersedia.");
}
