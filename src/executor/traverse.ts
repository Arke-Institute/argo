/**
 * Graph Traversal - Execute a single hop
 */

import type { Services } from '../services';
import type {
  Entity,
  CandidatePath,
  PathStep,
  Relationship,
} from '../types';
import type { Hop, RelationMatch, Filter } from '../parser/types';
import { cosineSimilarity } from '../utils/similarity';

interface ScoredRelation {
  relation: Relationship;
  target_id: string;
  score: number;
  actual_direction: 'outgoing' | 'incoming';
}

/**
 * Execute a single hop for all candidate paths
 */
export async function executeHop(
  candidates: CandidatePath[],
  hop: Hop,
  services: Services,
  k: number,
  k_explore: number,
  allowedPis?: string[]
): Promise<CandidatePath[]> {
  // Process all candidates in parallel
  const hopResultsArrays = await Promise.all(
    candidates.map((candidate) =>
      executeHopForCandidate(candidate, hop, services, k_explore, allowedPis)
    )
  );

  // Flatten results
  const newCandidates = hopResultsArrays.flat();

  // Sort by score and limit beam width
  newCandidates.sort((a, b) => b.score - a.score);
  return newCandidates.slice(0, k_explore * candidates.length);
}

/**
 * Execute a hop for a single candidate path
 */
async function executeHopForCandidate(
  candidate: CandidatePath,
  hop: Hop,
  services: Services,
  k_explore: number,
  allowedPis?: string[]
): Promise<CandidatePath[]> {
  // Get relationships for current entity
  const relationships = await services.graphdb.getRelationships(
    candidate.current_entity.canonical_id
  );

  // Filter relationships by allowed PIs if specified
  const filteredRelationships = allowedPis
    ? {
        outgoing: relationships.outgoing.filter((r) =>
          allowedPis.includes(r.source_pi)
        ),
        incoming: relationships.incoming.filter((r) =>
          allowedPis.includes(r.source_pi)
        ),
      }
    : relationships;

  // Collect scored relations from relevant direction(s)
  let scoredRelations: ScoredRelation[] = [];

  if (hop.direction === 'outgoing' || hop.direction === 'bidirectional') {
    if (filteredRelationships.outgoing.length > 0) {
      const outScored = await scoreRelations(
        filteredRelationships.outgoing,
        hop.relation,
        'outgoing',
        services,
        k_explore
      );
      scoredRelations.push(...outScored);
    }
  }

  if (hop.direction === 'incoming' || hop.direction === 'bidirectional') {
    if (filteredRelationships.incoming.length > 0) {
      const inScored = await scoreRelations(
        filteredRelationships.incoming,
        hop.relation,
        'incoming',
        services,
        k_explore
      );
      scoredRelations.push(...inScored);
    }
  }

  if (scoredRelations.length === 0) {
    return [];
  }

  // For bidirectional, re-sort merged results and limit to k_explore
  if (hop.direction === 'bidirectional') {
    scoredRelations.sort((a, b) => b.score - a.score);
    scoredRelations = scoredRelations.slice(0, k_explore);
  }

  if (scoredRelations.length === 0) {
    return [];
  }

  // Get target entities
  const targetIds = scoredRelations.map((r) => r.target_id);
  const uniqueTargetIds = [...new Set(targetIds)].filter(
    (id) => !candidate.visited.has(id)
  );

  if (uniqueTargetIds.length === 0) {
    return [];
  }

  const targetEntities = await services.graphdb.getEntities(uniqueTargetIds);

  // Filter entities by allowed PIs if specified
  const piFilteredEntities = allowedPis
    ? new Map(
        [...targetEntities].filter(([_, entity]) =>
          entity.source_pis.some((pi) => allowedPis.includes(pi))
        )
      )
    : targetEntities;

  // Apply hop filter
  const filteredEntities = await applyFilter(
    Array.from(piFilteredEntities.values()),
    hop.filter,
    services,
    k_explore
  );

  // Build new candidate paths
  const newCandidates: CandidatePath[] = [];

  for (const scored of scoredRelations) {
    const entity = filteredEntities.find(
      (e) => e.entity.canonical_id === scored.target_id
    );
    if (!entity) continue;

    const newVisited = new Set(candidate.visited);
    newVisited.add(entity.entity.canonical_id);

    const edgeStep: PathStep = {
      edge: scored.relation.predicate,
      direction: scored.actual_direction,
      score: scored.score,
    };

    const entityStep: PathStep = {
      entity: entity.entity.canonical_id,
      label: entity.entity.label,
      type: entity.entity.type,
      score: entity.filterScore,
    };

    newCandidates.push({
      current_entity: entity.entity,
      path: [...candidate.path, edgeStep, entityStep],
      score: candidate.score * scored.score * (entity.filterScore || 1),
      visited: newVisited,
    });
  }

  return newCandidates;
}

