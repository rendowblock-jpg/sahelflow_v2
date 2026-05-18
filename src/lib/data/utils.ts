export function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).slice(-5).toUpperCase();
  const random = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map(b => b.toString(36).charAt(0))
    .join('')
    .toUpperCase();
  return `SF-${timestamp}-${random}`;
}
