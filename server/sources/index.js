import { themealdb } from './themealdb.js';
import { kuechengoetter } from './kuechengoetter.js';
import { einfachkochen } from './einfachkochen.js';
import { chefkoch } from './chefkoch.js';

export function defaultSources() {
  return [themealdb, kuechengoetter, einfachkochen, chefkoch];
}
