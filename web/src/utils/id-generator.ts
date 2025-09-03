/**
 * Generate a random hex ID with specified length
 * @param length - The length of the ID (default: 8)
 * @returns A random hex string
 */
export function generateRandomId(length: number = 8): string {
  return Math.random().toString(16).substring(2, 2 + length)
}