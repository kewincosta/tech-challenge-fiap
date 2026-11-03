/** The part of Markdown the documentation specs need: sections, fenced blocks, links and code spans. */

export interface Fence {
  language: string;
  content: string;
}

export interface Section {
  level: number;
  /** The heading as written, without the marks of inline code. */
  title: string;
  /** The anchor GitHub gives the heading. */
  slug: string;
  /** Everything under the heading, down to the next heading of the same or a higher level. */
  text: string;
  /** The fenced blocks of that text. */
  fences: Fence[];
}

/** The anchor GitHub gives a heading: lower case, no punctuation, hyphens for spaces. */
export function slugOf(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

/** The fenced blocks of a text, in order. */
export function fencesOf(markdown: string): Fence[] {
  const fences: Fence[] = [];
  let current: { language: string; lines: string[] } | undefined;
  for (const line of markdown.split('\n')) {
    const mark = /^\s*```\s*(\S*)\s*$/.exec(line);
    if (mark !== null && current === undefined) {
      current = { language: mark[1], lines: [] };
    } else if (mark !== null && current !== undefined) {
      fences.push({ language: current.language, content: current.lines.join('\n') });
      current = undefined;
    } else if (current !== undefined) {
      current.lines.push(line);
    }
  }
  return fences;
}

/** The text with its fenced blocks taken out. */
export function proseOf(markdown: string): string {
  const kept: string[] = [];
  let inside = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) {
      inside = !inside;
    } else if (!inside) {
      kept.push(line);
    }
  }
  return kept.join('\n');
}

export function sectionsOf(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const headings: Array<{ index: number; level: number; title: string }> = [];
  let inside = false;
  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      inside = !inside;
    }
    const heading = inside ? null : /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading !== null) {
      headings.push({ index, level: heading[1].length, title: heading[2].replace(/`/g, '') });
    }
  });

  const seen = new Map<string, number>();
  return headings.map((heading, position) => {
    const next = headings.slice(position + 1).find((candidate) => candidate.level <= heading.level);
    const text = lines.slice(heading.index + 1, next?.index ?? lines.length).join('\n');
    const base = slugOf(heading.title);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return {
      level: heading.level,
      title: heading.title,
      slug: count === 0 ? base : `${base}-${count}`,
      text,
      fences: fencesOf(text),
    };
  });
}

/** The targets of the inline links of a text. */
export function linkTargets(prose: string): string[] {
  return [...prose.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]);
}

/** The text of every inline code span of a text. */
export function codeSpans(prose: string): string[] {
  return [...prose.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
}
