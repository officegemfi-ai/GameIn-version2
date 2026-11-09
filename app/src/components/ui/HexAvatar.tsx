/** "Instant Shock" → "IS", "hypercore" → "HY" */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/[\s_.-]+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** The prototype's hexagon avatar with initials; brands get the mint one. */
export function HexAvatar({ name, size = 44, brand }: { name: string | null | undefined; size?: number; brand?: boolean }) {
  return (
    <span className={`g-hex${brand ? ' g-hex--brand' : ''}`} style={{ ['--size' as string]: `${size}px` }} aria-hidden="true">
      <span>{initials(name)}</span>
    </span>
  );
}
