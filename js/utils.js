export function escapeHtml(str) {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmt(n, digits = 1) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function pct(n, digits = 2) {
  if (!Number.isFinite(n)) return "—";
  return (n * 100).toFixed(digits) + "%";
}

export function toast(el, message, duration = 2000) {
  if (!el) return;
  const prev = el.textContent;
  el.textContent = message;
  setTimeout(() => {
    el.textContent = prev;
  }, duration);
}
