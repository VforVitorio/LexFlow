import { describe, expect, it } from 'vitest';

import en from '../locales/en/common.json';
import es from '../locales/es/common.json';

/**
 * Guards against orphan translations: every key in one locale must exist
 * in the other. A missing key would otherwise fall back to `fallbackLng`
 * (es) silently and ship an untranslated string. Order-independent.
 *
 * WHERE TO ADD A LOCALE: register it here and in `../index.ts` together.
 */
type JsonTree = { [key: string]: string | JsonTree };

/** Flatten a nested locale object into sorted dot-path keys. */
function flattenKeys(tree: JsonTree, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      keys.push(path);
    } else {
      keys.push(...flattenKeys(value, path));
    }
  }
  return keys.sort();
}

function missingFrom(reference: string[], candidate: string[]): string[] {
  const present = new Set(candidate);
  return reference.filter((key) => !present.has(key));
}

describe('i18n locale parity', () => {
  const esKeys = flattenKeys(es as JsonTree);
  const enKeys = flattenKeys(en as JsonTree);

  it('has every Spanish key present in English', () => {
    expect(missingFrom(esKeys, enKeys)).toEqual([]);
  });

  it('has every English key present in Spanish', () => {
    expect(missingFrom(enKeys, esKeys)).toEqual([]);
  });

  it('has identical key sets across locales', () => {
    expect(enKeys).toEqual(esKeys);
  });
});
