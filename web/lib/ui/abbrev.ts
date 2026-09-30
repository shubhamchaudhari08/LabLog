/** The two-letter tile on a measurement row (research R-519): "te", "ma", "pH". */
export function abbrev(name: string): string {
  if (!name) return '?';
  return name.length <= 2 ? name : name.slice(0, 2).toLowerCase();
}
