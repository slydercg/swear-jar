/**
 * Swear Jar - Core Logic (testable, no DOM dependencies)
 * Extracted for unit testing.
 */

const CHARGE_CATEGORIES = [
  { id: 'mild',     label: 'Mild',     amount: 0.50, emoji: '😬', color: '#ffa726' },
  { id: 'moderate', label: 'Moderate', amount: 1.00, emoji: '🤬', color: '#e91e8c' },
  { id: 'severe',   label: 'Severe',   amount: 2.00, emoji: '🔥', color: '#ff4444' },
];

const CHARGE_AMOUNT = 1;
const DAILY_LIMIT = 10;

const STREAK_MILESTONES = [
  { days: 3,  badge: '🌱', label: 'Sprout' },
  { days: 7,  badge: '⭐', label: 'Star' },
  { days: 14, badge: '🌟', label: 'Super Star' },
  { days: 21, badge: '💎', label: 'Diamond' },
  { days: 30, badge: '👑', label: 'Royalty' },
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/**
 * Calculate total pot from kids state
 */
function totalPot(kids) {
  return Object.values(kids).reduce((s, k) => s + (k.amount || 0), 0);
}

/**
 * Determine winner(s) - kid(s) with the fewest swears
 */
function getWinners(kids, kidNames) {
  const amounts = kidNames.map(k => kids[k]?.amount ?? 0);
  const min = Math.min(...amounts);
  return kidNames.filter(k => (kids[k]?.amount ?? 0) === min);
}

/**
 * Determine worst offender(s)
 */
function getWorst(kids, kidNames) {
  const pot = totalPot(kids);
  if (pot === 0) return [];
  const max = Math.max(...kidNames.map(k => kids[k]?.amount ?? 0));
  if (max === 0) return [];
  return kidNames.filter(k => (kids[k]?.amount ?? 0) === max);
}

/**
 * Calculate streak for a kid given history
 * @param {string} kid - Kid name
 * @param {Array} history - History entries
 * @param {string} todayStr - Today's date string (YYYY-MM-DD)
 * @returns {number} - Consecutive clean days
 */
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

/**
 * Get the appropriate streak badge for a given streak length
 */
function getStreakBadge(streak) {
  if (streak < 3) return null;
  let best = STREAK_MILESTONES[0];
  for (const m of STREAK_MILESTONES) {
    if (streak >= m.days) best = m;
  }
  return best;
}

/**
 * Get the charge category by ID
 */
function getChargeCategory(categoryId) {
  return CHARGE_CATEGORIES.find(c => c.id === categoryId) || CHARGE_CATEGORIES[1];
}

/**
 * Calculate how much a user has charged today
 */
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

/**
 * Check if a user can delete an entry
 */
function canDeleteEntry(entry, currentUser) {
  if (!currentUser) return false;
  if (entry.type === 'deletion') return false;
  if (entry.addedBy === currentUser) return false;
  if (entry.kid === currentUser) return false;
  return true;
}

/**
 * Format a month key (YYYY-MM) to human readable
 */
function formatMonthKey(k) {
  if (!k) return '—';
  const [y, m] = k.split('-');
  return `${MONTHS[parseInt(m) - 1]} ${y}`;
}

/**
 * Get cleanest mouth - kid(s) with longest streak
 */
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
 * Generate CSV content from state data
 */
function generateCsvContent(state, kidNames, chargeCategories) {
  const rows = [['Date', 'Time', 'Person', 'Amount', 'Category', 'Recorded By', 'Type']];

  (state.history || []).forEach(entry => {
    const d = entry.ts ? new Date(entry.ts) : new Date();
    const dateStr = d.toLocaleDateString('en-US');
    const timeStr = d.toLocaleTimeString('en-US');
    if (entry.type === 'deletion') {
      rows.push([dateStr, timeStr, entry.kid, `-$${entry.originalAmount || 1}`, '', entry.deletedBy || '', 'Deletion']);
    } else {
      const catLabel = entry.category ? (chargeCategories.find(c => c.id === entry.category)?.label ?? '') : '';
      rows.push([dateStr, timeStr, entry.kid, `$${entry.amount || 1}`, catLabel, entry.addedBy || '', 'Charge']);
    }
  });

  (state.monthlyResults || []).forEach(result => {
    const monthLabel = formatMonthKey(result.month);
    Object.entries(result.kids || {}).forEach(([kid, data]) => {
      rows.push([monthLabel, '', kid, `$${data.amount || 0}`, '', '', `Monthly Total (${data.swears || 0} swears)`]);
    });
    if (result.winners) {
      rows.push([monthLabel, '', result.winners.join(' & '), `$${result.pot || 0}`, '', '', 'Winner']);
    }
  });

  return rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

// CommonJS export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CHARGE_CATEGORIES,
    CHARGE_AMOUNT,
    DAILY_LIMIT,
    STREAK_MILESTONES,
    MONTHS,
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
  };
}
