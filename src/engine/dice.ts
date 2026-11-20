export type Rng = () => number;
export const defaultRng: Rng = Math.random;

export const die = (sides: number, rng: Rng = defaultRng) => 1 + Math.floor(rng() * sides);
/** "Roll 1d6; each time you roll a 6, add the result and roll again." */
export function explodingD6(rng: Rng = defaultRng) {
  let total = 0, r: number;
  do { r = die(6, rng); total += r; } while (r === 6);
  return total;
}
