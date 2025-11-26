/**
 * Parser - Build AST from tokens
 */

import type {
  Token,
  TokenType,
  PathAST,
  EntryPoint,
  Hop,
  RelationMatch,
  Filter,
} from './types';

export class ParseError extends Error {
  constructor(
    message: string,
    public position: number
  ) {
    super(`${message} at position ${position}`);
    this.name = 'ParseError';
  }
}

export class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private current(): Token {
    return this.tokens[this.pos] || { type: 'EOF', value: '', position: -1 };
  }

  private peek(offset = 0): Token {
    return (
      this.tokens[this.pos + offset] || { type: 'EOF', value: '', position: -1 }
    );
  }

  private advance(): Token {
    const token = this.current();
    this.pos++;
    return token;
  }

  private expect(type: TokenType): Token {
    const token = this.current();
    if (token.type !== type) {
      throw new ParseError(
        `Expected ${type}, got ${token.type}`,
        token.position
      );
    }
    return this.advance();
  }

  private isAtEnd(): boolean {
    return this.current().type === 'EOF';
  }

  parse(): PathAST {
    const entry = this.parseEntryPoint();
    const hops: Hop[] = [];

    while (!this.isAtEnd()) {
      const hop = this.parseHop();
      if (hop) {
        hops.push(hop);
      } else {
        break;
      }
    }

    return { entry, hops };
  }

  private parseEntryPoint(): EntryPoint {
    const token = this.current();

    if (token.type === 'QUOTED_STRING') {
      this.advance();
      return { type: 'semantic_search', text: token.value };
    }

    if (token.type === 'AT_ID') {
      this.advance();
      return { type: 'exact_id', id: token.value };
    }

    throw new ParseError(
      `Expected entry point (quoted string or @id), got ${token.type}`,
      token.position
    );
  }

  private parseHop(): Hop | null {
    const token = this.current();

    // Check for arrow start
    if (
      token.type !== 'ARROW_OUT_START' &&
      token.type !== 'ARROW_IN_START'
    ) {
      return null;
    }

    const direction: 'outgoing' | 'incoming' =
      token.type === 'ARROW_OUT_START' ? 'outgoing' : 'incoming';
    this.advance();

    // Parse relation
    const relation = this.parseRelation();

    // Expect arrow end
    const expectedEnd =
      direction === 'outgoing' ? 'ARROW_OUT_END' : 'ARROW_IN_END';
    this.expect(expectedEnd);

    // Parse optional filter
    const filter = this.parseFilter();

    return { direction, relation, filter };
  }

  private parseRelation(): RelationMatch {
    const token = this.current();

    // Wildcard
    if (token.type === 'WILDCARD') {
      this.advance();
      return { type: 'wildcard' };
    }

    // Term list
    const terms: string[] = [];

    if (token.type === 'TERM') {
      terms.push(token.value);
      this.advance();

      // Check for more terms
      while (this.current().type === 'COMMA') {
        this.advance(); // skip comma
        const termToken = this.expect('TERM');
        terms.push(termToken.value);
      }
    }

    if (terms.length === 0) {
      throw new ParseError(
        'Expected relation term or wildcard (*)',
        token.position
      );
    }

    return { type: 'fuzzy', terms };
  }

  private parseFilter(): Filter | null {
    const token = this.current();

    // Type filter
    if (token.type === 'TYPE_FILTER') {
      this.advance();
      return { type: 'type_filter', value: token.value };
    }

    // Exact ID
    if (token.type === 'AT_ID') {
      this.advance();
      return { type: 'exact_id', id: token.value };
    }

    // Semantic search (quoted string that's not an entry point)
    if (token.type === 'QUOTED_STRING') {
      this.advance();
      return { type: 'semantic_search', text: token.value };
    }

    // No filter
    return null;
  }
}

export function parse(tokens: Token[]): PathAST {
  const parser = new Parser(tokens);
  return parser.parse();
}
