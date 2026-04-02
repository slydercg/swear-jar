const {
  getMonthlyBudget,
  getAllocation,
  getRemaining,
  getOverflow,
  totalDeducted,
  totalPotRemaining,
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
  calculateMonthEnd,
  getFutureMonthKeys,
  CHARGE_CATEGORIES,
  DEFAULT_PER_PERSON,
} = require('../js/core');

// ── Budget / Pot helpers ──────────────────────────────────────

describe('getMonthlyBudget', () => {
  test('returns specific month budget when set', () => {
    expect(getMonthlyBudget({ '2026-04': 200 }, '2026-04', 4)).toBe(200);
  });

  test('falls back to default key', () => {
    expect(getMonthlyBudget({ default: 150 }, '2026-05', 4)).toBe(150);
  });

  test('falls back to DEFAULT_PER_PERSON * numKids when no budget set', () => {
    expect(getMonthlyBudget({}, '2026-04', 4)).toBe(40); // $10 * 4
    expect(getMonthlyBudget({}, '2026-04', 6)).toBe(60); // $10 * 6
    expect(getMonthlyBudget(null, '2026-04', 4)).toBe(40);
  });
});

describe('getAllocation', () => {
  test('divides pot equally', () => {
    expect(getAllocation(100, 4)).toBe(25);
  });

  test('handles uneven division with rounding', () => {
    expect(getAllocation(100, 3)).toBe(33.33);
  });

  test('returns 0 for no kids', () => {
    expect(getAllocation(100, 0)).toBe(0);
  });
});

describe('getRemaining', () => {
  test('calculates remaining balance', () => {
    expect(getRemaining(25, 10)).toBe(15);
  });

  test('can go negative (overflow)', () => {
    expect(getRemaining(25, 30)).toBe(-5);
  });

  test('returns full allocation with no deductions', () => {
    expect(getRemaining(25, 0)).toBe(25);
  });
});

describe('getOverflow', () => {
  test('returns 0 for positive remaining', () => {
    expect(getOverflow(15)).toBe(0);
  });

  test('returns 0 for zero remaining', () => {
    expect(getOverflow(0)).toBe(0);
  });

  test('returns absolute value for negative remaining', () => {
    expect(getOverflow(-5)).toBe(5);
  });
});

describe('totalDeducted', () => {
  test('sums all deductions', () => {
    const kids = {
      Delaney: { deducted: 5, swears: 5 },
      Hadley: { deducted: 3, swears: 3 },
    };
    expect(totalDeducted(kids)).toBe(8);
  });

  test('returns 0 for empty', () => {
    expect(totalDeducted({})).toBe(0);
  });
});

describe('totalPotRemaining', () => {
  test('sums positive remaining balances', () => {
    const kids = {
      Delaney: { deducted: 5 },
      Hadley: { deducted: 10 },
    };
    // alloc=25, remaining: 20 + 15 = 35
    expect(totalPotRemaining(kids, 25)).toBe(35);
  });

  test('clamps negative remaining to 0', () => {
    const kids = {
      Delaney: { deducted: 30 }, // -5 remaining, clamped to 0
      Hadley: { deducted: 5 },  // 20 remaining
    };
    expect(totalPotRemaining(kids, 25)).toBe(20);
  });
});

// ── Winner / Loser logic (new: MOST remaining wins) ──────────

describe('getWinners', () => {
  const kidNames = ['Delaney', 'Hadley', 'Emerson', 'Grant'];

  test('returns kid with most remaining (fewest deductions)', () => {
    const kids = {
      Delaney: { deducted: 10 }, // 15 remaining
      Hadley: { deducted: 20 },  // 5 remaining
      Emerson: { deducted: 2 },  // 23 remaining ← winner
      Grant: { deducted: 8 },    // 17 remaining
    };
    expect(getWinners(kids, kidNames, 25)).toEqual(['Emerson']);
  });

  test('returns multiple winners on tie', () => {
    const kids = {
      Delaney: { deducted: 5 },
      Hadley: { deducted: 5 },
      Emerson: { deducted: 20 },
      Grant: { deducted: 10 },
    };
    expect(getWinners(kids, kidNames, 25)).toEqual(['Delaney', 'Hadley']);
  });

  test('returns all kids when no deductions', () => {
    const kids = {
      Delaney: { deducted: 0 },
      Hadley: { deducted: 0 },
      Emerson: { deducted: 0 },
      Grant: { deducted: 0 },
    };
    expect(getWinners(kids, kidNames, 25)).toEqual(kidNames);
  });
});

describe('getWorst', () => {
  const kidNames = ['Delaney', 'Hadley', 'Emerson', 'Grant'];

  test('returns kid with least remaining (most deductions)', () => {
    const kids = {
      Delaney: { deducted: 10 },
      Hadley: { deducted: 20 }, // ← worst
      Emerson: { deducted: 2 },
      Grant: { deducted: 8 },
    };
    expect(getWorst(kids, kidNames, 25)).toEqual(['Hadley']);
  });

  test('returns empty when no deductions', () => {
    const kids = {
      Delaney: { deducted: 0 },
      Hadley: { deducted: 0 },
    };
    expect(getWorst(kids, kidNames, 25)).toEqual([]);
  });

  test('handles overflow (negative remaining)', () => {
    const kids = {
      Delaney: { deducted: 30 }, // -5 remaining ← worst
      Hadley: { deducted: 5 },
      Emerson: { deducted: 2 },
      Grant: { deducted: 8 },
    };
    expect(getWorst(kids, kidNames, 25)).toEqual(['Delaney']);
  });
});

