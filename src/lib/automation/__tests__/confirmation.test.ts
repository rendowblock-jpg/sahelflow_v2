import { describe, it, expect } from 'vitest'
import {
  selectSequence,
  shouldAutoConfirm,
  shouldAutoReject,
  interpolateTemplate,
  parseCustomerResponse,
  DEFAULT_SEQUENCES,
  CONFIRMATION_TEMPLATES,
} from '../confirmation'

// ===== selectSequence() =====
describe('Confirmation — selectSequence()', () => {
  it('selects aggressive sequence for high risk (>= 50)', () => {
    const seq = selectSequence(75)
    expect(seq.id).toBe('aggressive')
  })

  it('selects relaxed sequence for low risk (<= 20)', () => {
    const seq = selectSequence(10)
    expect(seq.id).toBe('relaxed')
  })

  it('selects standard sequence for medium risk (21-49)', () => {
    const seq = selectSequence(35)
    expect(seq.id).toBe('standard')
  })

  it('selects aggressive at boundary (50)', () => {
    const seq = selectSequence(50)
    expect(seq.id).toBe('aggressive')
  })

  it('selects relaxed at boundary (20)', () => {
    const seq = selectSequence(20)
    expect(seq.id).toBe('relaxed')
  })
})

// ===== shouldAutoConfirm() =====
describe('Confirmation — shouldAutoConfirm()', () => {
  it('auto-confirms when risk is below sequence threshold', () => {
    const standard = DEFAULT_SEQUENCES[0] // autoConfirmBelow: 15
    expect(shouldAutoConfirm(10, standard)).toBe(true)
    expect(shouldAutoConfirm(14, standard)).toBe(true)
  })

  it('does not auto-confirm when risk equals threshold', () => {
    const standard = DEFAULT_SEQUENCES[0] // autoConfirmBelow: 15
    expect(shouldAutoConfirm(15, standard)).toBe(false)
  })

  it('does not auto-confirm when risk exceeds threshold', () => {
    const standard = DEFAULT_SEQUENCES[0]
    expect(shouldAutoConfirm(50, standard)).toBe(false)
  })

  it('aggressive sequence has lower auto-confirm threshold', () => {
    const aggressive = DEFAULT_SEQUENCES[1] // autoConfirmBelow: 10
    expect(shouldAutoConfirm(9, aggressive)).toBe(true)
    expect(shouldAutoConfirm(10, aggressive)).toBe(false)
  })

  it('relaxed sequence has higher auto-confirm threshold', () => {
    const relaxed = DEFAULT_SEQUENCES[2] // autoConfirmBelow: 25
    expect(shouldAutoConfirm(24, relaxed)).toBe(true)
    expect(shouldAutoConfirm(25, relaxed)).toBe(false)
  })
})

// ===== shouldAutoReject() =====
describe('Confirmation — shouldAutoReject()', () => {
  it('auto-rejects when risk exceeds threshold', () => {
    const standard = DEFAULT_SEQUENCES[0] // autoRejectAbove: 85
    expect(shouldAutoReject(90, standard)).toBe(true)
  })

  it('does not auto-reject at threshold', () => {
    const standard = DEFAULT_SEQUENCES[0]
    expect(shouldAutoReject(85, standard)).toBe(false)
  })

  it('does not auto-reject below threshold', () => {
    const standard = DEFAULT_SEQUENCES[0]
    expect(shouldAutoReject(50, standard)).toBe(false)
  })
})

