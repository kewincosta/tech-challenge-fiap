import { describe, expect, it } from 'vitest';
import { InvalidServiceDurationError } from '../errors/invalid-service-duration.error';
import { ServiceDuration } from './service-duration';

describe('ServiceDuration', () => {
  it('should accept a positive whole number of minutes', () => {
    expect(ServiceDuration.fromMinutes(90).minutes).toBe(90);
  });

  it('should reject zero', () => {
    expect(() => ServiceDuration.fromMinutes(0)).toThrow(InvalidServiceDurationError);
  });

  it('should reject a negative value', () => {
    expect(() => ServiceDuration.fromMinutes(-30)).toThrow(InvalidServiceDurationError);
  });

  it('should reject a fractional value', () => {
    expect(() => ServiceDuration.fromMinutes(45.5)).toThrow(InvalidServiceDurationError);
  });
});