// ── calculateMonthEnd ─────────────────────────────────────────

describe('calculateMonthEnd', () => {
  const kidNames = ['Delaney', 'Hadley'];

  test('calculates results with no overflow', () => {
    const kids = {
      Delaney: { deducted: 10, swears: 10 },
      Hadley: { deducted: 5, swears: 5 },
    };
    const { results, overflows } = calculateMonthEnd(kids, kidNames, 25);
    expect(results.Delaney.remaining).toBe(15);
    expect(results.Hadley.remaining).toBe(20);
    expect(Object.keys(overflows)).toHaveLength(0);
  });

  test('calculates overflow penalties', () => {
    const kids = {
      Delaney: { deducted: 30, swears: 30 }, // 25-30 = -5
      Hadley: { deducted: 5, swears: 5 },
    };
    const { results, overflows } = calculateMonthEnd(kids, kidNames, 25);
    expect(results.Delaney.remaining).toBe(0);
    expect(results.Delaney.overflow).toBe(5);
    expect(overflows.Delaney).toBe(5);
    expect(results.Hadley.remaining).toBe(20);
    expect(results.Hadley.overflow).toBe(0);
  });
});

// ── getFutureMonthKeys ────────────────────────────────────────

describe('getFutureMonthKeys', () => {
  test('generates correct month keys', () => {
    const keys = getFutureMonthKeys('2026-11', 4);
    expect(keys).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  test('handles year boundary', () => {
    const keys = getFutureMonthKeys('2026-01', 3);
    expect(keys).toEqual(['2026-01', '2026-02', '2026-03']);
  });
});

// ── Streak helpers (unchanged) ────────────────────────────────

describe('getStreak', () => {
  test('returns 0 if kid swore today', () => {
    const history = [{ kid: 'Grant', ts: '2026-03-27T10:00:00Z', amount: 1 }];
    expect(getStreak('Grant', history, '2026-03-27')).toBe(0);
  });

  test('counts consecutive clean days', () => {
    const history = [{ kid: 'Grant', ts: '2026-03-23T10:00:00Z', amount: 1 }];
    expect(getStreak('Grant', history, '2026-03-27')).toBe(3);
  });

  test('returns 30 for no history (capped)', () => {
    expect(getStreak('Grant', [], '2026-03-27')).toBe(30);
  });

  test('ignores deletion entries', () => {
    const history = [{ kid: 'Grant', ts: '2026-03-27T10:00:00Z', type: 'deletion' }];
    expect(getStreak('Grant', history, '2026-03-27')).toBe(30);
  });
});

describe('getStreakBadge', () => {
  test('returns null for streak < 3', () => {
    expect(getStreakBadge(0)).toBeNull();
    expect(getStreakBadge(2)).toBeNull();
  });

  test('returns correct badges', () => {
    expect(getStreakBadge(3).label).toBe('Sprout');
    expect(getStreakBadge(7).label).toBe('Star');
    expect(getStreakBadge(30).label).toBe('Royalty');
  });
});

describe('getChargeCategory', () => {
  test('returns correct categories', () => {
    expect(getChargeCategory('mild').amount).toBe(0.50);
    expect(getChargeCategory('moderate').amount).toBe(1.00);
    expect(getChargeCategory('severe').amount).toBe(2.00);
  });

  test('defaults to moderate', () => {
    expect(getChargeCategory('unknown').id).toBe('moderate');
  });
});

describe('canDeleteEntry', () => {
  test('returns false with no user', () => {
    expect(canDeleteEntry({ kid: 'Grant', addedBy: 'Mom' }, null)).toBe(false);
  });

  test('returns false for deletions', () => {
    expect(canDeleteEntry({ type: 'deletion' }, 'Mom')).toBe(false);
  });

  test('returns false for own recordings', () => {
    expect(canDeleteEntry({ kid: 'Grant', addedBy: 'Mom' }, 'Mom')).toBe(false);
  });

  test('returns true for valid case', () => {
    expect(canDeleteEntry({ kid: 'Grant', addedBy: 'Mom' }, 'Dad')).toBe(true);
  });
});

describe('formatMonthKey', () => {
  test('formats correctly', () => {
    expect(formatMonthKey('2026-03')).toBe('March 2026');
    expect(formatMonthKey('2026-01')).toBe('January 2026');
  });

  test('handles empty', () => {
    expect(formatMonthKey('')).toBe('—');
    expect(formatMonthKey(null)).toBe('—');
  });
});

describe('getCleanestMouth', () => {
  test('returns kid with longest streak', () => {
    const history = [
      { kid: 'Delaney', ts: '2026-03-27T10:00:00Z' },
    ];
    const result = getCleanestMouth(['Delaney', 'Grant'], history, '2026-03-27');
    expect(result.names).toContain('Grant');
    expect(result.streak).toBe(30);
  });
});

describe('generateCsvContent', () => {
  test('generates CSV with header', () => {
    const state = { history: [], monthlyResults: [] };
    const csv = generateCsvContent(state, [], CHARGE_CATEGORIES);
    expect(csv).toContain('"Date","Time","Person","Deducted","Category","Recorded By","Type"');
  });

  test('shows deduction entries', () => {
    const state = {
      history: [{ kid: 'Grant', ts: '2026-03-27T10:00:00Z', amount: 1, addedBy: 'Mom', category: 'moderate' }],
      monthlyResults: [],
    };
    const csv = generateCsvContent(state, ['Grant'], CHARGE_CATEGORIES);
    expect(csv).toContain('"-$1"');
    expect(csv).toContain('"Deduction"');
  });
});
