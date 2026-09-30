import { authErrorMessage } from './auth_errors.js';
import { formatDate, isTrustedInvoiceUrl } from './format.js';
import { createSupabase, isConfigured } from './supabase.js';
import { functionErrorCode, setBusy, setMessage, show } from './ui.js';

const dayMs = 86400000;

const loginForm = document.querySelector('#login-form');
const loginSubmit = document.querySelector('#login-submit');
const loginMessage = document.querySelector('#login-message');
const accountEmail = document.querySelector('#account-email');
const statusTitle = document.querySelector('#status-title');
const statusText = document.querySelector('#status-text');
const accountMessage = document.querySelector('#account-message');
const invoiceButton = document.querySelector('#invoice-button');
const subscribeLink = document.querySelector('#subscribe-link');
const cancelButton = document.querySelector('#cancel-button');
const cancelConfirm = document.querySelector('#cancel-confirm');
const cancelConfirmText = document.querySelector('#cancel-confirm-text');
const cancelYes = document.querySelector('#cancel-yes');
const cancelNo = document.querySelector('#cancel-no');

let supabase = null;
let subscription = null;

function lastAccessDay(row) {
  return new Date(new Date(row.access_until).getTime() - 1000);
}

function nextDueDate(row) {
  return new Date(new Date(row.access_until).getTime() - 4 * dayMs);
}

export function describeSubscription(row, now = new Date()) {
  if (!row) {
    return {
      title: 'Sem assinatura ativa',
      text: 'Assine para usar o Garimpo Fácil. Seus dados ficam guardados.',
      actions: ['subscribe'],
    };
  }

  const hasAccess = new Date(row.access_until) > now;
  const inTrial = new Date(row.trial_ends_at) > now;

  if (row.asaas_subscription_id) {
    if (row.status === 'overdue') {
      return {
        title: 'Mensalidade em aberto',
        text: hasAccess
          ? `Pague até ${formatDate(lastAccessDay(row))} para não perder o acesso ao app.`
          : 'O acesso ao app está suspenso até o pagamento ser confirmado. Seus dados continuam guardados.',
        actions: ['invoice', 'cancel'],
      };
    }
    const firstChargeAtTrialEnd = nextDueDate(row) <= new Date(new Date(row.trial_ends_at).getTime() + dayMs);
    if (inTrial && firstChargeAtTrialEnd) {
      return {
        title: `Teste grátis até ${formatDate(row.trial_ends_at)}`,
        text: `Sua assinatura já está ativada: a primeira mensalidade de R$ 19,90 vence em ${formatDate(nextDueDate(row))}.`,
        actions: ['invoice', 'cancel'],
      };
    }
    return {
      title: 'Assinatura ativa',
      text: `Próxima mensalidade de R$ 19,90: ${formatDate(nextDueDate(row))}. A forma de pagamento (Pix, boleto ou cartão) é escolhida em cada fatura.`,
      actions: ['invoice', 'cancel'],
    };
  }

  if (row.status === 'canceled' && hasAccess) {
    return {
      title: 'Assinatura cancelada',
      text: `Não haverá novas cobranças. Você pode usar o app até ${formatDate(lastAccessDay(row))}.`,
      actions: ['subscribe'],
    };
  }
  if (inTrial) {
    return {
      title: `Teste grátis até ${formatDate(row.trial_ends_at)}`,
      text: 'Ative a assinatura para continuar usando depois do teste. Você não paga nada antes do fim dele.',
      actions: ['subscribe'],
    };
  }
  return {
    title: 'Sem assinatura ativa',
    text: 'Assine para voltar a usar o app. Seus dados continuam guardados, do jeito que você deixou.',
    actions: ['subscribe'],
  };
}

