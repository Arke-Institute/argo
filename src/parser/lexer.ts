/**
 * Lexer - Tokenize path query strings
 */

import type { Token, TokenType } from './types';

export class LexerError extends Error {
  constructor(
    message: string,
    public position: number
  ) {
    super(`${message} at position ${position}`);
    this.name = 'LexerError';
  }
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  function peek(offset = 0): string {
    return input[pos + offset] || '';
  }

  function advance(count = 1): void {
    pos += count;
  }

  function skipWhitespace(): void {
    while (pos < input.length && /\s/.test(input[pos])) {
      pos++;
    }
  }

  function readQuotedString(): string {
    const quote = input[pos];
    advance(); // skip opening quote
    let result = '';

    while (pos < input.length) {
      const ch = input[pos];
      if (ch === quote) {
        advance(); // skip closing quote
        return result;
      }
      if (ch === '\\' && pos + 1 < input.length) {
        advance();
        result += input[pos];
        advance();
      } else {
        result += ch;
        advance();
      }
    }

    throw new LexerError('Unterminated string', pos);
  }

  function readTerm(): string {
    let result = '';
    while (pos < input.length && /[a-zA-Z0-9_]/.test(input[pos])) {
      result += input[pos];
      advance();
    }
    return result;
  }

  while (pos < input.length) {
    skipWhitespace();
    if (pos >= input.length) break;

    const startPos = pos;
    const ch = peek();

    // Quoted string
    if (ch === '"' || ch === "'") {
      const value = readQuotedString();
      tokens.push({ type: 'QUOTED_STRING', value, position: startPos });
      continue;
    }

    // @id
    if (ch === '@') {
      advance();
      const id = readTerm();
      if (!id) {
        throw new LexerError('Expected identifier after @', pos);
      }
      tokens.push({ type: 'AT_ID', value: id, position: startPos });
      continue;
    }

    // type:value
    if (ch === 't' && input.slice(pos, pos + 5) === 'type:') {
      advance(5);
      const value = readTerm();
      if (!value) {
        throw new LexerError('Expected type name after type:', pos);
      }
      tokens.push({ type: 'TYPE_FILTER', value, position: startPos });
      continue;
    }

    // -[ (outgoing start)
    if (ch === '-' && peek(1) === '[') {
      advance(2);
      tokens.push({ type: 'ARROW_OUT_START', value: '-[', position: startPos });
      continue;
    }

    // ]-> (outgoing end)
    if (ch === ']' && peek(1) === '-' && peek(2) === '>') {
      advance(3);
      tokens.push({ type: 'ARROW_OUT_END', value: ']->', position: startPos });
      continue;
    }

    // <-[ (incoming start)
    if (ch === '<' && peek(1) === '-' && peek(2) === '[') {
      advance(3);
      tokens.push({ type: 'ARROW_IN_START', value: '<-[', position: startPos });
      continue;
    }

    // ]- (incoming end) - note: no > at the end for incoming
    if (ch === ']' && peek(1) === '-' && peek(2) !== '>') {
      advance(2);
      tokens.push({ type: 'ARROW_IN_END', value: ']-', position: startPos });
      continue;
    }

    // Wildcard
    if (ch === '*') {
      advance();
      tokens.push({ type: 'WILDCARD', value: '*', position: startPos });
      continue;
    }

    // Comma
    if (ch === ',') {
      advance();
      tokens.push({ type: 'COMMA', value: ',', position: startPos });
      continue;
    }

    // Tilde (semantic modifier)
    if (ch === '~') {
      advance();
      tokens.push({ type: 'TILDE', value: '~', position: startPos });
      continue;
    }

    // Term (relation name or other identifier)
    if (/[a-zA-Z_]/.test(ch)) {
      const term = readTerm();
      tokens.push({ type: 'TERM', value: term, position: startPos });
      continue;
    }

    throw new LexerError(`Unexpected character: ${ch}`, pos);
  }

  tokens.push({ type: 'EOF', value: '', position: pos });
  return tokens;
}
