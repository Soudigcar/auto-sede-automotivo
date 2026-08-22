import assert from 'node:assert/strict';
import test from 'node:test';
import {
  asTeamRegistrationUrl,
  TEAM_REGISTRATION_PASSWORD_MIN_LENGTH,
  teamRegistrationPasswordError
} from '../src/lib/storeTeamRegistration.ts';

test('convite seguro aceita somente URL http/https da rota de cadastro com token', () => {
  assert.equal(
    asTeamRegistrationUrl('https://sistemaautomotivo.autosede.com.br/equipe/cadastro/token-seguro'),
    'https://sistemaautomotivo.autosede.com.br/equipe/cadastro/token-seguro'
  );
  assert.equal(asTeamRegistrationUrl(null), null);
  assert.equal(asTeamRegistrationUrl('null'), null);
  assert.equal(asTeamRegistrationUrl('javascript:alert(1)'), null);
  assert.equal(asTeamRegistrationUrl('https://example.com/outra/rota/token'), null);
  assert.equal(asTeamRegistrationUrl('https://example.com/equipe/cadastro/'), null);
});

test('politica de senha do cadastro exige 12 caracteres e quatro classes', () => {
  assert.equal(TEAM_REGISTRATION_PASSWORD_MIN_LENGTH, 12);
  assert.ok(teamRegistrationPasswordError('Curta1!'));
  assert.ok(teamRegistrationPasswordError('somente-minuscula-123!'));
  assert.ok(teamRegistrationPasswordError('SOMENTE-MAIUSCULA-123!'));
  assert.ok(teamRegistrationPasswordError('SemNumeroNemSimbolo'));
  assert.equal(teamRegistrationPasswordError('SenhaForte#2026'), null);
});
