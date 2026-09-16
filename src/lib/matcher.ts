function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[a.length][b.length]
}

function nameSimilarity(a: string, b: string): number {
  const an = a.toLowerCase().trim()
  const bn = b.toLowerCase().trim()
  if (an === bn) return 100
  const dist = levenshtein(an, bn)
  const maxLen = Math.max(an.length, bn.length)
  return Math.max(0, Math.round((1 - dist / maxLen) * 100))
}

/**
 * DOB is the primary matching key (per the client proposal, §2 step 2):
 * a DOB mismatch always means 0 confidence, regardless of name similarity.
 */
export function matchConfidence(a: { name: string; dob: string }, b: { name: string; dob: string }): number {
  if (a.dob !== b.dob) return 0
  return nameSimilarity(a.name, b.name)
}

export function classifyMatch(confidence: number): 'auto' | 'needs-review' | 'no-match' {
  if (confidence >= 95) return 'auto'
  if (confidence >= 40) return 'needs-review'
  return 'no-match'
}
