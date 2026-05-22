import { describe, it, expect } from 'vitest';
import {
  celsiusToFahrenheit,
  calcDewPoint,
  calcVPD,
} from '../../lib/domain-utils.js';

describe('celsiusToFahrenheit', () => {
  it('converts 0°C to 32°F', () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
  });

  it('converts 100°C to 212°F', () => {
    expect(celsiusToFahrenheit(100)).toBe(212);
  });

  it('converts 20°C to 68°F', () => {
    expect(celsiusToFahrenheit(20)).toBe(68);
  });

  it('converts 23.4°C to 74.1°F (rounded to 1 decimal)', () => {
    expect(celsiusToFahrenheit(23.4)).toBe(74.1);
  });

  it('handles negative temperatures', () => {
    expect(celsiusToFahrenheit(-10)).toBe(14);
  });
});

describe('calcDewPoint', () => {
  it('returns a value in Fahrenheit (higher than 32 for typical conditions)', () => {
    const dp = calcDewPoint(25, 60);
    expect(dp).toBeGreaterThan(32);
    expect(dp).toBeLessThan(77); // dew point must be below ambient 77°F
  });

  it('dew point equals temperature at 100% RH', () => {
    const tempC = 20;
    const dp = calcDewPoint(tempC, 100);
    const tempF = celsiusToFahrenheit(tempC);
    expect(dp).toBeCloseTo(tempF, 0);
  });

  it('dew point decreases as humidity decreases', () => {
    const dp80 = calcDewPoint(25, 80);
    const dp50 = calcDewPoint(25, 50);
    const dp20 = calcDewPoint(25, 20);
    expect(dp80).toBeGreaterThan(dp50);
    expect(dp50).toBeGreaterThan(dp20);
  });

  it('returns a reasonable value for typical grow-room conditions (25°C, 60% RH)', () => {
    const dp = calcDewPoint(25, 60);
    // Expected dew point ~16.7°C = 62.1°F
    expect(dp).toBeGreaterThan(60);
    expect(dp).toBeLessThan(65);
  });
});

describe('calcVPD', () => {
  it('returns a positive value', () => {
    expect(calcVPD(25, 60)).toBeGreaterThan(0);
  });

  it('returns 0 kPa at 100% RH (no deficit)', () => {
    expect(calcVPD(25, 100)).toBeCloseTo(0, 2);
  });

  it('VPD increases as humidity decreases', () => {
    const vpd80 = calcVPD(25, 80);
    const vpd60 = calcVPD(25, 60);
    const vpd40 = calcVPD(25, 40);
    expect(vpd40).toBeGreaterThan(vpd60);
    expect(vpd60).toBeGreaterThan(vpd80);
  });

  it('VPD increases as temperature increases', () => {
    const vpd20 = calcVPD(20, 60);
    const vpd25 = calcVPD(25, 60);
    const vpd30 = calcVPD(30, 60);
    expect(vpd30).toBeGreaterThan(vpd25);
    expect(vpd25).toBeGreaterThan(vpd20);
  });

  it('returns 3 decimal places for typical conditions (25°C, 60% RH)', () => {
    const vpd = calcVPD(25, 60);
    // Saturation vapor pressure at 25°C ~ 3.169 kPa; actual ~ 1.901; VPD ~ 1.268
    expect(vpd).toBeGreaterThan(1.0);
    expect(vpd).toBeLessThan(1.5);
    // Verify 3 decimal precision
    expect(String(vpd).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);
  });

  it('returns a value in the seedling optimal range for typical seedling conditions (22°C, 75% RH)', () => {
    const vpd = calcVPD(22, 75);
    // Expected ~0.65 kPa — within seedling range (0.4–0.8)
    expect(vpd).toBeGreaterThan(0.4);
    expect(vpd).toBeLessThan(0.8);
  });

  it('returns a value in the late flower range for typical flower conditions (26°C, 50% RH)', () => {
    const vpd = calcVPD(26, 50);
    // Expected ~1.7 kPa — within late flower range (1.5–2.0)
    expect(vpd).toBeGreaterThan(1.5);
    expect(vpd).toBeLessThan(2.1);
  });
});
