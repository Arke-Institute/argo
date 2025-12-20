/**
 * Entry Point Resolution
 */

import type { Services } from '../services';
import type { CandidatePath, Entity } from '../types';
import type { EntryPoint, Filter } from '../parser/types';
import { PI_TYPES } from '../types';

// ============================================================================
// Lineage Filter Helpers
// ============================================================================

/**
 * Build Pinecone filter for lineage-scoped queries.
 * Matches entities where:
 * - source_pi is in allowedPis (direct extraction), OR
 * - merged_entities_source_pis contains any of allowedPis (merged entities), OR
 * - canonical_id is in allowedPis AND type is 'pi' or 'PI' (PI entities themselves)
 *
 * @param allowedPis - Array of PI IDs that define the lineage scope
 * @param includeTypes - Optional type filter to combine with lineage filter
 * @returns Pinecone filter object
 */
export function buildLineageFilter(
  allowedPis: string[],
  includeTypes?: string[]
): Record<string, unknown> {
  const lineageConditions: Record<string, unknown>[] = [
    // Entities directly extracted from these PIs
    { source_pi: { $in: allowedPis } },
    // Entities that merged from these PIs (cross-collection discovery)
    { merged_entities_source_pis: { $in: allowedPis } },
    // PI entities that ARE these PIs (canonical_id matches and type is PI)
    {
      $and: [
        { canonical_id: { $in: allowedPis } },
        { type: { $in: PI_TYPES } },
      ],
    },
    // Entities that absorbed something from the lineage (safety net for merges)
    { merged_entities: { $in: allowedPis } },
  ];

  // If type filter is also specified, wrap in $and
  if (includeTypes && includeTypes.length > 0) {
    const typeFilter =
      includeTypes.length === 1
        ? { type: { $eq: includeTypes[0] } }
        : { type: { $in: includeTypes } };

    return {
      $and: [{ $or: lineageConditions }, typeFilter],
    };
  }

  return { $or: lineageConditions };
}

/**
 * Check if an entity belongs to the allowed PI lineage.
 * Returns true if:
 * - Entity's source_pis contains any of allowedPis (direct or merged), OR
 * - Entity IS a PI and its canonical_id is in allowedPis
 *
 * This is used as a "belt and suspenders" check after Pinecone returns results,
 * since GraphDB's source_pis array includes all PIs (direct + transferred via merge).
 *
 * @param entity - The entity to check
 * @param allowedPis - Array of PI IDs that define the lineage scope
 * @returns true if entity belongs to the lineage
 */
export function entityBelongsToLineage(
  entity: Entity,
  allowedPis: string[]
): boolean {
  // Check if entity's source PIs overlap with allowed PIs
  // GraphDB's source_pis includes both direct and merged sources
  if (entity.source_pis.some((pi) => allowedPis.includes(pi))) {
    return true;
  }

  // Check if entity IS a PI that's in the lineage
  if (
    PI_TYPES.includes(entity.type as (typeof PI_TYPES)[number]) &&
    allowedPis.includes(entity.canonical_id)
  ) {
    return true;
  }

  return false;
}

// ============================================================================
// Entry Point Resolution
// ============================================================================

/**
 * Resolve the entry point of a path query
 * Returns initial candidate paths to start traversal from
 */
export async function resolveEntry(
  entry: EntryPoint,
  services: Services,
  k_explore: number,
  allowedPis?: string[]
): Promise<CandidatePath[]> {
  if (entry.type === 'exact_id') {
    return resolveExactId(entry.id, services, allowedPis);
  }

  if (entry.type === 'type_filter') {
    return resolveTypeFilter(entry.type_values, services, k_explore, allowedPis);
  }

  if (entry.type === 'type_filter_semantic') {
    return resolveTypeFilterSemantic(
      entry.type_values,
      entry.text,
      services,
      k_explore,
      allowedPis
    );
  }

  return resolveSemanticSearch(entry.text, services, k_explore, allowedPis);
}

/**
 * Resolve an exact entity ID
 */
