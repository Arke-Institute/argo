/**
 * Parser Module - Parse path query strings into AST
 */

import { tokenize, LexerError } from './lexer';
import { parse as parseTokens, ParseError } from './parser';
import type { PathAST } from './types';

export { LexerError } from './lexer';
export { ParseError } from './parser';
export * from './types';

/**
 * Parse a path query string into an AST
 *
 * @example
 * parse('"George Washington" -[born]-> type:date')
 * // Returns:
 * // {
 * //   entry: { type: 'semantic_search', text: 'George Washington' },
 * //   hops: [{
 * //     direction: 'outgoing',
 * //     relation: { type: 'fuzzy', terms: ['born'] },
 * //     filter: { type: 'type_filter', value: 'date' }
 * //   }]
 * // }
 */
export function parse(input: string): PathAST {
  const tokens = tokenize(input);
  return parseTokens(tokens);
}

/**
 * Validate a path query string without fully parsing
 * Returns null if valid, or an error message if invalid
 */
export function validate(input: string): string | null {
  try {
    parse(input);
    return null;
  } catch (e) {
    if (e instanceof LexerError || e instanceof ParseError) {
      return e.message;
    }
    throw e;
  }
}
