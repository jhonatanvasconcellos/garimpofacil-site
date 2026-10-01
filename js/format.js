export function formatDate(value) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00-03:00`) : new Date(value);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
    .format(date);
}

export function isTrustedInvoiceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)asaas\.com$/.test(url.hostname);
  } catch {
    return false;
  }
}