// ===== interpolateTemplate() =====
describe('Confirmation — interpolateTemplate()', () => {
  it('replaces all template variables', () => {
    const result = interpolateTemplate(
      'Salam {{customer_name}}, commande {{order_number}} dyal {{total_price}} DA',
      { customer_name: 'Ahmed', order_number: 'SF-00042', total_price: '3500' },
    )
    expect(result).toBe('Salam Ahmed, commande SF-00042 dyal 3500 DA')
  })

  it('replaces multiple occurrences of the same variable', () => {
    const result = interpolateTemplate(
      '{{name}} — {{name}}',
      { name: 'Test' },
    )
    expect(result).toBe('Test — Test')
  })

  it('leaves unmatched placeholders unchanged', () => {
    const result = interpolateTemplate(
      '{{known}} — {{unknown}}',
      { known: 'Value' },
    )
    expect(result).toBe('Value — {{unknown}}')
  })

  it('handles empty vars object', () => {
    const result = interpolateTemplate('Hello {{name}}', {})
    expect(result).toBe('Hello {{name}}')
  })
})

// ===== parseCustomerResponse() =====
describe('Confirmation — parseCustomerResponse()', () => {
  // Confirm words
  it('recognizes "oui" as confirm', () => {
    expect(parseCustomerResponse('oui')).toBe('confirm')
  })

  it('recognizes Arabic "نعم" as confirm', () => {
    expect(parseCustomerResponse('نعم')).toBe('confirm')
  })

  it('recognizes "ok" as confirm', () => {
    expect(parseCustomerResponse('ok')).toBe('confirm')
  })

  it('recognizes Darija "wah" as confirm', () => {
    expect(parseCustomerResponse('wah')).toBe('confirm')
  })

  it('recognizes "ça marche" as confirm', () => {
    expect(parseCustomerResponse('ça marche')).toBe('confirm')
  })

  it('recognizes confirm in a longer message', () => {
    expect(parseCustomerResponse('oui merci je confirme la commande')).toBe('confirm')
  })

  // Reject words
  it('recognizes "non" as reject', () => {
    expect(parseCustomerResponse('non')).toBe('reject')
  })

  it('recognizes Arabic "لا" as reject', () => {
    expect(parseCustomerResponse('لا')).toBe('reject')
  })

  it('recognizes "annuler" as reject', () => {
    expect(parseCustomerResponse('annuler')).toBe('reject')
  })

  it('recognizes Darija "batal" as reject', () => {
    expect(parseCustomerResponse('batal')).toBe('reject')
  })

  // Unclear
  it('returns "unclear" for random text', () => {
    expect(parseCustomerResponse('what is this about?')).toBe('unclear')
  })

  it('returns "unclear" for empty string', () => {
    expect(parseCustomerResponse('')).toBe('unclear')
  })

  // Case insensitivity
  it('is case insensitive', () => {
    expect(parseCustomerResponse('OUI')).toBe('confirm')
    expect(parseCustomerResponse('NON')).toBe('reject')
  })

  it('trims whitespace', () => {
    expect(parseCustomerResponse('  oui  ')).toBe('confirm')
  })
})

// ===== Data integrity =====
describe('Confirmation — Data Integrity', () => {
  it('has 3 default sequences', () => {
    expect(DEFAULT_SEQUENCES).toHaveLength(3)
  })

  it('each sequence has at least 1 step', () => {
    for (const seq of DEFAULT_SEQUENCES) {
      expect(seq.steps.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('each sequence has the last step marked isLast', () => {
    for (const seq of DEFAULT_SEQUENCES) {
      const lastStep = seq.steps[seq.steps.length - 1]
      expect(lastStep.isLast).toBe(true)
    }
  })

  it('all template IDs in sequences reference valid templates', () => {
    for (const seq of DEFAULT_SEQUENCES) {
      for (const step of seq.steps) {
        expect(CONFIRMATION_TEMPLATES[step.templateId]).toBeDefined()
      }
    }
  })

  it('each template has both Arabic and French messages', () => {
    for (const [, template] of Object.entries(CONFIRMATION_TEMPLATES)) {
      expect(template.messageAr).toBeTruthy()
      expect(template.messageFr).toBeTruthy()
    }
  })

  it('autoConfirmBelow < autoRejectAbove for all sequences', () => {
    for (const seq of DEFAULT_SEQUENCES) {
      expect(seq.autoConfirmBelow).toBeLessThan(seq.autoRejectAbove)
    }
  })
})
