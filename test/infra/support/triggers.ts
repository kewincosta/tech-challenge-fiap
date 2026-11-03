/**
 * An evaluator for the `on:` block of a GitHub Actions workflow, so a spec can ask whether an event
 * starts a run. It follows the documented rules for the filters a workflow of this repository uses.
 * A `push` is filtered by the name of the branch or the tag it pushes, and a `pull_request` by the
 * name of the branch it targets. A pattern matches the whole name: `*` stops at a slash, `**` does
 * not, `?` and `+` apply to the character before them, `[a-z]` is a class, and a `!` pattern cancels
 * what the patterns before it matched. A workflow that filters only branches runs for no tag, and
 * one that filters only tags runs for no branch. A pull request event runs for the activity types
 * `opened`, `synchronize` and `reopened` unless `types` lists others. A filter on the files of a
 * change needs a change, which an example does not have, so the evaluator refuses it.
 */

export type TriggerEvent =
  | { name: 'push'; branch: string }
  | { name: 'push'; tag: string }
  | { name: 'pull_request'; action: string; base: string };

type Filters = Record<string, unknown>;

const DEFAULT_PULL_REQUEST_TYPES = ['opened', 'synchronize', 'reopened'];
const FILTERS = ['branches', 'branches-ignore', 'tags', 'tags-ignore', 'types'];

/** True when the event starts a run of a workflow whose triggers are these, as `triggersOf` gives them. */
export function startsRun(triggers: Record<string, Filters>, event: TriggerEvent): boolean {
  const filters = triggers[event.name];
  if (filters === undefined) {
    return false;
  }
  for (const key of Object.keys(filters)) {
    if (!FILTERS.includes(key)) {
      throw new Error(
        `Cannot tell from an example whether the "${key}" filter of ${event.name} lets it through.`,
      );
    }
  }
  if (event.name === 'pull_request') {
    const types = listOf(filters.types) ?? DEFAULT_PULL_REQUEST_TYPES;

    return types.includes(event.action) && allowsRef(filters, 'branch', event.base);
  }
  return 'tag' in event
    ? allowsRef(filters, 'tag', event.tag)
    : allowsRef(filters, 'branch', event.branch);
}

function allowsRef(filters: Filters, kind: 'branch' | 'tag', name: string): boolean {
  const [include, ignore, otherInclude, otherIgnore] =
    kind === 'branch'
      ? ['branches', 'branches-ignore', 'tags', 'tags-ignore']
      : ['tags', 'tags-ignore', 'branches', 'branches-ignore'];
  const included = listOf(filters[include]);
  const ignored = listOf(filters[ignore]);

  if (included !== undefined) {
    return matches(included, name);
  }
  if (ignored !== undefined) {
    return !matches(ignored, name);
  }
  return filters[otherInclude] === undefined && filters[otherIgnore] === undefined;
}

function listOf(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const list = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(list) || list.some((item) => typeof item !== 'string')) {
    throw new Error(`A filter lists names as text: ${JSON.stringify(value)}.`);
  }
  return list as string[];
}

/** Patterns are read in order: a matching `!` pattern drops the name, and a later match restores it. */
function matches(patterns: string[], name: string): boolean {
  let included = false;
  for (const pattern of patterns) {
    const negated = pattern.startsWith('!');

    if (expressionOf(negated ? pattern.slice(1) : pattern).test(name)) {
      included = !negated;
    }
  }
  return included;
}

function expressionOf(pattern: string): RegExp {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      const double = pattern[index + 1] === '*';

      source += double ? '.*' : '[^/]*';
      index += double ? 1 : 0;
    } else if (character === '?' || character === '+') {
      source += character;
    } else if (character === '[' && pattern.includes(']', index)) {
      const end = pattern.indexOf(']', index);

      source += pattern.slice(index, end + 1);
      index = end;
    } else {
      source += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}
