/** Pure helpers of the charts (wave 15, 2.6), kept apart from React for the unit tests. */

/** 1, 2 or 5 times a power of ten, for round graduations. */
export function niceStep(raw: number) {
  if (!(raw > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

/** One sentence on the trend of a series: first and last values, for the accessible name. */
export function trendSentence(label: string, categories: string[], values: (number | null)[], format: (v: number) => string) {
  const points = values.map((v, i) => [v, categories[i]] as const).filter(([v]) => v !== null) as [number, string][];
  if (!points.length) return label;
  const [first, last] = [points[0], points[points.length - 1]];
  return points.length === 1 ? `${label} : ${format(first[0])} (${first[1]})` : `${label} : ${format(first[0])} (${first[1]}) → ${format(last[0])} (${last[1]})`;
}

