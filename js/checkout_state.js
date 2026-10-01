const key = 'garimpo_checkout';

export function saveCheckout(state) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    return;
  }
}

export function readCheckout() {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}
