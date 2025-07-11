/**
 * Circular Progress Spinner Component
 * Usage: createCircularProgress({ value, label, state, id })
 * - value: 0-100 (percent)
 * - label: status message (optional)
 * - state: '', 'error', 'warning', 'complete' (optional)
 * - id: DOM id (optional)
 */
export function createCircularProgress({ value = 0, label = '', state = '', id = '' } = {}) {
  const size = 80, stroke = 8, radius = (size - stroke) / 2, circ = 2 * Math.PI * radius;
  const percent = Math.max(0, Math.min(100, value));
  const dash = (percent / 100) * circ;

  const wrapper = document.createElement('div');
  wrapper.className = `circular-progress${state ? ' ' + state : ''}`;
  if (id) wrapper.id = id;
  wrapper.setAttribute('role', 'progressbar');
  wrapper.setAttribute('aria-valuenow', percent);
  wrapper.setAttribute('aria-valuemin', 0);
  wrapper.setAttribute('aria-valuemax', 100);
  wrapper.setAttribute('aria-label', label ? `${label} ${percent}%` : `${percent}%`);

  wrapper.innerHTML = `
    <svg width="${size}" height="${size}">
      <circle class="circular-bg" cx="${size/2}" cy="${size/2}" r="${radius}" />
      <circle class="circular-fg" cx="${size/2}" cy="${size/2}" r="${radius}"
        style="stroke-dasharray: ${dash} ${circ}; stroke-dashoffset: 0;" />
    </svg>
    <span class="circular-label">${percent}%</span>
    ${label ? `<span class="circular-status">${label}</span>` : ''}
  `;
  return wrapper;
} 