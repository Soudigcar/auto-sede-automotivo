import assert from 'node:assert/strict';
import { describe,it } from 'node:test';
import { buildFinancingReadiness,canTransitionFinancingSimulation,financingResultPayload,normalizeFinancingPaymentType,sanitizeFinancingOperatorNotes } from '../src/lib/financingSimulationV1';
import { buildAutocarFinancingProjectionV1 } from '../src/lib/server/autocar/financingProjectionV1';

describe('Financiamento V1',()=>{
  it('normaliza payment_type legado',()=>{
    assert.equal(normalizeFinancingPaymentType('credit_letter'),'consortium');
    assert.equal(normalizeFinancingPaymentType('consortium'),'consortium');
  });
  it('bloqueia saltos de etapa',()=>{
    assert.equal(canTransitionFinancingSimulation('collecting_data','ready_to_submit'),true);
    assert.equal(canTransitionFinancingSimulation('collecting_data','result_available'),false);
  });
  it('exige todos os dados antes do envio',()=>{
    const result=buildFinancingReadiness({hasVehicle:true,hasDriverLicense:true,cpfDigits:'12345678901',birthDate:'1990-01-01',requestedWithoutDownPayment:true,requestedDownPaymentValue:null,requestedInstallmentCount:48});
    assert.equal(result.ready,true);
  });
  it('exige fonte para indicador e banco para resultado positivo',()=>{
    assert.throws(()=>financingResultPayload({outcome:'preapproved',result_source:'manual'}),/banco responsável/i);
    assert.throws(()=>financingResultPayload({outcome:'preapproved',result_source:'manual',financing_bank:'Banco',approval_indicator_percent:80}),/origem do indicador/i);
  });
  it('sanitiza PII e não a projeta para a AUTOCAR',()=>{
    const sanitized=sanitizeFinancingOperatorNotes('CPF 123.456.789-01 nascimento 12/03/1990 email cliente@exemplo.com');
    assert.doesNotMatch(String(sanitized),/123\.456/);
    const projection=buildAutocarFinancingProjectionV1({customerDataReady:true,simulation:{id:'1',status:'result_available',outcome:'preapproved',result_source:'manual',result_received_at:'2026-09-02T00:00:00Z',financing_bank:'Banco',cpf:'12345678901',birth_date:'1990-01-01'}});
    const serialized=JSON.stringify(projection);
    assert.equal(serialized.includes('12345678901'),false);
    assert.equal(serialized.includes('1990-01-01'),false);
  });
});
