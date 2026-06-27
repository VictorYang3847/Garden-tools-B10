export function fmt(n, digits = 1) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function pct(n, digits = 2) {
  if (!Number.isFinite(n)) return "—";
  return (n * 100).toFixed(digits) + "%";
}

export function toast(el, message, duration = 2000) {
  const prev = el.textContent;
  el.textContent = message;
  setTimeout(() => {
    el.textContent = prev;
  }, duration);
}
