/**
 * Entry Point Resolution
 */

import type { Services } from '../services';
import type { CandidatePath } from '../types';
import type { EntryPoint } from '../parser/types';

/**
 * Resolve the entry point of a path query
 * Returns initial candidate paths to start traversal from
 */
export async function resolveEntry(
  entry: EntryPoint,
  services: Services,
  k_explore: number
): Promise<CandidatePath[]> {
  if (entry.type === 'exact_id') {
    return resolveExactId(entry.id, services);
  }

  return resolveSemanticSearch(entry.text, services, k_explore);
}

/**
 * Resolve an exact entity ID
 */
async function resolveExactId(
  id: string,
  services: Services
): Promise<CandidatePath[]> {
  const entity = await services.graphdb.getEntity(id);

  if (!entity) {
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
  k_explore: number
): Promise<CandidatePath[]> {
  // Embed the search text
  const embedding = await services.embedding.embedOne(text);

  // Query Pinecone for top k_explore matches
  const matches = await services.pinecone.query(embedding, { top_k: k_explore });

  // Fetch full entities for all matches
  const candidates: CandidatePath[] = [];

  for (const match of matches) {
    const entity = await services.graphdb.getEntity(match.id);
    if (!entity) continue;

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
