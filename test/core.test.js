const {
  totalPot,
  getWinners,
  getWorst,
  getStreak,
  getStreakBadge,
  getChargeCategory,
  getTodayChargedBy,
  canDeleteEntry,
  formatMonthKey,
  getCleanestMouth,
  generateCsvContent,
  CHARGE_CATEGORIES,
  DAILY_LIMIT,
} = require('../js/core');

// ── totalPot ──────────────────────────────────────────────────

describe('totalPot', () => {
  test('returns 0 for empty kids', () => {
    expect(totalPot({})).toBe(0);
  });

  test('sums all kid amounts', () => {
    const kids = {
      Delaney: { amount: 3, swears: 3 },
      Hadley: { amount: 5, swears: 5 },
      Emerson: { amount: 2, swears: 2 },
    };
    expect(totalPot(kids)).toBe(10);
  });

  test('handles missing amount fields', () => {
    const kids = {
      Delaney: { swears: 3 },
      Hadley: { amount: 5, swears: 5 },
    };
    expect(totalPot(kids)).toBe(5);
  });
});

// ── getWinners ────────────────────────────────────────────────

describe('getWinners', () => {
  const kidNames = ['Delaney', 'Hadley', 'Emerson', 'Grant'];

  test('returns kid with fewest swears', () => {
    const kids = {
      Delaney: { amount: 3, swears: 3 },
      Hadley: { amount: 5, swears: 5 },
      Emerson: { amount: 1, swears: 1 },
      Grant: { amount: 4, swears: 4 },
    };
    expect(getWinners(kids, kidNames)).toEqual(['Emerson']);
  });

  test('returns multiple winners on tie', () => {
    const kids = {
      Delaney: { amount: 2, swears: 2 },
      Hadley: { amount: 2, swears: 2 },
      Emerson: { amount: 5, swears: 5 },
      Grant: { amount: 3, swears: 3 },
    };
    expect(getWinners(kids, kidNames)).toEqual(['Delaney', 'Hadley']);
  });

  test('returns all kids when everyone has 0', () => {
    const kids = {
      Delaney: { amount: 0, swears: 0 },
      Hadley: { amount: 0, swears: 0 },
      Emerson: { amount: 0, swears: 0 },
      Grant: { amount: 0, swears: 0 },
    };
    expect(getWinners(kids, kidNames)).toEqual(kidNames);
  });
});

// ── getWorst ──────────────────────────────────────────────────

describe('getWorst', () => {
  const kidNames = ['Delaney', 'Hadley', 'Emerson', 'Grant'];

  test('returns kid with most swears', () => {
    const kids = {
      Delaney: { amount: 3, swears: 3 },
      Hadley: { amount: 7, swears: 7 },
      Emerson: { amount: 1, swears: 1 },
      Grant: { amount: 4, swears: 4 },
    };
    expect(getWorst(kids, kidNames)).toEqual(['Hadley']);
  });

  test('returns empty array when pot is 0', () => {
    const kids = {
      Delaney: { amount: 0, swears: 0 },
      Hadley: { amount: 0, swears: 0 },
    };
    expect(getWorst(kids, kidNames)).toEqual([]);
  });

  test('returns multiple worst offenders on tie', () => {
    const kids = {
      Delaney: { amount: 5, swears: 5 },
      Hadley: { amount: 5, swears: 5 },
      Emerson: { amount: 1, swears: 1 },
      Grant: { amount: 2, swears: 2 },
    };
    expect(getWorst(kids, kidNames)).toEqual(['Delaney', 'Hadley']);
  });
});

// ── getStreak ─────────────────────────────────────────────────

describe('getStreak', () => {
  test('returns 0 if kid swore today', () => {
    const history = [{ kid: 'Grant', ts: '2026-03-27T10:00:00Z', amount: 1 }];
    expect(getStreak('Grant', history, '2026-03-27')).toBe(0);
  });

  test('counts consecutive clean days', () => {
    const history = [{ kid: 'Grant', ts: '2026-03-23T10:00:00Z', amount: 1 }];
    // Swore on 23rd, clean 24th, 25th, 26th = 3 day streak on 27th
    expect(getStreak('Grant', history, '2026-03-27')).toBe(3);
  });

  test('returns 0 for no history (counts from yesterday)', () => {
    // With no history at all, they've always been clean - streak should be 30 (capped)
    expect(getStreak('Grant', [], '2026-03-27')).toBe(30);
  });

  test('ignores deletion entries', () => {
    const history = [
      { kid: 'Grant', ts: '2026-03-27T10:00:00Z', amount: 1, type: 'deletion' },
    ];
    // Deletion should be ignored, so streak continues
    expect(getStreak('Grant', history, '2026-03-27')).toBe(30);
  });

  test('only counts entries for the specified kid', () => {
    const history = [
      { kid: 'Hadley', ts: '2026-03-27T10:00:00Z', amount: 1 },
    ];
    // Hadley swore today but not Grant
    expect(getStreak('Grant', history, '2026-03-27')).toBe(30);
    expect(getStreak('Hadley', history, '2026-03-27')).toBe(0);
  });
});