/**
 * Score relations against fuzzy terms
 */
async function scoreRelations(
  relations: Relationship[],
  relationMatch: RelationMatch,
  direction: 'outgoing' | 'incoming',
  services: Services,
  k_explore: number
): Promise<ScoredRelation[]> {
  // Determine target IDs based on direction
  const withTargets = relations.map((rel) => ({
    relation: rel,
    target_id: direction === 'outgoing' ? rel.object_id : rel.subject_id,
    actual_direction: direction,
  }));

  // If wildcard, return all with score 1.0
  if (relationMatch.type === 'wildcard') {
    return withTargets.map((r) => ({ ...r, score: 1.0 }));
  }

  // Get unique predicates
  const predicates = [...new Set(relations.map((r) => r.predicate))];

  if (predicates.length === 0) {
    return [];
  }

  // Embed predicates and terms
  const textsToEmbed = [...predicates, ...relationMatch.terms];
  const embeddings = await services.embedding.embed(textsToEmbed);

  const predicateEmbeddings = new Map<string, number[]>();
  for (let i = 0; i < predicates.length; i++) {
    predicateEmbeddings.set(predicates[i], embeddings[i]);
  }

  const termEmbeddings = embeddings.slice(predicates.length);

  // Score each relation (no threshold - take all, then limit by k_explore)
  const scored: ScoredRelation[] = [];

  for (const { relation, target_id, actual_direction } of withTargets) {
    const predEmb = predicateEmbeddings.get(relation.predicate);
    if (!predEmb) continue;

    // Max similarity across all terms
    let maxScore = 0;
    for (const termEmb of termEmbeddings) {
      const sim = cosineSimilarity(predEmb, termEmb);
      maxScore = Math.max(maxScore, sim);
    }

    scored.push({ relation, target_id, score: maxScore, actual_direction });
  }

  // Sort by score descending and take top k_explore
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k_explore);
}

/**
 * Apply a filter to entities
 */
async function applyFilter(
  entities: Entity[],
  filter: Filter | null,
  services: Services,
  k_explore: number
): Promise<Array<{ entity: Entity; filterScore?: number }>> {
  if (!filter) {
    return entities.map((e) => ({ entity: e }));
  }

  if (filter.type === 'type_filter') {
    return entities
      .filter((e) => filter.values.includes(e.type))
      .map((e) => ({ entity: e }));
  }

  if (filter.type === 'exact_id') {
    const match = entities.find((e) => e.canonical_id === filter.id);
    return match ? [{ entity: match }] : [];
  }

  if (filter.type === 'semantic_search') {
    // Query Pinecone filtered to only these entity IDs, using text directly
    // Returns top k_explore matches sorted by score
    const ids = entities.map((e) => e.canonical_id);
    const matches = await services.pinecone.queryByIdsWithText(
      filter.text,
      ids,
      k_explore
    );

    // Build result with scores (already limited by k_explore from Pinecone)
    const result: Array<{ entity: Entity; filterScore: number }> = [];
    for (const match of matches) {
      const entity = entities.find((e) => e.canonical_id === match.id);
      if (entity) {
        result.push({ entity, filterScore: match.score });
      }
    }

    return result;
  }

  if (filter.type === 'combined_filter') {
    // Step 1: Apply type filter (supports multiple types)
    const typeFiltered = entities.filter((e) =>
      filter.type_values.includes(e.type)
    );

    if (typeFiltered.length === 0) {
      return [];
    }

    // Step 2: Semantic ranking within type-filtered candidates
    // Returns top k_explore matches sorted by score
    const ids = typeFiltered.map((e) => e.canonical_id);
    const matches = await services.pinecone.queryByIdsWithText(
      filter.semantic_text,
      ids,
      k_explore
    );

    // Build result with scores (already limited by k_explore from Pinecone)
    const result: Array<{ entity: Entity; filterScore: number }> = [];
    for (const match of matches) {
      const entity = typeFiltered.find((e) => e.canonical_id === match.id);
      if (entity) {
        result.push({ entity, filterScore: match.score });
      }
    }

    return result;
  }

  return entities.map((e) => ({ entity: e }));
}
