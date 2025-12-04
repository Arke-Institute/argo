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
  DepthRange,
} from './types';
// Filter is used in parse() for entry_filter

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

    // Check for optional entry filter
    // This allows: "semantic search" type:person (zero-hop query)
    // or: "semantic search" type:person -[*]-> (filter entry before traversal)
    // or: "semantic search" type:person ~ "ranking text"
    let entry_filter: Filter | undefined;
    const filterToken = this.current();
    if (
      filterToken.type === 'TYPE_FILTER' ||
      filterToken.type === 'QUOTED_STRING' ||
      filterToken.type === 'AT_ID'
    ) {
      entry_filter = this.parseFilter() ?? undefined;
    }

    const hops: Hop[] = [];

    while (!this.isAtEnd()) {
      const hop = this.parseHop();
      if (hop) {
        hops.push(hop);
      } else {
        break;
      }
    }

    return { entry, entry_filter, hops };
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

    // type:X or type:X ~ "text" as entry point
    if (token.type === 'TYPE_FILTER') {
      this.advance();
      const typeValues = token.value.split(',');

      // Check for ~ followed by quoted string (semantic search within type)
      if (this.current().type === 'TILDE') {
        this.advance(); // consume ~
        const semanticToken = this.current();
        if (semanticToken.type !== 'QUOTED_STRING') {
          throw new ParseError(
            'Expected quoted string after ~',
            semanticToken.position
          );
        }
        this.advance();
        return {
          type: 'type_filter_semantic',
          type_values: typeValues,
          text: semanticToken.value,
        };
      }

      return { type: 'type_filter', type_values: typeValues };
    }

    throw new ParseError(
      `Expected entry point (quoted string, @id, or type:), got ${token.type}`,
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

    const startsIncoming = token.type === 'ARROW_IN_START';
    this.advance();

    // Parse relation
    const relation = this.parseRelation();

    // Expect closing bracket
    this.expect('RBRACKET');

    // Parse optional depth range (between ] and -> or -)
    const depth_range = this.parseDepthRange();

    // Determine direction from start + end token combination
    // <-[...]-> = bidirectional
    // <-[...]- = incoming
    // -[...]-> = outgoing
    let direction: 'outgoing' | 'incoming' | 'bidirectional';

    if (startsIncoming && this.current().type === 'ARROW_OUT') {
      // <-[...]-> = bidirectional
      direction = 'bidirectional';
      this.advance();
    } else if (startsIncoming) {
      // <-[...]- = incoming
      direction = 'incoming';
      this.expect('DASH');
    } else {
      // -[...]-> = outgoing
      direction = 'outgoing';
      this.expect('ARROW_OUT');
    }

    // Parse optional filter
    const filter = this.parseFilter();

    return { direction, relation, filter, depth_range };
  }

  private parseDepthRange(): DepthRange | undefined {
    if (this.current().type !== 'LBRACE') {
      return undefined;
    }

    this.advance(); // consume {

    let min = 1;
    let max: number;

    const firstToken = this.current();

    if (firstToken.type === 'NUMBER') {
      const first = parseInt(this.advance().value, 10);

      if (this.current().type === 'RBRACE') {
        // {3} - exact depth
        this.advance();
        return { min: first, max: first };
      }

      if (this.current().type === 'COMMA') {
        this.advance(); // consume comma
        min = first;

        if (this.current().type === 'NUMBER') {
          max = parseInt(this.advance().value, 10);
        } else {
          // {2,} - min with no max (use default)
          max = -1;
        }

        this.expect('RBRACE');
        return { min, max };
      }

      throw new ParseError(
        'Expected , or } after number in depth range',
        this.current().position
      );
    } else if (firstToken.type === 'COMMA') {
      // {,4} - shorthand for {1,4}
      this.advance(); // consume comma
      min = 1;
      max = parseInt(this.expect('NUMBER').value, 10);
      this.expect('RBRACE');
      return { min, max };
    }

    throw new ParseError(
      'Expected number or comma in depth range',
      firstToken.position
    );
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

    // Type filter (possibly combined with semantic)
    // Supports single type (type:person) or multi-type (type:file,document)
    if (token.type === 'TYPE_FILTER') {
      this.advance();
      const typeValues = token.value.split(',');

      // Check for ~ followed by quoted string (combined filter)
      if (this.current().type === 'TILDE') {
        this.advance(); // consume ~
        const semanticToken = this.current();
        if (semanticToken.type !== 'QUOTED_STRING') {
          throw new ParseError(
            'Expected quoted string after ~',
            semanticToken.position
          );
        }
        this.advance();
        return {
          type: 'combined_filter',
          type_values: typeValues,
          semantic_text: semanticToken.value,
        };
      }

      return { type: 'type_filter', values: typeValues };
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
