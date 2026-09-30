import { saveCheckout } from './checkout_state.js';
import { siteUrl } from './config.js';
import { formatCpfCnpj, isValidCpfCnpj, onlyDigits } from './cpf_cnpj.js';
import { formatDate } from './format.js';
import { createSupabase, isConfigured } from './supabase.js';

const redirectTo = `${siteUrl}/assinar.html`;

const views = document.querySelectorAll('[data-view]');
const accountForm = document.querySelector('#account-form');
const accountTitle = document.querySelector('#account-title');
const accountSubmit = document.querySelector('#account-submit');
const accountMessage = document.querySelector('#account-message');
const confirmPasswordField = document.querySelector('#confirm-password-field');
const modeButtons = document.querySelectorAll('[data-mode]');
const confirmEmail = document.querySelector('#confirm-email-address');
const confirmMessage = document.querySelector('#confirm-message');
const billingForm = document.querySelector('#billing-form');
const billingFields = document.querySelector('#billing-fields');
const billingEmail = document.querySelector('#billing-email');
const billingNote = document.querySelector('#billing-note');
const billingSubmit = document.querySelector('#billing-submit');
const billingMessage = document.querySelector('#billing-message');
const skipPaymentHint = document.querySelector('#skip-payment-hint');
const cpfInput = document.querySelector('#cpf-cnpj');

let supabase = null;
let mode = 'signup';
let pendingEmail = '';
let subscription = null;
let billingShown = false;

function show(name) {
  views.forEach((view) => {
    view.hidden = view.dataset.view !== name;
  });
  window.scrollTo(0, 0);
}

function setMessage(element, text, kind = 'error') {
  element.textContent = text;
  element.dataset.kind = kind;
  element.hidden = !text;
}

function setBusy(button, busy, busyLabel) {
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyLabel;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
  button.disabled = busy;
}

function setMode(next) {
  mode = next;
  const signup = mode === 'signup';
  accountTitle.textContent = signup ? 'Crie sua conta' : 'Entre na sua conta';
  accountSubmit.textContent = signup ? 'Criar conta' : 'Entrar';
  confirmPasswordField.hidden = !signup;
  accountForm.elements.confirmPassword.required = signup;
  accountForm.elements.password.autocomplete = signup ? 'new-password' : 'current-password';
  modeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  setMessage(accountMessage, '');
}

function authErrorMessage(error) {
  switch (error?.code) {
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos.';
    case 'user_already_exists':
    case 'email_exists':
      return 'Esse e-mail já tem conta. Entre com sua senha.';
    case 'weak_password':
      return 'Senha fraca. Use pelo menos 6 caracteres.';
    case 'email_address_invalid':
      return 'Informe um e-mail válido.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
    default:
      return 'Não foi possível continuar agora. Confira sua conexão e tente de novo.';
  }
}

function showConfirmEmail(email) {
  pendingEmail = email;
  confirmEmail.textContent = email;
  setMessage(confirmMessage, '');
  show('confirm-email');
}

async function submitAccount(event) {
  event.preventDefault();
  const email = accountForm.elements.email.value.trim();
  const password = accountForm.elements.password.value;
  setMessage(accountMessage, '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMessage(accountMessage, 'Informe um e-mail válido.');
  if (password.length < 6) return setMessage(accountMessage, 'A senha precisa ter pelo menos 6 caracteres.');
  if (mode === 'signup' && password !== accountForm.elements.confirmPassword.value) {
    return setMessage(accountMessage, 'As senhas não coincidem.');
  }

  setBusy(accountSubmit, true, mode === 'signup' ? 'Criando conta…' : 'Entrando…');
  try {
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) return setMessage(accountMessage, authErrorMessage(error));
      if (data.user && data.user.identities?.length === 0) {
        setMode('login');
        accountForm.elements.email.value = email;
        return setMessage(accountMessage, 'Esse e-mail já tem conta. Entre com sua senha.');
      }
      if (data.session) return enterBilling(data.session);
      return showConfirmEmail(email);
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error?.code === 'email_not_confirmed') return showConfirmEmail(email);
    if (error) return setMessage(accountMessage, authErrorMessage(error));
    return enterBilling(data.session);
  } finally {
    setBusy(accountSubmit, false);
  }
}

async function resendConfirmation() {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: pendingEmail,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) return setMessage(confirmMessage, authErrorMessage(error));
  setMessage(confirmMessage, 'E-mail reenviado. Confira também a caixa de spam.', 'success');
}

function describeSubscription(row) {
  if (!row) return 'Você não paga nada agora: a primeira mensalidade de R$ 19,90 só vence no fim do teste grátis.';
  if (row.asaas_subscription_id && row.status === 'active') {
    return 'Sua assinatura está ativa. Continue para ver se há alguma mensalidade em aberto.';
  }
  if (row.asaas_subscription_id) {
    return 'Você já tem uma assinatura. Continue para ver a mensalidade em aberto.';
  }
  if (new Date(row.trial_ends_at) > new Date()) {
    return `Seu teste grátis vai até ${formatDate(row.trial_ends_at)}. A primeira mensalidade de R$ 19,90 vence nesse dia — você não paga nada agora.`;
  }
  return 'Seu teste grátis terminou. A primeira mensalidade de R$ 19,90 vence hoje e o acesso volta assim que o pagamento for confirmado.';
}

