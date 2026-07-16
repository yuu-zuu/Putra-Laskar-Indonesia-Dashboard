export function InfoHint({ text, label = text }: { text: string; label?: string }) {
  return (
    <button className="info-hint" type="button" aria-label={label} data-tooltip={text}>
      i
    </button>
  );
}