// ── getStreakBadge ─────────────────────────────────────────────

describe('getStreakBadge', () => {
  test('returns null for streak < 3', () => {
    expect(getStreakBadge(0)).toBeNull();
    expect(getStreakBadge(2)).toBeNull();
  });

  test('returns Sprout for 3-day streak', () => {
    expect(getStreakBadge(3)).toEqual({ days: 3, badge: '🌱', label: 'Sprout' });
  });

  test('returns Star for 7-day streak', () => {
    expect(getStreakBadge(7)).toEqual({ days: 7, badge: '⭐', label: 'Star' });
  });

  test('returns highest milestone for 30-day streak', () => {
    expect(getStreakBadge(30)).toEqual({ days: 30, badge: '👑', label: 'Royalty' });
  });

  test('returns Diamond for 25-day streak (between milestones)', () => {
    expect(getStreakBadge(25)).toEqual({ days: 21, badge: '💎', label: 'Diamond' });
  });
});

// ── getChargeCategory ─────────────────────────────────────────

describe('getChargeCategory', () => {
  test('returns mild category', () => {
    const cat = getChargeCategory('mild');
    expect(cat.amount).toBe(0.50);
    expect(cat.label).toBe('Mild');
  });

  test('returns moderate category', () => {
    const cat = getChargeCategory('moderate');
    expect(cat.amount).toBe(1.00);
  });

  test('returns severe category', () => {
    const cat = getChargeCategory('severe');
    expect(cat.amount).toBe(2.00);
  });

  test('defaults to moderate for unknown category', () => {
    const cat = getChargeCategory('unknown');
    expect(cat.id).toBe('moderate');
  });
});

// ── getTodayChargedBy ─────────────────────────────────────────

describe('getTodayChargedBy', () => {
  test('returns 0 for no charges', () => {
    expect(getTodayChargedBy('Mom', [], '2026-03-27')).toBe(0);
  });

  test('sums charges by the specified user today', () => {
    const history = [
      { kid: 'Grant', ts: '2026-03-27T10:00:00Z', amount: 1, addedBy: 'Mom' },
      { kid: 'Hadley', ts: '2026-03-27T11:00:00Z', amount: 2, addedBy: 'Mom' },
      { kid: 'Grant', ts: '2026-03-27T12:00:00Z', amount: 1, addedBy: 'Dad' },
    ];
    expect(getTodayChargedBy('Mom', history, '2026-03-27')).toBe(3);
    expect(getTodayChargedBy('Dad', history, '2026-03-27')).toBe(1);
  });

  test('ignores charges from other days', () => {
    const history = [
      { kid: 'Grant', ts: '2026-03-26T10:00:00Z', amount: 1, addedBy: 'Mom' },
      { kid: 'Grant', ts: '2026-03-27T10:00:00Z', amount: 1, addedBy: 'Mom' },
    ];
    expect(getTodayChargedBy('Mom', history, '2026-03-27')).toBe(1);
  });

  test('ignores deletion entries', () => {
    const history = [
      { kid: 'Grant', ts: '2026-03-27T10:00:00Z', amount: 1, addedBy: 'Mom', type: 'deletion' },
    ];
    expect(getTodayChargedBy('Mom', history, '2026-03-27')).toBe(0);
  });

  test('returns 0 for null user', () => {
    expect(getTodayChargedBy(null, [{ kid: 'Grant', ts: '2026-03-27T10:00:00Z', amount: 1 }], '2026-03-27')).toBe(0);
  });
});

// ── canDeleteEntry ────────────────────────────────────────────

