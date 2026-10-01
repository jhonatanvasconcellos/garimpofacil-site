export function show(name) {
  document.querySelectorAll('[data-view]').forEach((view) => {
    view.hidden = view.dataset.view !== name;
  });
  window.scrollTo(0, 0);
}

export function setMessage(element, text, kind = 'error') {
  element.textContent = text;
  element.dataset.kind = kind;
  element.hidden = !text;
}

export function setBusy(button, busy, busyLabel) {
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyLabel;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
  button.disabled = busy;
}

export async function functionErrorCode(error) {
  const body = await error?.context?.json?.().catch(() => null);
  return body?.error ?? null;
}