async function enterBilling(session) {
  billingShown = true;
  billingEmail.textContent = session.user.email;
  setMessage(billingMessage, '');
  show('billing');

  const { data } = await supabase
    .from('subscriptions')
    .select('status, trial_ends_at, access_until, asaas_subscription_id')
    .maybeSingle();
  subscription = data;

  const hasSubscription = Boolean(subscription?.asaas_subscription_id);
  billingFields.hidden = hasSubscription;
  billingForm.elements.name.required = !hasSubscription;
  billingForm.elements.cpfCnpj.required = !hasSubscription;
  billingForm.elements.terms.required = !hasSubscription;
  billingSubmit.textContent = hasSubscription ? 'Ver minha assinatura' : 'Ir para o pagamento';
  skipPaymentHint.hidden = hasSubscription;
  billingNote.textContent = describeSubscription(subscription);
}

async function checkoutErrorMessage(error) {
  const body = await error?.context?.json?.().catch(() => null);
  switch (body?.error) {
    case 'invalid_cpf_cnpj':
      return 'CPF ou CNPJ inválido. Confira os números.';
    case 'invalid_name':
      return 'Informe seu nome completo.';
    case 'unauthorized':
      return 'Sua sessão expirou. Entre de novo.';
    case 'payment_provider_error':
      return 'Não conseguimos falar com o sistema de pagamento. Tente de novo em alguns minutos.';
    default:
      return 'Não foi possível continuar agora. Tente de novo em alguns minutos.';
  }
}

async function submitBilling(event) {
  event.preventDefault();
  setMessage(billingMessage, '');
  const hasSubscription = Boolean(subscription?.asaas_subscription_id);
  const name = billingForm.elements.name.value.trim();
  const cpfCnpj = onlyDigits(billingForm.elements.cpfCnpj.value);

  if (!hasSubscription) {
    if (name.length < 3) return setMessage(billingMessage, 'Informe seu nome completo.');
    if (!isValidCpfCnpj(cpfCnpj)) return setMessage(billingMessage, 'CPF ou CNPJ inválido. Confira os números.');
    if (!billingForm.elements.terms.checked) {
      return setMessage(billingMessage, 'Para continuar, aceite os Termos de Uso.');
    }
  }

  setBusy(billingSubmit, true, 'Preparando sua fatura…');
  try {
    const { data, error } = await supabase.functions.invoke('create-checkout', { body: { name, cpfCnpj } });
    if (error) return setMessage(billingMessage, await checkoutErrorMessage(error));
    saveCheckout({ ...data, trialEndsAt: subscription?.trial_ends_at ?? null });
    window.location.assign('sucesso.html');
  } finally {
    setBusy(billingSubmit, false);
  }
}

function skipPayment(event) {
  event.preventDefault();
  saveCheckout({ status: 'trial_only', trialEndsAt: subscription?.trial_ends_at ?? null });
  window.location.assign('sucesso.html');
}

async function signOut() {
  await supabase.auth.signOut();
  billingShown = false;
  subscription = null;
  setMode('login');
  show('account');
}

function linkErrorFromUrl() {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
  const code = params.get('error_code');
  if (!code) return '';
  history.replaceState(null, '', window.location.pathname);
  return code === 'otp_expired'
    ? 'O link de confirmação expirou. Entre com seu e-mail e senha para receber um novo.'
    : 'Não foi possível confirmar pelo link. Entre com seu e-mail e senha.';
}

async function init() {
  if (!isConfigured) return show('unavailable');

  try {
    supabase = await createSupabase();
  } catch {
    return show('offline');
  }

  modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
  accountForm.addEventListener('submit', submitAccount);
  billingForm.addEventListener('submit', submitBilling);
  billingForm.addEventListener('input', () => setMessage(billingMessage, ''));
  accountForm.addEventListener('input', () => setMessage(accountMessage, ''));
  cpfInput.addEventListener('input', () => {
    cpfInput.value = formatCpfCnpj(cpfInput.value);
  });
  document.querySelector('#resend-confirmation').addEventListener('click', resendConfirmation);
  document.querySelector('#confirmed-login').addEventListener('click', () => {
    setMode('login');
    accountForm.elements.email.value = pendingEmail;
    show('account');
  });
  document.querySelector('#skip-payment').addEventListener('click', skipPayment);
  document.querySelector('#sign-out').addEventListener('click', signOut);

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session && !billingShown) enterBilling(session);
  });

  const linkError = linkErrorFromUrl();
  const { data } = await supabase.auth.getSession();
  if (data.session) return enterBilling(data.session);

  setMode(new URLSearchParams(window.location.search).get('entrar') === null ? 'signup' : 'login');
  if (linkError) {
    setMode('login');
    setMessage(accountMessage, linkError);
  }
  show('account');
}

init();
