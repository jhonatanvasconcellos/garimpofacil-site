import { readCheckout } from './checkout_state.js';
import { formatDate, isTrustedInvoiceUrl } from './format.js';

const title = document.querySelector('#success-title');
const lead = document.querySelector('#success-lead');
const invoiceBox = document.querySelector('#invoice-box');
const invoiceText = document.querySelector('#invoice-text');
const invoiceLink = document.querySelector('#invoice-link');

const checkout = readCheckout();
const trialEnd = checkout?.trialEndsAt && new Date(checkout.trialEndsAt) > new Date()
  ? formatDate(checkout.trialEndsAt)
  : null;

if (checkout?.status === 'pending_payment' && isTrustedInvoiceUrl(checkout.invoiceUrl)) {
  title.textContent = 'Tudo certo! Sua conta está pronta.';
  lead.textContent = trialEnd
    ? `Aproveite seu teste grátis até ${trialEnd}.`
    : 'Assim que o pagamento for confirmado, o acesso é liberado no app.';
  invoiceText.textContent = `A mensalidade de R$ 19,90 vence em ${formatDate(checkout.dueDate)}. Você pode pagar agora ou até lá, por Pix, boleto ou cartão.`;
  invoiceLink.href = checkout.invoiceUrl;
  invoiceBox.hidden = false;
} else if (checkout?.status === 'up_to_date') {
  title.textContent = 'Sua assinatura está em dia.';
  lead.textContent = 'Nada para pagar agora. É só entrar no app.';
} else {
  title.textContent = 'Sua conta está pronta!';
  lead.textContent = trialEnd
    ? `Aproveite seu teste grátis até ${trialEnd}. Para continuar depois disso, ative a assinatura em garimpofacil.app.br/assinar.html.`
    : 'Aproveite seu teste grátis. Para continuar depois dele, ative a assinatura em garimpofacil.app.br/assinar.html.';
}
