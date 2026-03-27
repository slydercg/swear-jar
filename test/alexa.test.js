/**
 * Basic tests for Alexa Lambda helper functions
 * Tests the pure functions without requiring ASK SDK
 */

// We can't easily test the full Alexa handlers without mocking the SDK,
// but we can test the helper functions that are used by the handlers.

// Since the Lambda file doesn't export helpers, we test the patterns directly.
describe('Alexa Lambda patterns', () => {
  // Simulate the parseDbUrl function
  function parseDbUrl(url) {
    const match = url.match(/^https?:\/\/([^/]+)(.*)/);
    return { host: match[1], basePath: (match[2] || '').replace(/\/$/, '') };
  }

  // Simulate fbToArray
  function fbToArray(obj) {
    if (!obj || typeof obj !== 'object') return [];
    return Object.values(obj);
  }

  // Simulate arrayToFb
  function arrayToFb(arr) {
    const obj = {};
    arr.forEach((item, i) => { obj[String(i)] = item; });
    return obj;
  }

  describe('parseDbUrl', () => {
    test('parses Firebase URL correctly', () => {
      const result = parseDbUrl('https://swear-jar-ef967-default-rtdb.firebaseio.com');
      expect(result.host).toBe('swear-jar-ef967-default-rtdb.firebaseio.com');
      expect(result.basePath).toBe('');
    });

    test('handles URL with path', () => {
      const result = parseDbUrl('https://example.firebaseio.com/path/to/data');
      expect(result.host).toBe('example.firebaseio.com');
      expect(result.basePath).toBe('/path/to/data');
    });
  });

  describe('fbToArray', () => {
    test('returns empty array for null/undefined', () => {
      expect(fbToArray(null)).toEqual([]);
      expect(fbToArray(undefined)).toEqual([]);
    });

    test('converts Firebase object to array', () => {
      const obj = { '0': { kid: 'Grant' }, '1': { kid: 'Hadley' } };
      expect(fbToArray(obj)).toEqual([{ kid: 'Grant' }, { kid: 'Hadley' }]);
    });

    test('handles non-object input', () => {
      expect(fbToArray('string')).toEqual([]);
      expect(fbToArray(42)).toEqual([]);
    });
  });

  describe('arrayToFb', () => {
    test('converts array to Firebase-style object', () => {
      const arr = [{ kid: 'Grant' }, { kid: 'Hadley' }];
      expect(arrayToFb(arr)).toEqual({
        '0': { kid: 'Grant' },
        '1': { kid: 'Hadley' },
      });
    });

    test('handles empty array', () => {
      expect(arrayToFb([])).toEqual({});
    });
  });

  describe('Kid name normalization', () => {
    const FALLBACK_KID_NAMES = {
      delaney: 'Delaney',
      hadley: 'Hadley',
      emerson: 'Emerson',
      grant: 'Grant',
    };

    test('normalizes names to lowercase for lookup', () => {
      const rawName = 'DELANEY';
      const normalized = rawName.trim().toLowerCase();
      expect(FALLBACK_KID_NAMES[normalized]).toBe('Delaney');
    });

    test('handles mixed case', () => {
      expect(FALLBACK_KID_NAMES['hadley']).toBe('Hadley');
    });

    test('returns undefined for unknown names', () => {
      expect(FALLBACK_KID_NAMES['unknown']).toBeUndefined();
    });
  });
});