describe('canDeleteEntry', () => {
  test('returns false with no current user', () => {
    expect(canDeleteEntry({ kid: 'Grant', addedBy: 'Mom' }, null)).toBe(false);
  });

  test('returns false for deletion entries', () => {
    expect(canDeleteEntry({ type: 'deletion', kid: 'Grant' }, 'Mom')).toBe(false);
  });

  test('returns false for own recordings', () => {
    expect(canDeleteEntry({ kid: 'Grant', addedBy: 'Mom' }, 'Mom')).toBe(false);
  });

  test('returns false for charges against yourself', () => {
    expect(canDeleteEntry({ kid: 'Grant', addedBy: 'Mom' }, 'Grant')).toBe(false);
  });

  test('returns true for valid deletion (other user recorded against different kid)', () => {
    expect(canDeleteEntry({ kid: 'Grant', addedBy: 'Mom' }, 'Dad')).toBe(true);
  });
});

// ── formatMonthKey ────────────────────────────────────────────

describe('formatMonthKey', () => {
  test('formats YYYY-MM to month name and year', () => {
    expect(formatMonthKey('2026-03')).toBe('March 2026');
    expect(formatMonthKey('2025-12')).toBe('December 2025');
    expect(formatMonthKey('2026-01')).toBe('January 2026');
  });

  test('returns dash for empty input', () => {
    expect(formatMonthKey('')).toBe('—');
    expect(formatMonthKey(null)).toBe('—');
    expect(formatMonthKey(undefined)).toBe('—');
  });
});

// ── getCleanestMouth ──────────────────────────────────────────

describe('getCleanestMouth', () => {
  const kidNames = ['Delaney', 'Hadley', 'Emerson', 'Grant'];

  test('returns kid with longest streak', () => {
    const history = [
      { kid: 'Delaney', ts: '2026-03-27T10:00:00Z', amount: 1 },
      { kid: 'Hadley', ts: '2026-03-25T10:00:00Z', amount: 1 },
      // Emerson and Grant have no entries = 30-day streak (capped)
    ];
    const result = getCleanestMouth(kidNames, history, '2026-03-27');
    expect(result.names).toContain('Emerson');
    expect(result.names).toContain('Grant');
    expect(result.streak).toBe(30);
  });

  test('returns empty when all streaks are 0', () => {
    const history = kidNames.map(kid => ({
      kid, ts: '2026-03-27T10:00:00Z', amount: 1,
    }));
    const result = getCleanestMouth(kidNames, history, '2026-03-27');
    expect(result.names).toEqual([]);
    expect(result.streak).toBe(0);
  });
});

// ── generateCsvContent ────────────────────────────────────────

describe('generateCsvContent', () => {
  test('generates CSV with header row', () => {
    const state = { history: [], monthlyResults: [] };
    const csv = generateCsvContent(state, [], CHARGE_CATEGORIES);
    expect(csv).toContain('"Date","Time","Person","Amount","Category","Recorded By","Type"');
  });

  test('includes current month history entries', () => {
    const state = {
      history: [
        { kid: 'Grant', ts: '2026-03-27T10:00:00Z', amount: 1, addedBy: 'Mom', category: 'moderate' },
      ],
      monthlyResults: [],
    };
    const csv = generateCsvContent(state, ['Grant'], CHARGE_CATEGORIES);
    expect(csv).toContain('"Grant"');
    expect(csv).toContain('"$1"');
    expect(csv).toContain('"Moderate"');
    expect(csv).toContain('"Mom"');
    expect(csv).toContain('"Charge"');
  });

  test('includes deletion entries', () => {
    const state = {
      history: [
        { kid: 'Grant', ts: '2026-03-27T10:00:00Z', type: 'deletion', originalAmount: 1, deletedBy: 'Dad' },
      ],
      monthlyResults: [],
    };
    const csv = generateCsvContent(state, ['Grant'], CHARGE_CATEGORIES);
    expect(csv).toContain('"-$1"');
    expect(csv).toContain('"Deletion"');
  });

  test('includes monthly results', () => {
    const state = {
      history: [],
      monthlyResults: [{
        month: '2026-02',
        kids: { Grant: { amount: 5, swears: 5 }, Hadley: { amount: 3, swears: 3 } },
        winners: ['Hadley'],
        pot: 8,
      }],
    };
    const csv = generateCsvContent(state, ['Grant', 'Hadley'], CHARGE_CATEGORIES);
    expect(csv).toContain('"February 2026"');
    expect(csv).toContain('"Winner"');
  });
});
