/**
 * Argo - Path Query Types
 */

// ============================================================================
// Environment
// ============================================================================

export interface Env {
  EMBEDDING_GATEWAY: Fetcher;
  GRAPHDB_GATEWAY: Fetcher;
  PINECONE_GATEWAY: Fetcher;
}

// ============================================================================
// Entity & Relationship Types
// ============================================================================

export interface Entity {
  canonical_id: string;
  code: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
  source_pis: string[];
}

export interface Relationship {
  subject_id: string;
  predicate: string;
  object_id: string;
  properties: Record<string, unknown>;
  source_pi: string;
}

export interface RelationshipSet {
  outgoing: Relationship[];
  incoming: Relationship[];
}

// ============================================================================
// Query Parameters & Results
// ============================================================================

export interface QueryParams {
  path: string;
  k?: number;
  k_explore?: number;
}

export interface QueryResult {
  results: PathResult[];
  metadata: QueryMetadata;
}

export interface PathResult {
  entity: Entity;
  path: PathStep[];
  score: number;
}

export interface PathStep {
  entity?: string;
  label?: string;
  type?: string;
  edge?: string;
  direction?: 'outgoing' | 'incoming';
  score?: number;
}

export interface QueryMetadata {
  query: string;
  hops: number;
  k: number;
  k_explore: number;
  total_candidates_explored: number;
  execution_time_ms: number;
  error?: string;
  partial_path?: PathStep[];
  stopped_at_hop?: number;
  reason?: string;
}

// ============================================================================
// Pinecone Types
// ============================================================================

export interface PineconeMatch {
  id: string;
  score: number;
  metadata?: {
    canonical_id: string;
    label: string;
    type: string;
    source_pi: string;
  };
}

export interface PineconeQueryResponse {
  matches: PineconeMatch[];
}

// ============================================================================
// Execution State
// ============================================================================

export interface CandidatePath {
  current_entity: Entity;
  path: PathStep[];
  score: number;
  visited: Set<string>;
}

export interface ExecutionContext {
  k: number;
  k_explore: number;
  candidates_explored: number;
}
