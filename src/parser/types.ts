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
  | 'ARROW_OUT_END' // ]->
  | 'ARROW_IN_START' // <-[
  | 'ARROW_IN_END' // ]-
  | 'COMMA' // ,
  | 'WILDCARD' // *
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
  hops: Hop[];
}

export type EntryPoint =
  | { type: 'semantic_search'; text: string }
  | { type: 'exact_id'; id: string };

export interface Hop {
  direction: 'outgoing' | 'incoming';
  relation: RelationMatch;
  filter: Filter | null;
}

export type RelationMatch =
  | { type: 'wildcard' }
  | { type: 'fuzzy'; terms: string[] };

export type Filter =
  | { type: 'type_filter'; value: string }
  | { type: 'exact_id'; id: string }
  | { type: 'semantic_search'; text: string };
