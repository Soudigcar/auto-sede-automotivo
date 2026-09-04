import assert from 'node:assert/strict';
import test from 'node:test';
import { evolutionTransportDiagnostic } from '../src/lib/server/evolution.ts';
import { resolveEvolutionAvailability } from '../src/lib/server/storeWhatsappChannel.ts';

test('Evolution live connected remains connected', () => {
  assert.deepEqual(
    resolveEvolutionAvailability(
      { status: 'connected' },
      { status: 'connected', live_error: null }
    ),
    {
      connected: true,
      status: 'connected',
      last_known_status: 'connected',
      temporarily_unavailable: false,
      source: 'evolution_live'
    }
  );
});

test('Evolution live disconnected is treated as a real disconnect', () => {
  assert.deepEqual(
    resolveEvolutionAvailability(
      { status: 'connected' },
      { status: 'disconnected', live_error: null }
    ),
    {
      connected: false,
      status: 'disconnected',
      last_known_status: 'disconnected',
      temporarily_unavailable: false,
      source: 'evolution_live'
    }
  );
});

test('transport failure preserves stored connected as temporarily unavailable and permits one provider attempt', () => {
  assert.deepEqual(
    resolveEvolutionAvailability(
      { status: 'connected' },
      { status: 'connected', live_error: 'Não foi possível conectar à Evolution API.' }
    ),
    {
      connected: true,
      status: 'temporarily_unavailable',
      last_known_status: 'connected',
      temporarily_unavailable: true,
      source: 'stored_degraded'
    }
  );
});

test('transport failure does not upgrade a stored disconnected integration', () => {
  assert.deepEqual(
    resolveEvolutionAvailability(
      { status: 'disconnected' },
      { status: 'disconnected', live_error: 'Não foi possível conectar à Evolution API.' }
    ),
    {
      connected: false,
      status: 'disconnected',
      last_known_status: 'disconnected',
      temporarily_unavailable: true,
      source: 'stored_unverified'
    }
  );
});

test('missing integration remains disconnected', () => {
  assert.deepEqual(resolveEvolutionAvailability(null), {
    connected: false,
    status: 'disconnected',
    last_known_status: 'disconnected',
    temporarily_unavailable: false,
    source: 'missing_integration'
  });
});

test('transport diagnostics keep only sanitized non-secret cause metadata', () => {
  const error = Object.assign(new TypeError('fetch failed https://secret.example/path?apikey=abc'), {
    code: 'FETCH_FAILED',
    cause: {
      name: 'ConnectTimeoutError',
      code: 'UND_ERR_CONNECT_TIMEOUT',
      errno: -110,
      syscall: 'connect',
      hostname: 'secret.example',
      address: '10.0.0.1',
      apikey: 'do-not-log'
    }
  });

  assert.deepEqual(evolutionTransportDiagnostic(error), {
    error_type: 'TypeError',
    error_code: 'FETCH_FAILED',
    cause_type: 'ConnectTimeoutError',
    cause_code: 'UND_ERR_CONNECT_TIMEOUT',
    cause_errno: '-110',
    cause_syscall: 'connect'
  });

  const serialized = JSON.stringify(evolutionTransportDiagnostic(error));
  assert.equal(serialized.includes('secret.example'), false);
  assert.equal(serialized.includes('10.0.0.1'), false);
  assert.equal(serialized.includes('do-not-log'), false);
});
