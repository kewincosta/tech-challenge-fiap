import { describe, expect, it } from 'vitest';
import { InvalidPersonDocumentError } from '../errors/invalid-person-document.error';
import { PersonDocument } from './person-document';

describe('PersonDocument', () => {
  it('accepts a valid CPF and strips punctuation to digits only', () => {
    const document = PersonDocument.create('111.444.777-35');

    expect(document.value).toBe('11144477735');
  });

  it('accepts a valid CNPJ and strips punctuation to digits only', () => {
    const document = PersonDocument.create('11.122.233/0001-83');

    expect(document.value).toBe('11122233000183');
  });

  it('reports CPF as the kind for an 11-digit document', () => {
    const document = PersonDocument.create('11144477735');

    expect(document.kind).toBe('CPF');
  });

  it('reports CNPJ as the kind for a 14-digit document', () => {
    const document = PersonDocument.create('11122233000183');

    expect(document.kind).toBe('CNPJ');
  });

  it('rejects a CPF with wrong check digits', () => {
    expect(() => PersonDocument.create('11144477736')).toThrow(InvalidPersonDocumentError);
  });

  it('rejects a CNPJ with wrong check digits', () => {
    expect(() => PersonDocument.create('11122233000184')).toThrow(InvalidPersonDocumentError);
  });

  it('rejects a repeated digit sequence at CPF length', () => {
    expect(() => PersonDocument.create('11111111111')).toThrow(InvalidPersonDocumentError);
  });

  it('rejects a repeated digit sequence at CNPJ length', () => {
    expect(() => PersonDocument.create('11111111111111')).toThrow(InvalidPersonDocumentError);
  });

  it('rejects a document that is neither CPF nor CNPJ length', () => {
    expect(() => PersonDocument.create('123456789')).toThrow(InvalidPersonDocumentError);
  });

  it('reports equality only between documents with the same value', () => {
    expect(PersonDocument.create('11144477735').equals(PersonDocument.create('11144477735'))).toBe(
      true,
    );
    expect(PersonDocument.create('11144477735').equals(PersonDocument.create('52998224725'))).toBe(
      false,
    );
    expect(PersonDocument.create('11144477735').equals(undefined)).toBe(false);
  });
});
