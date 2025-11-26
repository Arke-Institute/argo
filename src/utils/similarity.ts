/**
 * Similarity utilities
 */

/**
 * Compute cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Score a list of items against a query embedding
 * Returns items sorted by score descending
 */
export function scoreByEmbedding<T>(
  items: T[],
  itemEmbeddings: number[][],
  queryEmbedding: number[]
): Array<T & { score: number }> {
  return items
    .map((item, i) => ({
      ...item,
      score: cosineSimilarity(itemEmbeddings[i], queryEmbedding),
    }))
    .sort((a, b) => b.score - a.score);
}
