/**
 * Swear Jar - Core Logic (testable, no DOM dependencies)
 *
 * NEW MODEL: Fixed monthly pot divided equally among participants.
 * Each swear DEDUCTS from a person's share. If they go below $0,
 * the overflow carries as a penalty to next month.
 */

const CHARGE_CATEGORIES = [
  { id: 'mild',     label: 'Mild',     amount: 0.50, emoji: '😬', color: '#ffa726' },
  { id: 'moderate', label: 'Moderate', amount: 1.00, emoji: '🤬', color: '#e91e8c' },
  { id: 'severe',   label: 'Severe',   amount: 2.00, emoji: '🔥', color: '#ff4444' },
];

const CHARGE_AMOUNT = 1;
const DEFAULT_MONTHLY_POT = 100;

const STREAK_MILESTONES = [
  { days: 3,  badge: '🌱', label: 'Sprout' },
  { days: 7,  badge: '⭐', label: 'Star' },
  { days: 14, badge: '🌟', label: 'Super Star' },
  { days: 21, badge: '💎', label: 'Diamond' },
  { days: 30, badge: '👑', label: 'Royalty' },
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── Budget / Pot helpers ──────────────────────────────────────

/**
 * Get the budget for a given month key from the budgets config.
 * Falls back to DEFAULT_MONTHLY_POT if no budget is set.
 * @param {Object} budgets - { 'YYYY-MM': number, ... }
 * @param {string} monthKey - 'YYYY-MM'
 * @returns {number}
 */
function getMonthlyBudget(budgets, monthKey) {
  if (budgets && budgets[monthKey] !== undefined) return budgets[monthKey];
  // Check for a default key
  if (budgets && budgets['default'] !== undefined) return budgets['default'];
  return DEFAULT_MONTHLY_POT;
}

/**
 * Calculate each person's allocation from the monthly pot.
 * @param {number} pot - Total monthly pot
 * @param {number} numKids - Number of participants
 * @returns {number} - Per-person allocation (rounded to 2 decimals)
 */
function getAllocation(pot, numKids) {
  if (numKids <= 0) return 0;
  return Math.round((pot / numKids) * 100) / 100;
}

/**
 * Calculate remaining balance for a kid.
 * allocation - totalDeducted. Can go negative (overflow/penalty).
 */
function getRemaining(allocation, totalDeducted) {
  return Math.round((allocation - totalDeducted) * 100) / 100;
}

/**
 * Calculate overflow (penalty carried to next month).
 * If remaining < 0, the absolute value is the overflow.
 */
function getOverflow(remaining) {
  return remaining < 0 ? Math.abs(remaining) : 0;
}

/**
 * Total amount deducted from all kids (total fines this month)
 */
function totalDeducted(kids) {
  return Object.values(kids).reduce((s, k) => s + (k.deducted || 0), 0);
}

/**
 * Total pot remaining across all kids
 */
function totalPotRemaining(kids, allocation) {
  return Object.values(kids).reduce((s, k) => {
    const rem = getRemaining(allocation, k.deducted || 0);
    return s + Math.max(0, rem);
  }, 0);
}

// ── Winner / Loser logic ──────────────────────────────────────

/**
 * Determine winner(s) - kid(s) with the MOST money remaining
 * (fewest deductions). In the new model, higher remaining = winner.
 */
function getWinners(kids, kidNames, allocation) {
  if (!kidNames.length) return [];
  const remainings = kidNames.map(k => getRemaining(allocation, kids[k]?.deducted ?? 0));
  const max = Math.max(...remainings);
  return kidNames.filter(k => getRemaining(allocation, kids[k]?.deducted ?? 0) === max);
}

/**
 * Determine worst offender(s) - kid(s) with LEAST remaining
 */
function getWorst(kids, kidNames, allocation) {
  if (!kidNames.length) return [];
  const totDed = Object.values(kids).reduce((s, k) => s + (k.deducted || 0), 0);
  if (totDed === 0) return [];
  const remainings = kidNames.map(k => getRemaining(allocation, kids[k]?.deducted ?? 0));
  const min = Math.min(...remainings);
  return kidNames.filter(k => getRemaining(allocation, kids[k]?.deducted ?? 0) === min);
}

// ── Streak helpers (unchanged) ────────────────────────────────

function getStreak(kid, history, todayStr) {
  const swearDays = new Set();
  (history || []).forEach(entry => {
    if (entry.type === 'deletion' || entry.kid !== kid || !entry.ts) return;
    swearDays.add(entry.ts.split('T')[0]);
  });

  if (swearDays.has(todayStr)) return 0;

  let streak = 0;
  const d = new Date(todayStr + 'T12:00:00Z');
  d.setDate(d.getDate() - 1);
  const pad = n => String(n).padStart(2, '0');
  for (let i = 0; i < 365; i++) {
    const dStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (swearDays.has(dStr)) break;
    streak++;
    d.setDate(d.getDate() - 1);
    if (streak >= 30) break;
  }
  return streak;
}

function getStreakBadge(streak) {
  if (streak < 3) return null;
  let best = STREAK_MILESTONES[0];
  for (const m of STREAK_MILESTONES) {
    if (streak >= m.days) best = m;
  }
  return best;
}

function getChargeCategory(categoryId) {
  return CHARGE_CATEGORIES.find(c => c.id === categoryId) || CHARGE_CATEGORIES[1];
}

function getTodayChargedBy(user, history, todayStr) {
  if (!user) return 0;
  let total = 0;
  (history || []).forEach(entry => {
    if (entry.type === 'deletion' || entry.addedBy !== user || !entry.ts) return;
    if (entry.ts.startsWith(todayStr)) {
      total += (entry.amount || 1);
    }
  });
  return total;
}

function canDeleteEntry(entry, currentUser) {
  if (!currentUser) return false;
  if (entry.type === 'deletion') return false;
  if (entry.addedBy === currentUser) return false;
  if (entry.kid === currentUser) return false;
  return true;
}

function formatMonthKey(k) {
  if (!k) return '—';
  const [y, m] = k.split('-');
  return `${MONTHS[parseInt(m) - 1]} ${y}`;
}

function getCleanestMouth(kidNames, history, todayStr) {
  let maxStreak = 0;
  let cleanest = [];
  kidNames.forEach(kid => {
    const s = getStreak(kid, history, todayStr);
    if (s > maxStreak) { maxStreak = s; cleanest = [kid]; }
    else if (s === maxStreak && s > 0) { cleanest.push(kid); }
  });
  return { names: cleanest, streak: maxStreak };
}

/**
 * Generate CSV content from state data (updated for pot model)
 */
function generateCsvContent(state, kidNames, chargeCategories) {
  const rows = [['Date', 'Time', 'Person', 'Deducted', 'Category', 'Recorded By', 'Type']];

  (state.history || []).forEach(entry => {
    const d = entry.ts ? new Date(entry.ts) : new Date();
    const dateStr = d.toLocaleDateString('en-US');
    const timeStr = d.toLocaleTimeString('en-US');
    if (entry.type === 'deletion') {
      rows.push([dateStr, timeStr, entry.kid, `+$${entry.originalAmount || 1}`, '', entry.deletedBy || '', 'Reversed']);
    } else {
      const catLabel = entry.category ? (chargeCategories.find(c => c.id === entry.category)?.label ?? '') : '';
      rows.push([dateStr, timeStr, entry.kid, `-$${entry.amount || 1}`, catLabel, entry.addedBy || '', 'Deduction']);
    }
  });

  (state.monthlyResults || []).forEach(result => {
    const monthLabel = formatMonthKey(result.month);
    Object.entries(result.kids || {}).forEach(([kid, data]) => {
      rows.push([monthLabel, '', kid, `$${data.remaining ?? 0} remaining`, '', '', `Monthly (${data.swears || 0} swears)`]);
    });
    if (result.winners) {
      rows.push([monthLabel, '', result.winners.join(' & '), `$${result.winnerPrize || 0}`, '', '', 'Winner']);
    }
  });

  return rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

/**
 * Calculate month-end results for the pot model.
 * Winner gets their remaining balance. Losers forfeit theirs.
 * Overflow penalties carry to next month.
 */
function calculateMonthEnd(kids, kidNames, allocation) {
  const results = {};
  const overflows = {};

  kidNames.forEach(kid => {
    const deducted = kids[kid]?.deducted ?? 0;
    const swears = kids[kid]?.swears ?? 0;
    const remaining = getRemaining(allocation, deducted);
    const overflow = getOverflow(remaining);
    results[kid] = { deducted, swears, remaining: Math.max(0, remaining), overflow };
    if (overflow > 0) overflows[kid] = overflow;
  });

  return { results, overflows };
}

/**
 * Generate future month keys from a starting month, up to N months.
 */
function getFutureMonthKeys(startMonthKey, count) {
  const keys = [];
  const [y, m] = startMonthKey.split('-').map(Number);
  for (let i = 0; i < count; i++) {
    const month = ((m - 1 + i) % 12) + 1;
    const year = y + Math.floor((m - 1 + i) / 12);
    keys.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return keys;
}

// CommonJS export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CHARGE_CATEGORIES,
    CHARGE_AMOUNT,
    DEFAULT_MONTHLY_POT,
    STREAK_MILESTONES,
    MONTHS,
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
  };
}
