import { describe, it, expect } from 'vitest'
import { assessRisk, getWilayaRisk, getAllWilayaRisks } from '../risk-engine'

function makeInput(overrides: Record<string, unknown> = {}) {
  return {
    phone: '0555123456',
    wilaya: 'Alger',
    customerName: 'Test Customer',
    orderValue: 3000,
    itemCount: 1,
    aiConfidence: 0.8,
    messageCount: 5,
    orderHour: 14,
    hasAddress: true,
    isNewCustomer: true,
    ...overrides,
  }
}

describe('Risk Engine — assessRisk()', () => {
  it('returns low risk for a safe order from Alger with good signals', () => {
    const result = assessRisk(makeInput({
      wilaya: 'Alger',
      orderValue: 2000,
      itemCount: 1,
      aiConfidence: 0.9,
      messageCount: 10,
      orderHour: 14,
      hasAddress: true,
      customer: {
        order_count: 5,
        total_spent: 15000,
        is_blocked: false,
        returned_orders: 0,
        wilaya_count: 1,
        name_count: 1,
      },
    }))
    expect(result.level).toBe('low')
    expect(result.recommendation).toBe('auto_confirm')
    expect(result.overallScore).toBeLessThan(25)
  })

  it('returns high/critical risk for a blocked customer with high returns', () => {
    const result = assessRisk(makeInput({
      wilaya: 'Tamanrasset',
      orderValue: 15000,
      itemCount: 5,
      orderHour: 2,
      hasAddress: false,
      aiConfidence: 0.3,
      customer: {
        order_count: 10,
        total_spent: 5000,
        is_blocked: true,
        returned_orders: 8,
        wilaya_count: 3,
        name_count: 2,
      },
    }))
    expect(['high', 'critical']).toContain(result.level)
    expect(['reject', 'call_verify']).toContain(result.recommendation)
    expect(result.overallScore).toBeGreaterThanOrEqual(50)
  })

  it('returns medium risk for a new customer from a moderate wilaya', () => {
    const result = assessRisk(makeInput({
      wilaya: 'Constantine',
      isNewCustomer: true,
      orderValue: 5000,
    }))
    expect(['medium', 'low']).toContain(result.level)
  })

  it('returns high risk for high-value late-night order with no address', () => {
    const result = assessRisk(makeInput({
      orderValue: 20000,
      itemCount: 8,
      orderHour: 3,
      hasAddress: false,
      aiConfidence: 0.2,
      messageCount: 1,
      wilaya: 'Djelfa',
    }))
    expect(result.overallScore).toBeGreaterThanOrEqual(45)
    expect(['high', 'critical']).toContain(result.level)
  })

  it('assigns higher wilaya risk for remote wilayas', () => {
    const alger = assessRisk(makeInput({ wilaya: 'Alger' }))
    const tamanrasset = assessRisk(makeInput({ wilaya: 'Tamanrasset' }))
    expect(tamanrasset.overallScore).toBeGreaterThan(alger.overallScore)
  })

  it('assigns higher risk for very high order values', () => {
    const low = assessRisk(makeInput({ orderValue: 1000, itemCount: 1 }))
    const high = assessRisk(makeInput({ orderValue: 20000, itemCount: 10 }))
    expect(high.overallScore).toBeGreaterThan(low.overallScore)
  })

  it('assigns higher risk for customers with high return rate', () => {
    const good = assessRisk(makeInput({
      customer: { order_count: 10, total_spent: 30000, is_blocked: false, returned_orders: 0, wilaya_count: 1, name_count: 1 },
    }))
    const bad = assessRisk(makeInput({
      customer: { order_count: 10, total_spent: 30000, is_blocked: false, returned_orders: 8, wilaya_count: 1, name_count: 1 },
    }))
    expect(bad.overallScore).toBeGreaterThan(good.overallScore)
  })

  it('penalizes customers using multiple wilayas and names', () => {
    const normal = assessRisk(makeInput({
      customer: { order_count: 5, total_spent: 10000, is_blocked: false, returned_orders: 0, wilaya_count: 1, name_count: 1 },
    }))
    const suspicious = assessRisk(makeInput({
      customer: { order_count: 5, total_spent: 10000, is_blocked: false, returned_orders: 0, wilaya_count: 4, name_count: 3 },
    }))
    expect(suspicious.overallScore).toBeGreaterThan(normal.overallScore)
  })

  it('penalizes late-night orders (11PM-5AM)', () => {
    const daytime = assessRisk(makeInput({ orderHour: 14 }))
    const latenight = assessRisk(makeInput({ orderHour: 3 }))
    expect(latenight.overallScore).toBeGreaterThan(daytime.overallScore)
  })

  it('penalizes low AI confidence', () => {
    const high = assessRisk(makeInput({ aiConfidence: 0.95 }))
    const low = assessRisk(makeInput({ aiConfidence: 0.1 }))
    expect(low.overallScore).toBeGreaterThan(high.overallScore)
  })

  it('always returns all required fields', () => {
    const result = assessRisk(makeInput())
    expect(result.overallScore).toBeGreaterThanOrEqual(0)
    expect(result.overallScore).toBeLessThanOrEqual(100)
    expect(['low', 'medium', 'high', 'critical']).toContain(result.level)
    expect(['auto_confirm', 'manual_review', 'call_verify', 'reject']).toContain(result.recommendation)
    expect(result.explanation).toBeTruthy()
    expect(result.explanationAr).toBeTruthy()
    expect(result.factors.length).toBeGreaterThan(0)
  })

  it('includes Arabic explanation', () => {
    const result = assessRisk(makeInput())
    expect(result.explanationAr).toMatch(/[\u0600-\u06FF]/)
  })

  it('each factor has id, name, score, weight', () => {
    const result = assessRisk(makeInput())
    for (const factor of result.factors) {
      expect(factor.id).toBeTruthy()
      expect(factor.name).toBeTruthy()
      expect(factor.score).toBeGreaterThanOrEqual(0)
      expect(factor.score).toBeLessThanOrEqual(100)
      expect(factor.weight).toBeGreaterThan(0)
      expect(factor.weight).toBeLessThanOrEqual(1)
    }
  })
})

describe('Risk Engine — Utility Functions', () => {
  it('getWilayaRisk returns profile for known wilaya', () => {
    const profile = getWilayaRisk('Alger')
    expect(profile.wilaya).toBe('Alger')
    expect(profile.returnRate).toBeLessThan(1)
    expect(profile.riskMultiplier).toBeGreaterThan(0)
  })

  it('getWilayaRisk returns default for unknown wilaya', () => {
    const profile = getWilayaRisk('NonExistentWilaya')
    expect(profile.wilaya).toBe('Unknown')
    expect(profile.riskMultiplier).toBe(1.2)
  })

  it('getAllWilayaRisks returns sorted array', () => {
    const all = getAllWilayaRisks()
    expect(all.length).toBeGreaterThan(0)
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].returnRate).toBeGreaterThanOrEqual(all[i].returnRate)
    }
  })
})