async function resolveExactId(
  id: string,
  services: Services,
  allowedPis?: string[]
): Promise<CandidatePath[]> {
  const entity = await services.graphdb.getEntity(id);

  if (!entity) {
    return [];
  }

  // Filter by allowed PIs if specified (includes PI entities and merged sources)
  if (allowedPis && !entityBelongsToLineage(entity, allowedPis)) {
    return [];
  }

  return [
    {
      current_entity: entity,
      path: [
        {
          entity: entity.canonical_id,
          label: entity.label,
          type: entity.type,
        },
      ],
      score: 1.0,
      visited: new Set([entity.canonical_id]),
    },
  ];
}

/**
 * Resolve via semantic search
 */
async function resolveSemanticSearch(
  text: string,
  services: Services,
  k_explore: number,
  allowedPis?: string[]
): Promise<CandidatePath[]> {
  // Embed the search text
  const embedding = await services.embedding.embedOne(text);

  // Build comprehensive lineage filter if PI constraint specified
  // This matches: direct source_pi, merged_entities_source_pis, or PI entities themselves
  const filter = allowedPis ? buildLineageFilter(allowedPis) : undefined;

  // Query Pinecone for top k_explore matches
  const matches = await services.pinecone.query(embedding, {
    top_k: k_explore,
    filter,
  });

  if (matches.length === 0) {
    return [];
  }

  // Fetch all entities in parallel
  const matchIds = matches.map((m) => m.id);
  const entities = await services.graphdb.getEntities(matchIds);

  // Build candidates from fetched entities
  const candidates: CandidatePath[] = [];

  for (const match of matches) {
    const entity = entities.get(match.id);
    if (!entity) continue;

    // Belt-and-suspenders: verify entity belongs to lineage via GraphDB's source_pis
    // (which includes transferred sources from merges)
    if (allowedPis && !entityBelongsToLineage(entity, allowedPis)) {
      continue;
    }

    candidates.push({
      current_entity: entity,
      path: [
        {
          entity: entity.canonical_id,
          label: entity.label,
          type: entity.type,
          score: match.score,
        },
      ],
      score: match.score,
      visited: new Set([entity.canonical_id]),
    });
  }

  return candidates;
}

/**
 * Resolve by type filter only (no semantic text)
 * This is less efficient - we need a random vector for Pinecone query
 */
async function resolveTypeFilter(
  typeValues: string[],
  services: Services,
  k_explore: number,
  allowedPis?: string[]
): Promise<CandidatePath[]> {
  // Build filter combining type and lineage constraints
  let filter: Record<string, unknown>;

  if (allowedPis) {
    // Use comprehensive lineage filter with type constraint
    filter = buildLineageFilter(allowedPis, typeValues);
  } else {
    // Type filter only (no lineage constraint)
    filter =
      typeValues.length === 1
        ? { type: { $eq: typeValues[0] } }
        : { type: { $in: typeValues } };
  }

  // We need a vector for Pinecone query - use a zero vector
  // This will return random-ish results within the type filter
  // All scores will be similar since we're not doing semantic ranking
  const zeroVector = new Array(768).fill(0);

  const matches = await services.pinecone.query(zeroVector, {
    top_k: k_explore,
    filter,
  });

  if (matches.length === 0) {
    return [];
  }

  // Fetch all entities in parallel
  const matchIds = matches.map((m) => m.id);
  const entities = await services.graphdb.getEntities(matchIds);

  // Build candidates - use uniform score since no semantic ranking
  const candidates: CandidatePath[] = [];

  for (const match of matches) {
    const entity = entities.get(match.id);
    if (!entity) continue;

    // Verify type matches (belt and suspenders)
    if (!typeValues.includes(entity.type)) continue;

    // Belt-and-suspenders: verify entity belongs to lineage
    if (allowedPis && !entityBelongsToLineage(entity, allowedPis)) {
      continue;
    }

    candidates.push({
      current_entity: entity,
      path: [
        {
          entity: entity.canonical_id,
          label: entity.label,
          type: entity.type,
        },
      ],
      score: 1.0, // Uniform score - no semantic ranking
      visited: new Set([entity.canonical_id]),
    });
  }

  return candidates;
}

/**
 * Resolve by type filter with semantic search within that type
 */
