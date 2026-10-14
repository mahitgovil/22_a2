const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export const money = (n) => (n === null || n === undefined ? '–' : inr.format(n));
export const moneyShort = (n) => (n === null || n === undefined ? '–' : inr0.format(n));
export const num = (n) => (n === null || n === undefined ? '–' : new Intl.NumberFormat('en-IN').format(n));

export const dateTime = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '–';
export const dateOnly = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '–';
export const timeOnly = (d) => (d ? new Date(d).toLocaleTimeString('en-IN') : '–');

export const distance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

// Safe localStorage helpers (storage can be unavailable or full).
export const store = {
  get(key, fallback) {
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch { /* ignore */ }
  },
};