async function loadSubscription() {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, trial_ends_at, access_until, asaas_subscription_id')
    .maybeSingle();
  if (error) {
    statusTitle.textContent = 'Não foi possível carregar sua assinatura';
    statusText.textContent = 'Confira sua conexão e recarregue a página.';
    [invoiceButton, subscribeLink, cancelButton].forEach((element) => {
      element.hidden = true;
    });
    return;
  }

  subscription = data;
  const view = describeSubscription(subscription);
  statusTitle.textContent = view.title;
  statusText.textContent = view.text;
  invoiceButton.hidden = !view.actions.includes('invoice');
  subscribeLink.hidden = !view.actions.includes('subscribe');
  cancelButton.hidden = !view.actions.includes('cancel');
  subscribeLink.textContent = subscription?.status === 'canceled' ? 'Assinar novamente' : 'Ativar assinatura';
  cancelConfirm.hidden = true;
}

async function enterAccount(session) {
  accountEmail.textContent = session.user.email;
  setMessage(accountMessage, '');
  show('account');
  await loadSubscription();
}

async function submitLogin(event) {
  event.preventDefault();
  const email = loginForm.elements.email.value.trim();
  const password = loginForm.elements.password.value;
  setMessage(loginMessage, '');
  if (!email || !password) return setMessage(loginMessage, 'Informe seu e-mail e senha.');

  setBusy(loginSubmit, true, 'Entrando…');
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error?.code === 'email_not_confirmed') {
      return setMessage(loginMessage, 'Confirme seu e-mail antes de entrar: procure o link que enviamos no cadastro.');
    }
    if (error) return setMessage(loginMessage, authErrorMessage(error));
    await enterAccount(data.session);
  } finally {
    setBusy(loginSubmit, false);
  }
}

async function openInvoice() {
  setMessage(accountMessage, '');
  setBusy(invoiceButton, true, 'Abrindo…');
  try {
    const { data, error } = await supabase.functions.invoke('create-checkout', { body: {} });
    if (error) {
      const code = await functionErrorCode(error);
      return setMessage(
        accountMessage,
        code === 'payment_provider_error'
          ? 'Não conseguimos falar com o sistema de pagamento. Tente de novo em alguns minutos.'
          : 'Não foi possível abrir a fatura agora. Tente de novo em alguns minutos.',
      );
    }
    if (data?.status === 'pending_payment' && isTrustedInvoiceUrl(data.invoiceUrl)) {
      window.location.assign(data.invoiceUrl);
      return;
    }
    setMessage(accountMessage, 'Nenhuma mensalidade em aberto agora.', 'success');
  } finally {
    setBusy(invoiceButton, false);
  }
}

function askCancel() {
  cancelConfirmText.textContent = subscription
    ? `Não haverá novas cobranças, e você continua usando o app até ${formatDate(lastAccessDay(subscription))}.`
    : 'Não haverá novas cobranças.';
  cancelConfirm.hidden = false;
  cancelButton.hidden = true;
}

function keepSubscription() {
  cancelConfirm.hidden = true;
  cancelButton.hidden = false;
}

async function confirmCancel() {
  setMessage(accountMessage, '');
  setBusy(cancelYes, true, 'Cancelando…');
  try {
    const { error } = await supabase.functions.invoke('cancel-subscription', { body: {} });
    if (error) {
      return setMessage(accountMessage, 'Não foi possível cancelar agora. Tente de novo ou escreva para suportegarimpofacil@gmail.com.');
    }
    await loadSubscription();
    setMessage(accountMessage, 'Assinatura cancelada. Não haverá novas cobranças.', 'success');
  } finally {
    setBusy(cancelYes, false);
  }
}

async function signOut() {
  await supabase.auth.signOut();
  subscription = null;
  loginForm.reset();
  show('login');
}

async function init() {
  if (!isConfigured) return show('unavailable');

  try {
    supabase = await createSupabase();
  } catch {
    return show('offline');
  }

  loginForm.addEventListener('submit', submitLogin);
  loginForm.addEventListener('input', () => setMessage(loginMessage, ''));
  invoiceButton.addEventListener('click', openInvoice);
  cancelButton.addEventListener('click', askCancel);
  cancelNo.addEventListener('click', keepSubscription);
  cancelYes.addEventListener('click', confirmCancel);
  document.querySelector('#sign-out').addEventListener('click', signOut);

  const { data } = await supabase.auth.getSession();
  if (data.session) return enterAccount(data.session);
  show('login');
}

if (typeof document !== 'undefined' && document.querySelector('#login-form')) init();
