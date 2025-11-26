/**
 * GraphDB Gateway Client
 */

import type { Entity, Relationship, RelationshipSet } from '../types';

interface GetEntityResponse {
  found: boolean;
  entity?: Entity;
}

/**
 * Raw relationship from GraphDB API
 * Has direction embedded and uses target_id for the connected entity
 */
interface RawRelationship {
  direction: 'outgoing' | 'incoming';
  predicate: string;
  target_id: string;
  target_label: string;
  target_type: string;
  properties: Record<string, unknown>;
  source_pi: string;
}

interface GetRelationshipsResponse {
  found: boolean;
  canonical_id: string;
  relationships: RawRelationship[];
  total_count: number;
}

export class GraphDBClient {
  constructor(private service: Fetcher) {}

  /**
   * Get entity by canonical ID
   */
  async getEntity(canonical_id: string): Promise<Entity | null> {
    const response = await this.service.fetch(
      `http://graphdb/entity/${encodeURIComponent(canonical_id)}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GraphDB getEntity failed: ${response.status} ${error}`);
    }

    const result = (await response.json()) as GetEntityResponse;
    return result.found ? result.entity! : null;
  }

  /**
   * Get all relationships for an entity (incoming and outgoing)
   */
  async getRelationships(canonical_id: string): Promise<RelationshipSet> {
    const response = await this.service.fetch(
      `http://graphdb/relationships/${encodeURIComponent(canonical_id)}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `GraphDB getRelationships failed: ${response.status} ${error}`
      );
    }

    const result = (await response.json()) as GetRelationshipsResponse;

    if (!result.found) {
      return { outgoing: [], incoming: [] };
    }

    // Transform raw relationships into our format, split by direction
    const outgoing: Relationship[] = [];
    const incoming: Relationship[] = [];

    for (const rel of result.relationships) {
      const transformed: Relationship = {
        subject_id: rel.direction === 'outgoing' ? canonical_id : rel.target_id,
        predicate: rel.predicate,
        object_id: rel.direction === 'outgoing' ? rel.target_id : canonical_id,
        properties: rel.properties,
        source_pi: rel.source_pi,
      };

      if (rel.direction === 'outgoing') {
        outgoing.push(transformed);
      } else {
        incoming.push(transformed);
      }
    }

    return { outgoing, incoming };
  }

  /**
   * Get multiple entities by IDs (batch)
   */
  async getEntities(canonical_ids: string[]): Promise<Map<string, Entity>> {
    const results = new Map<string, Entity>();

    // Fetch in parallel
    const promises = canonical_ids.map(async (id) => {
      const entity = await this.getEntity(id);
      if (entity) {
        results.set(id, entity);
      }
    });

    await Promise.all(promises);
    return results;
  }
}
