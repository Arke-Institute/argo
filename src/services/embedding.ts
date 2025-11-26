/**
 * Embedding Gateway Client
 */

const MODEL = 'text-embedding-3-small';
const DIMENSIONS = 768;

export class EmbeddingClient {
  constructor(private service: Fetcher) {}

  /**
   * Generate embeddings for an array of texts
   */
  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.service.fetch('http://embedding/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texts,
        model: MODEL,
        dimensions: DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding failed: ${response.status} ${error}`);
    }

    const result = (await response.json()) as { embeddings: number[][] };
    return result.embeddings;
  }

  /**
   * Generate embedding for a single text
   */
  async embedOne(text: string): Promise<number[]> {
    const embeddings = await this.embed([text]);
    return embeddings[0];
  }
}
