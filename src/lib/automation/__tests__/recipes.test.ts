import { describe, it, expect } from 'vitest'
import { RECIPES, getRecipesByCategory } from '../recipes'

describe('Recipes — Data Integrity', () => {
  it('has 7 default recipes', () => {
    expect(RECIPES).toHaveLength(7)
  })

  it('each recipe has all required fields', () => {
    for (const recipe of RECIPES) {
      expect(recipe.id).toBeTruthy()
      expect(recipe.name_key).toBeTruthy()
      expect(recipe.description_key).toBeTruthy()
      expect(recipe.icon).toBeTruthy()
      expect(recipe.category).toBeTruthy()
      expect(recipe.trigger.type).toBeTruthy()
      expect(recipe.action.type).toBeTruthy()
      expect(typeof recipe.default_active).toBe('boolean')
    }
  })

  it('has unique recipe IDs', () => {
    const ids = RECIPES.map(r => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all categories are valid', () => {
    const validCategories = ['orders', 'customers', 'messages', 'stock']
    for (const recipe of RECIPES) {
      expect(validCategories).toContain(recipe.category)
    }
  })

  it('has at least one recipe per category used', () => {
    const categories = [...new Set(RECIPES.map(r => r.category))]
    expect(categories.length).toBeGreaterThanOrEqual(3)
  })
})

describe('Recipes — getRecipesByCategory()', () => {
  it('returns all recipes for "all" category', () => {
    const result = getRecipesByCategory('all')
    expect(result).toHaveLength(RECIPES.length)
  })

  it('filters by "orders" category', () => {
    const result = getRecipesByCategory('orders')
    expect(result.length).toBeGreaterThan(0)
    for (const recipe of result) {
      expect(recipe.category).toBe('orders')
    }
  })

  it('filters by "customers" category', () => {
    const result = getRecipesByCategory('customers')
    expect(result.length).toBeGreaterThan(0)
    for (const recipe of result) {
      expect(recipe.category).toBe('customers')
    }
  })

  it('filters by "messages" category', () => {
    const result = getRecipesByCategory('messages')
    expect(result.length).toBeGreaterThan(0)
    for (const recipe of result) {
      expect(recipe.category).toBe('messages')
    }
  })

  it('returns empty array for unknown category', () => {
    const result = getRecipesByCategory('nonexistent')
    expect(result).toHaveLength(0)
  })
})

describe('Recipes — Trigger Types', () => {
  it('auto_confirm_safe uses order.created trigger with max_risk', () => {
    const recipe = RECIPES.find(r => r.id === 'auto_confirm_safe')
    expect(recipe?.trigger.type).toBe('order.created')
    expect(recipe?.trigger.config.max_risk).toBe(20)
  })

  it('high_risk_alert uses risk.threshold trigger', () => {
    const recipe = RECIPES.find(r => r.id === 'high_risk_alert')
    expect(recipe?.trigger.type).toBe('risk.threshold')
    expect(recipe?.trigger.config.threshold).toBe(70)
  })

  it('low_stock_warning uses stock.low trigger', () => {
    const recipe = RECIPES.find(r => r.id === 'low_stock_warning')
    expect(recipe?.trigger.type).toBe('stock.low')
    expect(recipe?.trigger.config.threshold).toBe(5)
  })

  it('auto_block_returners uses return.threshold trigger', () => {
    const recipe = RECIPES.find(r => r.id === 'auto_block_returners')
    expect(recipe?.trigger.type).toBe('return.threshold')
    expect(recipe?.trigger.config.max_returns).toBe(3)
  })
})
