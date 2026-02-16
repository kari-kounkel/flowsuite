// ═══════════════════════════════════════════════════════
// SCANFLOW THEME — Shared colors, styles, utilities
// ═══════════════════════════════════════════════════════

export function getTheme(darkMode) {
  return {
    bg: darkMode ? '#1a1410' : '#faf6f0',
    cardBg: darkMode ? '#2a2018' : '#fff',
    text: darkMode ? '#e8dcc8' : '#1a1410',
    accent: darkMode ? '#C17F3E' : '#8B5E34',
    border: darkMode ? '#3a2818' : '#e0d5c5',
    mutedText: darkMode ? '#998870' : '#887755',
    inputBg: darkMode ? '#1a1410' : '#f5f0e8',
  };
}

export function cardStyle(theme) {
  return {
    background: theme.cardBg, borderRadius: 12, padding: 20,
    border: `1px solid ${theme.border}`, marginBottom: 16
  };
}

export function inputStyle(theme) {
  return {
    width: '100%', padding: 10, fontSize: 14,
    background: theme.inputBg, color: theme.text,
    border: `1px solid ${theme.border}`, borderRadius: 6,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    boxSizing: 'border-box', marginBottom: 8
  };
}

export function bigButtonStyle(isActive, color, theme) {
  return {
    padding: '16px 24px', borderRadius: 10,
    border: `2px solid ${color || theme.accent}`,
    background: isActive ? (color || theme.accent) : 'transparent',
    color: isActive ? '#fff' : (color || theme.accent),
    cursor: 'pointer', fontSize: 16, fontWeight: 700,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    transition: 'all 0.15s', minWidth: 120
  };
}

// ─── STATUS COLORS ───
// "released" renamed to "available" (sleeve ready for reuse)
export const statusColors = {
  active: '#2E7D32', waiting: '#E65100', completed: '#1565C0',
  available: '#6A1B9A', on_hold: '#C62828', cancelled: '#555'
};

// ─── DEPARTMENT SHADING ───
// Background tints for dashboard cards by department
export const deptColors = {
  'DEPT0010': { bg: '#E8EAF6', border: '#5C6BC0', label: '#283593' },  // Admin — indigo
  'DEPT0011': { bg: '#E0F2F1', border: '#26A69A', label: '#00695C' },  // Customer Service — teal
  'DEPT0012': { bg: '#FFF3E0', border: '#FFA726', label: '#E65100' },  // Design/Graphics — orange
  'DEPT0013': { bg: '#E8F5E9', border: '#66BB6A', label: '#2E7D32' },  // Wide Format — green
  'DEPT0014': { bg: '#E3F2FD', border: '#42A5F5', label: '#1565C0' },  // Digital — blue
  'DEPT0015': { bg: '#FCE4EC', border: '#EF5350', label: '#C62828' },  // Customer Review — red/pink
};

// Dark mode variants
export const deptColorsDark = {
  'DEPT0010': { bg: '#1a1a2e', border: '#5C6BC0', label: '#9FA8DA' },
  'DEPT0011': { bg: '#0d2b2a', border: '#26A69A', label: '#80CBC4' },
  'DEPT0012': { bg: '#2a1f0d', border: '#FFA726', label: '#FFB74D' },
  'DEPT0013': { bg: '#0d2a0d', border: '#66BB6A', label: '#A5D6A7' },
  'DEPT0014': { bg: '#0d1a2e', border: '#42A5F5', label: '#90CAF9' },
  'DEPT0015': { bg: '#2e0d15', border: '#EF5350', label: '#EF9A9A' },
};

export function getDeptColor(deptId, darkMode) {
  const colors = darkMode ? deptColorsDark : deptColors;
  return colors[deptId] || { bg: 'transparent', border: '#888', label: '#888' };
}
