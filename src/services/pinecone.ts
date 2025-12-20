/**
 * Pinecone Gateway Client
 */

import type { PineconeMatch, PineconeQueryResponse } from '../types';

export class PineconeClient {
  constructor(
    private service: Fetcher,
    private defaultNamespace: string = 'entities'
  ) {}

  /**
   * Semantic search with optional filters
   */
  async query(
    vector: number[],
    options: {
      top_k?: number;
      filter?: Record<string, unknown>;
      include_metadata?: boolean;
      namespace?: string;
    } = {}
  ): Promise<PineconeMatch[]> {
    const { top_k = 10, filter, include_metadata = true, namespace } = options;

    // Use provided namespace, or fall back to default
    const effectiveNamespace = namespace ?? this.defaultNamespace;

    const body: Record<string, unknown> = {
      vector,
      top_k,
      include_metadata,
      namespace: effectiveNamespace,
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
   * Rank candidate vectors by similarity to a text query.
   * Uses the /query-by-ids endpoint which fetches vectors and computes
   * cosine similarity server-side.
   */
  async queryByIdsWithText(
    text: string,
    ids: string[],
    top_k?: number,
    namespace?: string
  ): Promise<PineconeMatch[]> {
    if (ids.length === 0) {
      return [];
    }

    const effectiveNamespace = namespace ?? this.defaultNamespace;

    const response = await this.service.fetch('http://pinecone/query-by-ids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids,
        text,
        top_k: top_k || ids.length,
        include_metadata: true,
        namespace: effectiveNamespace,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinecone query-by-ids failed: ${response.status} ${error}`);
    }

    const result = (await response.json()) as PineconeQueryResponse;
    return result.matches || [];
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

  /**
   * Text-based semantic search (embedding generated server-side)
   */
  async queryByText(
    text: string,
    options: {
      top_k?: number;
      filter?: Record<string, unknown>;
      include_metadata?: boolean;
      namespace?: string;
    } = {}
  ): Promise<PineconeMatch[]> {
    const { top_k = 10, filter, include_metadata = true, namespace } = options;

    // Use provided namespace, or fall back to default
    const effectiveNamespace = namespace ?? this.defaultNamespace;

    const body: Record<string, unknown> = {
      text,
      top_k,
      include_metadata,
      namespace: effectiveNamespace,
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
}
