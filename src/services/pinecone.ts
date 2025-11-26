/**
 * Pinecone Gateway Client
 */

import type { PineconeMatch, PineconeQueryResponse } from '../types';

export class PineconeClient {
  constructor(private service: Fetcher) {}

  /**
   * Semantic search with optional filters
   */
  async query(
    vector: number[],
    options: {
      top_k?: number;
      filter?: Record<string, unknown>;
      include_metadata?: boolean;
    } = {}
  ): Promise<PineconeMatch[]> {
    const { top_k = 10, filter, include_metadata = true } = options;

    const body: Record<string, unknown> = {
      vector,
      top_k,
      include_metadata,
    };

    if (filter) {
      body.filter = filter;
    }

    const response = await this.service.fetch('http://pinecone/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinecone query failed: ${response.status} ${error}`);
    }

    const result = (await response.json()) as PineconeQueryResponse;
    return result.matches || [];
  }

  /**
   * Search filtered to specific entity IDs
   */
  async queryByIds(
    vector: number[],
    ids: string[],
    top_k?: number
  ): Promise<PineconeMatch[]> {
    return this.query(vector, {
      top_k: top_k || ids.length,
      filter: {
        canonical_id: { $in: ids },
      },
    });
  }

  /**
   * Search filtered by entity type
   */
  async queryByType(
    vector: number[],
    type: string,
    top_k?: number
  ): Promise<PineconeMatch[]> {
    return this.query(vector, {
      top_k,
      filter: {
        type: { $eq: type },
      },
    });
  }
}
