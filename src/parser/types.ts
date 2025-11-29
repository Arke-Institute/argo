/**
 * Parser Types - Tokens and AST
 */

// ============================================================================
// Tokens
// ============================================================================

export type TokenType =
  | 'QUOTED_STRING' // "George Washington"
  | 'AT_ID' // @george_washington
  | 'TYPE_FILTER' // type:person
  | 'ARROW_OUT_START' // -[
  | 'ARROW_OUT' // -> (outgoing arrow end)
  | 'ARROW_IN_START' // <-[
  | 'RBRACKET' // ] (closes relation bracket)
  | 'DASH' // - (incoming arrow end, after ])
  | 'COMMA' // ,
  | 'WILDCARD' // *
  | 'TILDE' // ~ (semantic modifier)
  | 'LBRACE' // { (depth range start)
  | 'RBRACE' // } (depth range end)
  | 'NUMBER' // 1, 2, 3, etc. (for depth range)
  | 'TERM' // born, affiliated, etc.
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

// ============================================================================
// AST
// ============================================================================

export interface PathAST {
  entry: EntryPoint;
  entry_filter?: Filter; // Optional filter applied directly to entry point (zero-hop query)
  hops: Hop[];
}

export type EntryPoint =
  | { type: 'semantic_search'; text: string }
  | { type: 'exact_id'; id: string };

export interface Hop {
  direction: 'outgoing' | 'incoming';
  relation: RelationMatch;
  filter: Filter | null;
  depth_range?: DepthRange;
}

export interface DepthRange {
  min: number; // minimum depth (default 1)
  max: number; // maximum depth (-1 means unbounded, use default max)
}

export type RelationMatch =
  | { type: 'wildcard' }
  | { type: 'fuzzy'; terms: string[] };

export type Filter =
  | { type: 'type_filter'; value: string }
  | { type: 'exact_id'; id: string }
  | { type: 'semantic_search'; text: string }
  | { type: 'combined_filter'; type_value: string; semantic_text: string };
