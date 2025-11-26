```wrangler.jsonc

/ Service bindings to other workers
  "services": [
    {
      "binding": "AI_REVIEW",
      "service": "ai-reconciliation"
    },
    {
      "binding": "EMBEDDING_GATEWAY",
      "service": "embedding-gateway"
    },
    {
      "binding": "GRAPHDB_GATEWAY",
      "service": "graphdb-gateway"
    },
    {
      "binding": "PINECONE_GATEWAY",
      "service": "pinecone-gateway"
    }
  ],



/**
 * Embedding Gateway helper functions
 */

import { EmbeddingRequest, EmbeddingResponse } from '../types';

export class EmbeddingClient {
  constructor(
    private service: Fetcher,
    private model: string,
    private dimensions: number
  ) {}

  /**
   * Generate embeddings for text array
   */
  async embed(texts: string[]): Promise<number[][]> {
    const request: EmbeddingRequest = {
      texts,
      model: this.model,
      dimensions: this.dimensions,
    };

    const response = await this.service.fetch('http://api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embedding failed: ${response.status} ${error}`);
    }

    const result: EmbeddingResponse = await response.json();
    return result.embeddings;
  }
}


/**
 * GraphDB Gateway helper functions
 */

import {
  GraphDBCreatePIRequest,
  GraphDBListEntitiesRequest,
  GraphDBListEntitiesResponse,
  GraphDBLookupByCodeRequest,
  GraphDBLookupByCodeResponse,
  GraphDBLookupByLabelRequest,
  GraphDBLookupByLabelResponse,
  GraphDBCreateEntityRequest,
  GraphDBMergeEntityRequest,
  GraphDBCreateRelationshipsRequest,
} from '../types';

export class GraphDBClient {
  constructor(private service: Fetcher) {}

  /**
   * Create PI node with parent-child relationships
   */
  async createPi(request: GraphDBCreatePIRequest): Promise<void> {
    const response = await this.service.fetch('http://api/pi/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GraphDB createPi failed: ${response.status} ${error}`);
    }
  }

  /**
   * List entities from specific PIs
   */
  async listEntities(
    request: GraphDBListEntitiesRequest
  ): Promise<GraphDBListEntitiesResponse> {
    const response = await this.service.fetch('http://api/entities/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GraphDB listEntities failed: ${response.status} ${error}`);
    }

    return await response.json();
  }

  /**
   * Lookup entity by code (global search across all entities)
   */
  async lookupByCode(request: GraphDBLookupByCodeRequest): Promise<GraphDBLookupByCodeResponse> {
    const response = await this.service.fetch('http://api/entity/lookup/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GraphDB lookupByCode failed: ${response.status} ${error}`);
    }

    return await response.json();
  }

  /**
   * Lookup entities by label and type (global search)
   * Returns all entities with matching label + type
   */
  async lookupByLabel(request: GraphDBLookupByLabelRequest): Promise<GraphDBLookupByLabelResponse> {
    const response = await this.service.fetch('http://api/entity/lookup/label', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GraphDB lookupByLabel failed: ${response.status} ${error}`);
    }

    return await response.json();
  }

  /**
   * Create new entity
   */
  async createEntity(request: GraphDBCreateEntityRequest): Promise<void> {
    const response = await this.service.fetch('http://api/entity/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GraphDB createEntity failed: ${response.status} ${error}`);
    }
  }

  /**
   * Merge entity (add new source PI and merge properties)
   */
  async mergeEntity(request: GraphDBMergeEntityRequest): Promise<void> {
    const response = await this.service.fetch('http://api/entity/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GraphDB mergeEntity failed: ${response.status} ${error}`);
    }
  }

  /**
   * Create relationships (batch)
   */
  async createRelationships(request: GraphDBCreateRelationshipsRequest): Promise<void> {
    const response = await this.service.fetch('http://api/relationships/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GraphDB createRelationships failed: ${response.status} ${error}`);
    }
  }

  /**
   * Merge relationships (idempotent - safe for retries)
   */
  async mergeRelationships(request: GraphDBCreateRelationshipsRequest): Promise<void> {
    const response = await this.service.fetch('http://api/relationships/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GraphDB mergeRelationships failed: ${response.status} ${error}`);
    }
  }

  /**
   * Get entity by canonical_id
   */
  async getEntity(canonical_id: string): Promise<any> {
    const response = await this.service.fetch(`http://api/entity/${canonical_id}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GraphDB getEntity failed: ${response.status} ${error}`);
    }

    const result = await response.json() as any;

    // Handle "not found" response from GraphDB
    if (!result.found) {
      throw new Error('Entity not found (404)');
    }

    // Return the entity object directly (unwrap from response)
    return result.entity;
  }
}
