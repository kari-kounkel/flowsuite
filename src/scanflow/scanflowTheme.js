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

export const statusColors = {
  active: '#2E7D32', waiting: '#E65100', completed: '#1565C0',
  released: '#6A1B9A', on_hold: '#C62828', cancelled: '#555'
};
