/**
 * Entry Point Resolution
 */

import type { Services } from '../services';
import type { CandidatePath } from '../types';
import type { EntryPoint, Filter } from '../parser/types';

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

  // Filter by allowed PIs if specified
  if (allowedPis && !entity.source_pis.some((pi) => allowedPis.includes(pi))) {
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

  // Build Pinecone filter with PI constraint if specified
  const filter = allowedPis
    ? { source_pi: { $in: allowedPis } }
    : undefined;

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

    // Double-check entity belongs to allowed PIs (belt and suspenders)
    if (allowedPis && !entity.source_pis.some((pi) => allowedPis.includes(pi))) {
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
