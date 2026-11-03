import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Just enough of HCL to read the Terraform files of the repository: comments, string literals,
 * numbers, blocks and the arguments of a block. It does not evaluate anything.
 */

/** The index just past the closing quote of the string that starts at `start`. */
function endOfString(source: string, start: number): number {
  let index = start + 1;
  while (index < source.length) {
    const character = source[index];
    if (character === '\\') {
      index += 2;
    } else if (character === '$' && source[index + 1] === '{') {
      index = endOfInterpolation(source, index + 2);
    } else if (character === '"') {
      return index + 1;
    } else {
      index += 1;
    }
  }
  return index;
}

/** The index just past the brace that closes the interpolation whose text starts at `start`. */
function endOfInterpolation(source: string, start: number): number {
  let depth = 1;
  let index = start;
  while (index < source.length && depth > 0) {
    const character = source[index];
    if (character === '"') {
      index = endOfString(source, index);
    } else {
      depth += character === '{' ? 1 : character === '}' ? -1 : 0;
      index += 1;
    }
  }
  return index;
}

/** The text without its comments. A comment mark inside a string belongs to the string. */
export function withoutComments(source: string): string {
  let output = '';
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const pair = source.slice(index, index + 2);
    if (character === '"') {
      const end = endOfString(source, index);
      output += source.slice(index, end);
      index = end;
    } else if (character === '#' || pair === '//') {
      while (index < source.length && source[index] !== '\n') {
        index += 1;
      }
    } else if (pair === '/*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
    } else {
      output += character;
      index += 1;
    }
  }
  return output;
}

/** The text of every string literal, without its quotes, interpolations kept as written. */
export function stringLiterals(source: string): string[] {
  const literals: string[] = [];
  let index = 0;
  while (index < source.length) {
    if (source[index] === '"') {
      const end = endOfString(source, index);
      literals.push(source.slice(index + 1, end - 1));
      index = end;
    } else {
      index += 1;
    }
  }
  return literals;
}

/** The text with every string literal emptied, which leaves the identifiers and the numbers. */
export function withoutStrings(source: string): string {
  let output = '';
  let index = 0;
  while (index < source.length) {
    if (source[index] === '"') {
      output += '""';
      index = endOfString(source, index);
    } else {
      output += source[index];
      index += 1;
    }
  }
  return output;
}

/** The numbers written in the code, outside strings and not part of an identifier. */
export function numericLiterals(source: string): number[] {
  const matches = withoutStrings(source).matchAll(/(?<![\w.$-])\d+(?:\.\d+)?(?![\w.])/g);
  return [...matches].map((match) => Number(match[0]));
}

export interface Block {
  labels: string[];
  body: string;
}

/** The index of the brace that closes the one at `open`. */
function matchingBrace(source: string, open: number): number {
  let depth = 0;
  let index = open;
  while (index < source.length) {
    const character = source[index];
    if (character === '"') {
      index = endOfString(source, index);
    } else {
      depth += character === '{' ? 1 : character === '}' ? -1 : 0;
      if (depth === 0) {
        return index;
      }
      index += 1;
    }
  }
  throw new Error('A brace is never closed.');
}

/** Every block of a type, such as `module` or `variable`, with its labels and the text inside. */
export function blocks(source: string, type: string): Block[] {
  const header = new RegExp(`(?:^|\\n)[ \\t]*${type}((?:[ \\t]+"[^"]*")*)[ \\t]*\\{`, 'g');
  return [...source.matchAll(header)].map((match) => {
    const open = match.index + match[0].length - 1;
    const close = matchingBrace(source, open);
    return {
      labels: stringLiterals(match[1]),
      body: source.slice(open + 1, close),
    };
  });
}

/**
 * The arguments written directly in a body, by name, with the expression as written. A nested block
 * and what it holds are left out, and an expression that spans lines is joined.
 */
export function blockArguments(body: string): Record<string, string> {
  const found: Record<string, string> = {};
  let depth = 0;
  let current: string | undefined;
  for (const line of body.split('\n')) {
    const bare = withoutStrings(line);
    if (depth === 0) {
      const assignment = /^\s*([A-Za-z_][\w-]*)\s*=\s*(.*)$/.exec(line);
      current = assignment?.[1];
      if (current !== undefined) {
        found[current] = assignment?.[2].trim() ?? '';
      }
    } else if (current !== undefined) {
      found[current] += ` ${line.trim()}`;
    }
    for (const character of bare) {
      depth += '{[('.includes(character) ? 1 : '}])'.includes(character) ? -1 : 0;
    }
  }
  return found;
}

/** The text of a string argument as written, or undefined when it is not a plain string. */
export function unquoted(expression: string | undefined): string | undefined {
  const match = /^"([^"]*)"$/.exec(expression ?? '');
  return match?.[1];
}

/** Every `.tf` file under a folder, as paths relative to it, leaving out what `init` downloads. */
export function terraformFiles(folder: string, relative = ''): string[] {
  return readdirSync(join(folder, relative), { withFileTypes: true }).flatMap((entry) => {
    const path = join(relative, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '.terraform' ? [] : terraformFiles(folder, path);
    }
    return entry.name.endsWith('.tf') ? [path] : [];
  });
}

export function readText(path: string): string {
  return readFileSync(path, 'utf8');
}
