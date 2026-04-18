export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function distance(a, b) {
  return Math.sqrt(distanceSq(a, b));
}

export function pointInRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function makeSelectionRect(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  };
}

export function formatCost(cost = {}) {
  const labels = {
    gold: "золото",
    wood: "дерево",
    supply: "лимит"
  };
  return Object.entries(cost)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `${value} ${labels[key] ?? key}`)
    .join(" / ");
}
