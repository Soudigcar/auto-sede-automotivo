export type MicrophonePermissionState = PermissionState | 'unsupported' | 'unknown';

export function microphoneAccessErrorMessage(
  error: unknown,
  permissionState: MicrophonePermissionState
) {
  const name = error instanceof DOMException || error instanceof Error
    ? error.name
    : '';

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Nenhum microfone foi encontrado. Conecte ou selecione um microfone nas configurações do navegador.';
  }

  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'O microfone está ocupado ou não pôde ser iniciado. Feche outros aplicativos que estejam usando o áudio e tente novamente.';
  }

  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'O microfone selecionado não aceita a configuração de gravação. Escolha outro dispositivo e tente novamente.';
  }

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    if (permissionState === 'granted') {
      return 'O Chrome está autorizado neste site, mas o macOS bloqueou o microfone. Em Ajustes do Sistema, abra Privacidade e Segurança > Microfone, libere o Chrome e reinicie o navegador.';
    }
    if (permissionState === 'denied') {
      return 'O microfone está bloqueado para este site. Libere o acesso no ícone ao lado do endereço e recarregue a página.';
    }
    return 'O acesso ao microfone não foi concluído. Libere o Chrome no navegador e no macOS, recarregue a página e tente novamente.';
  }

  return 'Não foi possível iniciar o microfone. Verifique o dispositivo de entrada e tente novamente.';
}
