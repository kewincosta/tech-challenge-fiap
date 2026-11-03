/**
 * An evaluator for the expressions of GitHub Actions workflows (`${{ ... }}` and the `if:` of a job),
 * so a spec can ask what a condition gives for an example instead of comparing its text. It follows
 * the documented rules: `==` compares strings without regard to case and turns other pairs of types
 * into numbers, `&&` and `||` return one of their operands, a missing property is null, and the
 * status functions read the status the caller passes in.
 */

export type Value = string | number | boolean | null | Value[] | { [key: string]: Value };
export type Context = Record<string, Value>;
export type Status = 'success' | 'failure' | 'cancelled';

type Node =
  | { type: 'literal'; value: Value }
  | { type: 'context'; name: string }
  | { type: 'access'; object: Node; key: Node }
  | { type: 'not'; operand: Node }
  | { type: 'binary'; operator: string; left: Node; right: Node }
  | { type: 'call'; name: string; args: Node[] };

const STATUS_FUNCTION = /(?<![\w.-])(?:success|failure|cancelled|always)\s*\(/;

/** True when the expression calls a status function, which stops a skipped need from skipping the job. */
export function hasStatusFunction(expression: string): boolean {
  return STATUS_FUNCTION.test(expression);
}

/** The expression inside `${{ }}`, or the text itself when it has no wrapper, as an `if:` may be. */
export function unwrap(text: string): string {
  const match = /^\s*\$\{\{([\s\S]*)\}\}\s*$/.exec(text);
  return match === null ? text : match[1];
}

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  const pattern =
    /\s*('(?:[^']|'')*'|-?\d+(?:\.\d+)?|[A-Za-z_][\w-]*|&&|\|\||==|!=|<=|>=|[<>!()[\].,*])/y;
  let index = 0;
  while (index < source.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(source);
    if (match === null) {
      if (source.slice(index).trim() === '') {
        break;
      }
      throw new Error(`Cannot read the expression at "${source.slice(index)}".`);
    }
    tokens.push(match[1]);
    index = pattern.lastIndex;
  }
  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: string[]) {}

  parse(): Node {
    const node = this.or();
    if (this.index < this.tokens.length) {
      throw new Error(`Unexpected "${this.tokens[this.index]}" in the expression.`);
    }
    return node;
  }

  private peek(): string | undefined {
    return this.tokens[this.index];
  }

  private take(expected?: string): string {
    const token = this.tokens[this.index];
    if (token === undefined || (expected !== undefined && token !== expected)) {
      throw new Error(`Expected "${expected ?? 'more'}" but found "${token ?? 'the end'}".`);
    }
    this.index += 1;
    return token;
  }

  private binary(operators: string[], next: () => Node): Node {
    let left = next();
    while (operators.includes(this.peek() ?? '')) {
      const operator = this.take();
      left = { type: 'binary', operator, left, right: next() };
    }
    return left;
  }

  private or(): Node {
    return this.binary(['||'], () => this.and());
  }

  private and(): Node {
    return this.binary(['&&'], () => this.equality());
  }

  private equality(): Node {
    return this.binary(['==', '!='], () => this.comparison());
  }

  private comparison(): Node {
    return this.binary(['<', '<=', '>', '>='], () => this.unary());
  }

  private unary(): Node {
    if (this.peek() === '!') {
      this.take();
      return { type: 'not', operand: this.unary() };
    }
    return this.postfix();
  }

  private postfix(): Node {
    let node = this.primary();
    for (;;) {
      if (this.peek() === '.') {
        this.take();
        const name = this.take();
        node = { type: 'access', object: node, key: { type: 'literal', value: name } };
      } else if (this.peek() === '[') {
        this.take();
        const key = this.or();
        this.take(']');
        node = { type: 'access', object: node, key };
      } else {
        return node;
      }
    }
  }

  private primary(): Node {
    const token = this.take();
    if (token === '(') {
      const inner = this.or();
      this.take(')');
      return inner;
    }
    if (token.startsWith("'")) {
      return { type: 'literal', value: token.slice(1, -1).replace(/''/g, "'") };
    }
    if (/^-?\d/.test(token)) {
      return { type: 'literal', value: Number(token) };
    }
    if (token === 'true' || token === 'false') {
      return { type: 'literal', value: token === 'true' };
    }
    if (token === 'null') {
      return { type: 'literal', value: null };
    }
    if (!/^[A-Za-z_]/.test(token)) {
      throw new Error(`Unexpected "${token}" in the expression.`);
    }
    if (this.peek() === '(') {
      this.take();
      const args: Node[] = [];
      while (this.peek() !== ')') {
        args.push(this.or());
        if (this.peek() === ',') {
          this.take();
        }
      }
      this.take(')');
      return { type: 'call', name: token, args };
    }
    return { type: 'context', name: token };
  }
}

/** Falsy: false, 0, "", null and NaN. Everything else, objects and arrays included, is truthy. */
export function truthy(value: Value): boolean {
  return !(value === false || value === 0 || value === '' || value === null || Number.isNaN(value));
}