async function resolveTypeFilterSemantic(
  typeValues: string[],
  text: string,
  services: Services,
  k_explore: number,
  allowedPis?: string[]
): Promise<CandidatePath[]> {
  // Embed the search text
  const embedding = await services.embedding.embedOne(text);

  // Build filter combining type and lineage constraints
  let filter: Record<string, unknown>;

  if (allowedPis) {
    // Use comprehensive lineage filter with type constraint
    filter = buildLineageFilter(allowedPis, typeValues);
  } else {
    // Type filter only (no lineage constraint)
    filter =
      typeValues.length === 1
        ? { type: { $eq: typeValues[0] } }
        : { type: { $in: typeValues } };
  }

  // Query Pinecone with type filter and semantic embedding
  const matches = await services.pinecone.query(embedding, {
    top_k: k_explore,
    filter,
  });

  if (matches.length === 0) {
    return [];
  }

  // Fetch all entities in parallel
  const matchIds = matches.map((m) => m.id);
  const entities = await services.graphdb.getEntities(matchIds);

  // Build candidates with semantic scores
  const candidates: CandidatePath[] = [];

  for (const match of matches) {
    const entity = entities.get(match.id);
    if (!entity) continue;

    // Verify type matches (belt and suspenders)
    if (!typeValues.includes(entity.type)) continue;

    // Belt-and-suspenders: verify entity belongs to lineage
    if (allowedPis && !entityBelongsToLineage(entity, allowedPis)) {
      continue;
    }

    candidates.push({
      current_entity: entity,
      path: [
        {
          entity: entity.canonical_id,
          label: entity.label,
          type: entity.type,
          score: match.score,
        },
      ],
      score: match.score,
      visited: new Set([entity.canonical_id]),
    });
  }

  return candidates;
}

/**
 * Apply entry filter to candidates (for zero-hop queries)
 * Filters and/or re-ranks candidates based on the filter type
 */
export async function applyEntryFilter(
  candidates: CandidatePath[],
  filter: Filter,
  services: Services,
  _allowedPis?: string[]
): Promise<CandidatePath[]> {
  // Note: allowedPis filtering already applied during entry resolution
  // Kept in signature for consistency with other functions
  switch (filter.type) {
    case 'type_filter':
      // Filter by entity type (supports multiple types)
      return candidates.filter((c) =>
        filter.values.includes(c.current_entity.type)
      );

    case 'exact_id':
      // Filter to just the specified entity
      return candidates.filter(
        (c) => c.current_entity.canonical_id === filter.id
      );

    case 'semantic_search':
      // Re-rank by semantic similarity to filter text
      return reRankBySemantic(candidates, filter.text, services);

    case 'combined_filter':
      // Filter by type first, then re-rank semantically
      const typeFiltered = candidates.filter((c) =>
        filter.type_values.includes(c.current_entity.type)
      );
      return reRankBySemantic(typeFiltered, filter.semantic_text, services);

    default:
      return candidates;
  }
}

/**
 * Re-rank candidates by semantic similarity to text
 * Uses Pinecone's query-by-ids endpoint to compute similarity server-side
 */
async function reRankBySemantic(
  candidates: CandidatePath[],
  text: string,
  services: Services
): Promise<CandidatePath[]> {
  if (candidates.length === 0) return candidates;

  // Get IDs and query Pinecone for similarity scores
  const ids = candidates.map((c) => c.current_entity.canonical_id);
  const matches = await services.pinecone.queryByIdsWithText(text, ids);

  // Create a map of id -> similarity score
  const scoreMap = new Map(matches.map((m) => [m.id, m.score]));

  // Update candidates with semantic scores
  const scored = candidates.map((candidate) => {
    const similarity = scoreMap.get(candidate.current_entity.canonical_id) ?? 0;
    // Combine original score with semantic similarity (favor semantic)
    const combinedScore = candidate.score * 0.3 + similarity * 0.7;
    return {
      ...candidate,
      score: combinedScore,
      path: candidate.path.map((p, i) =>
        i === candidate.path.length - 1
          ? { ...p, semantic_score: similarity }
          : p
      ),
    };
  });

  // Sort by combined score
  return scored.sort((a, b) => b.score - a.score);
}
