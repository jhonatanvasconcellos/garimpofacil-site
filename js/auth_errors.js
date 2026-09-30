export function authErrorMessage(error) {
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