function toNumber(value: Value): number {
  if (value === null || value === false || value === '') {
    return 0;
  }
  if (value === true) {
    return 1;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim() === '' ? NaN : Number(value);
  }
  return NaN;
}

/** The text GitHub makes of a value: nothing for null, JSON for an object. */
export function toText(value: Value): string {
  if (value === null) {
    return '';
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function looseEquals(left: Value, right: Value): boolean {
  if (typeof left === 'string' && typeof right === 'string') {
    return left.toLowerCase() === right.toLowerCase();
  }
  if (
    (typeof left === 'object' && left !== null) ||
    (typeof right === 'object' && right !== null)
  ) {
    return left === right;
  }
  if (typeof left === typeof right) {
    return left === right;
  }
  return toNumber(left) === toNumber(right);
}

function compare(left: Value, right: Value): number {
  if (typeof left === 'string' && typeof right === 'string') {
    const [a, b] = [left.toLowerCase(), right.toLowerCase()];
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const [a, b] = [toNumber(left), toNumber(right)];
  return Number.isNaN(a) || Number.isNaN(b) ? NaN : a - b;
}

function lookup(object: Value, key: Value): Value {
  if (object === null || typeof object !== 'object') {
    return null;
  }
  if (Array.isArray(object)) {
    return typeof key === 'number' ? (object[key] ?? null) : null;
  }
  const entry = Object.entries(object).find(
    ([name]) => name.toLowerCase() === toText(key).toLowerCase(),
  );
  return entry === undefined ? null : entry[1];
}

interface Frame {
  context: Context;
  status: Status;
}

function call(name: string, args: Value[], frame: Frame): Value {
  const [first, second] = args;
  switch (name.toLowerCase()) {
    case 'success':
      return frame.status === 'success';
    case 'failure':
      return frame.status === 'failure';
    case 'cancelled':
      return frame.status === 'cancelled';
    case 'always':
      return true;
    case 'contains':
      return Array.isArray(first)
        ? first.some((item) => looseEquals(item, second))
        : toText(first).toLowerCase().includes(toText(second).toLowerCase());
    case 'startswith':
      return toText(first).toLowerCase().startsWith(toText(second).toLowerCase());
    case 'endswith':
      return toText(first).toLowerCase().endsWith(toText(second).toLowerCase());
    case 'format':
      return toText(first).replace(/\{\{|\}\}|\{(\d+)\}/g, (match, position?: string) =>
        position === undefined ? match[0] : toText(args[Number(position) + 1] ?? null),
      );
    case 'join':
      return Array.isArray(first)
        ? first.map(toText).join(second === undefined ? ',' : toText(second))
        : toText(first);
    case 'tojson':
      return JSON.stringify(first);
    default:
      throw new Error(`The evaluator does not know the function ${name}().`);
  }
}

function run(node: Node, frame: Frame): Value {
  switch (node.type) {
    case 'literal':
      return node.value;
    case 'context':
      return frame.context[node.name] ?? null;
    case 'access':
      return lookup(run(node.object, frame), run(node.key, frame));
    case 'not':
      return !truthy(run(node.operand, frame));
    case 'call':
      return call(
        node.name,
        node.args.map((arg) => run(arg, frame)),
        frame,
      );
    case 'binary': {
      const left = run(node.left, frame);
      if (node.operator === '&&') {
        return truthy(left) ? run(node.right, frame) : left;
      }
      if (node.operator === '||') {
        return truthy(left) ? left : run(node.right, frame);
      }
      const right = run(node.right, frame);
      switch (node.operator) {
        case '==':
          return looseEquals(left, right);
        case '!=':
          return !looseEquals(left, right);
        case '<':
          return compare(left, right) < 0;
        case '<=':
          return compare(left, right) <= 0;
        case '>':
          return compare(left, right) > 0;
        default:
          return compare(left, right) >= 0;
      }
    }
  }
}

/** The value of one expression, with no `${{ }}` around it. */
export function evaluate(expression: string, context: Context, status: Status = 'success'): Value {
  return run(new Parser(tokenize(expression)).parse(), { context, status });
}

/**
 * The value of a workflow string. One expression that fills the whole string keeps its type, and
 * expressions inside other text become text, the way GitHub reads `group: deploy-${{ github.ref }}`.
 */
export function interpolate(text: string, context: Context, status: Status = 'success'): Value {
  const whole = /^\s*\$\{\{([\s\S]*?)\}\}\s*$/.exec(text);
  if (whole !== null && !whole[1].includes('}}')) {
    return evaluate(whole[1], context, status);
  }
  return text.replace(/\$\{\{([\s\S]*?)\}\}/g, (_match, expression: string) =>
    toText(evaluate(expression, context, status)),
  );
}

/**
 * Whether GitHub starts a job whose needs all succeeded: its `if:` decides, and an expression with
 * no status function gets an implicit `success() &&` in front of it.
 */
export function jobRuns(
  condition: string | undefined,
  context: Context,
  status: Status = 'success',
): boolean {
  if (condition === undefined) {
    return status === 'success';
  }
  const expression = unwrap(String(condition));
  return truthy(
    hasStatusFunction(expression)
      ? evaluate(expression, context, status)
      : evaluate(`success() && (${expression})`, context, status),
  );
}
