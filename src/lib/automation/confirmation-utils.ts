import { selectSequence, shouldAutoConfirm, shouldAutoReject } from './confirmation'

export function getConfirmationRecommendation(riskScore: number) {
  const sequence = selectSequence(riskScore)
  
  if (shouldAutoConfirm(riskScore, sequence)) {
    return {
      action: 'auto_confirm' as const,
      label: 'Auto-Confirmed',
      labelAr: 'تأكيد تلقائي',
      labelFr: 'Auto-confirmé',
      color: 'var(--color-accent-400)',
      sequence,
    }
  }
  
  if (shouldAutoReject(riskScore, sequence)) {
    return {
      action: 'auto_reject' as const,
      label: 'Auto-Rejected',
      labelAr: 'رفض تلقائي',
      labelFr: 'Auto-rejeté',
      color: 'var(--color-danger-400)',
      sequence,
    }
  }
  
  return {
    action: 'manual_review' as const,
    label: `${sequence.name} Sequence`,
    labelAr: `تسلسل ${sequence.name}`,
    labelFr: `Séquence ${sequence.name}`,
    color: 'var(--color-warn-400)',
    sequence,
  }
}
