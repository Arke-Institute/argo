/**
 * Executor - Execute parsed path queries
 */

import type { Services } from '../services';
import type {
  QueryParams,
  QueryResult,
  PathResult,
  QueryMetadata,
  CandidatePath,
} from '../types';
import type { PathAST } from '../parser/types';
import { resolveEntry } from './entry';
import { executeHop } from './traverse';
import { executeVariableDepthHop } from './variable-depth';

const DEFAULT_K = 5;
const DEFAULT_K_EXPLORE_MULTIPLIER = 3;

/**
 * Execute a parsed path query
 */
export async function execute(
  ast: PathAST,
  services: Services,
  params: Partial<QueryParams>
): Promise<QueryResult> {
  const startTime = Date.now();

  const k = params.k ?? DEFAULT_K;
  const k_explore = params.k_explore ?? k * DEFAULT_K_EXPLORE_MULTIPLIER;

  let candidatesExplored = 0;

  // Resolve entry point
  let candidates = await resolveEntry(ast.entry, services, k_explore);
  candidatesExplored += candidates.length;

  if (candidates.length === 0) {
    return buildErrorResult(
      params.path || '',
      ast.hops.length,
      k,
      k_explore,
      startTime,
      candidatesExplored,
      'no_entry_point',
      `No matching entities found for entry point`
    );
  }

  // Execute each hop
  for (let i = 0; i < ast.hops.length; i++) {
    const hop = ast.hops[i];
    const previousCandidates = candidates;

    // Check if this is a variable-depth hop
    if (hop.depth_range) {
      // Variable-depth hop - BFS exploration within depth range
      // Results become starting points for subsequent hops (stacked variable-depth)
      candidates = await executeVariableDepthHop(
        candidates,
        hop,
        services,
        k,
        k_explore
      );
      candidatesExplored += candidates.length;
    } else {
      // Regular single hop
      candidates = await executeHop(candidates, hop, services, k, k_explore);
      candidatesExplored += candidates.length;
    }

    if (candidates.length === 0) {
      // Return partial path info
      return buildPartialResult(
        params.path || '',
        ast.hops.length,
        k,
        k_explore,
        startTime,
        candidatesExplored,
        previousCandidates,
        i + 1
      );
    }
  }

  // Build final results - take top k
  const results = buildResults(candidates, k);

  return {
    results,
    metadata: {
      query: params.path || '',
      hops: ast.hops.length,
      k,
      k_explore,
      total_candidates_explored: candidatesExplored,
      execution_time_ms: Date.now() - startTime,
    },
  };
}

/**
 * Build result objects from candidate paths
 */
function buildResults(
  candidates: CandidatePath[],
  max_results: number
): PathResult[] {
  // Sort by score and take top results
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, max_results);

  return top.map((candidate) => ({
    entity: candidate.current_entity,
    path: candidate.path,
    score: candidate.score,
  }));
}

/**
 * Build error result when entry point fails
 */
function buildErrorResult(
  query: string,
  hops: number,
  k: number,
  k_explore: number,
  startTime: number,
  candidatesExplored: number,
  error: string,
  message: string
): QueryResult {
  return {
    results: [],
    metadata: {
      query,
      hops,
      k,
      k_explore,
      total_candidates_explored: candidatesExplored,
      execution_time_ms: Date.now() - startTime,
      error,
      reason: message,
    },
  };
}

/**
 * Build result when traversal stops early
 */
function buildPartialResult(
  query: string,
  totalHops: number,
  k: number,
  k_explore: number,
  startTime: number,
  candidatesExplored: number,
  lastCandidates: CandidatePath[],
  stoppedAt: number
): QueryResult {
  // Include the partial path from the best candidate
  const bestCandidate = lastCandidates.sort((a, b) => b.score - a.score)[0];

  return {
    results: [],
    metadata: {
      query,
      hops: totalHops,
      k,
      k_explore,
      total_candidates_explored: candidatesExplored,
      execution_time_ms: Date.now() - startTime,
      error: 'no_path_found',
      reason: `Traversal stopped at hop ${stoppedAt} - no matching relations or entities`,
      stopped_at_hop: stoppedAt,
      partial_path: bestCandidate?.path,
    },
  };
}

export { resolveEntry } from './entry';
export { executeHop } from './traverse';
