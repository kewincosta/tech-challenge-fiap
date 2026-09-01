#!/usr/bin/env python3
"""
validate_state.py - deterministic completion gate for a feature.

The skill's strongest invariant is "the Verifier is always-on, never prompted;
Execute is not done until validation.md reports PASS." That is prose the model
must remember. This turns it into a checkable pass/fail the closing step runs
automatically, so declaring a feature done without a real Verifier report fails
loudly instead of slipping through.

It does NOT merely check that validation.md exists - a report that exists but is
empty, still holds the template placeholder, or has no evidence would pass a
shallow existence check while proving nothing. This gate requires a real,
filled verdict plus at least one file:line evidence citation.

Operates only on the .specs/ markdown artifacts (stack- and tool-agnostic). No
dependencies. Run from the project root (the dir that contains .specs), or pass
--root. Meant to be invoked by the skill as the closing gate of Execute, the
same way lessons.py is invoked at distillation - not a manual step.

Usage:
  python3 <skill-dir>/scripts/validate_state.py [feature]
  python3 <skill-dir>/scripts/validate_state.py

  Invoke from the skill directory that ships this script (not the project root).
  Pass --root when cwd is not the project that contains .specs/.

Exit codes: 0 ok, 1 a completed feature is missing a real PASS report,
            2 usage error.
"""

import argparse
import os
import re
import sys

# A file:line citation: a path with an extension, then :<line>. e.g. src/a.ts:42
EVIDENCE_RE = re.compile(r"[\w./-]+\.[A-Za-z0-9]+:\d+")


def _feature_dirs(root):
    base = os.path.join(root, ".specs", "features")
    if not os.path.isdir(base):
        return base, []
    dirs = [
        d for d in sorted(os.listdir(base))
        if os.path.isdir(os.path.join(base, d))
    ]
    return base, dirs


_HEADING_RE = re.compile(r"^#{1,4}\s*validation\b", re.IGNORECASE)
_LABEL_RE = re.compile(r"\*{0,2}(?:verdict|result)\*{0,2}\s*:", re.IGNORECASE)
# A value at the end of a label line, after a dash: "**Result**: 3/3 killed - PASS".
_TRAILING_RE = re.compile(r"-\s*\**\s*(PASS|FAIL)\b[^A-Za-z]*$", re.IGNORECASE)
# The unfilled template idiom right after a label: "[PASS | FAIL]" (with or without emoji).
_PLACEHOLDER_RE = re.compile(
    r"^\**\s*(?:PASS|FAIL)\b[^|]{0,4}\|[^A-Za-z]{0,4}(?:PASS|FAIL)\b", re.IGNORECASE
)


def _line_verdict(line):
    """Return 'pass', 'fail', 'unfilled', or None for a single stripped line.

    None means the line does not declare a verdict at all - distinct from a
    line that merely mentions the word PASS or FAIL somewhere in prose (a
    Discrimination Sensor summary like "5 of 7 killed this pass. FAIL."
    describes one round's sensor result, not the report's own verdict).
    """
    if _HEADING_RE.match(line):
        # '## Validation: [Feature] - [PASS | FAIL]' - the value sits after the
        # last dash, regardless of how long the feature name in between is.
        tail = line.rsplit("-", 1)[-1] if "-" in line else line
        has_pass = re.search(r"\bPASS\b", tail) is not None
        has_fail = re.search(r"\bFAIL\b", tail) is not None
        if has_pass and has_fail:
            return "unfilled"
        if has_pass:
            return "pass"
        if has_fail:
            return "fail"
        return None
    m = _LABEL_RE.search(line)
    if not m:
        return None
    rest = line[m.end():].lstrip(" *:-[")
    if _PLACEHOLDER_RE.match(rest):
        return "unfilled"
    # The value is recognized only immediately after the label ("**Verdict**:
    # PASS", "**Result**: PASS ..."), or as the line's trailing "- PASS"/"-
    # FAIL". A FAIL appearing later in an unrelated sentence, with neither of
    # those shapes, does not count - this is what lets a multi-round report
    # keep a prior round's FAIL as history below its current PASS without the
    # historical text making the whole file misread as failing.
    first_word = rest.split(None, 1)[0] if rest.split(None, 1) else ""
    leads_pass = first_word.upper().startswith("PASS")
    leads_fail = first_word.upper().startswith("FAIL")
    trailing = _TRAILING_RE.search(rest)
    trails_pass = bool(trailing) and trailing.group(1).upper() == "PASS"
    trails_fail = bool(trailing) and trailing.group(1).upper() == "FAIL"
    has_pass = leads_pass or trails_pass
    has_fail = leads_fail or trails_fail
    if has_pass and has_fail:
        return "unfilled"
    if has_pass:
        return "pass"
    if has_fail:
        return "fail"
    return None


def _verdict(text):
    """Return 'pass', 'fail', 'unfilled', or None from a validation report.

    Scans top to bottom and returns the first line that declares a verdict.
    A report that keeps prior rounds' history below its current verdict (the
    tlc-spec-driven convention for a feature that went through a fix-and-
    re-verify loop) writes its current, authoritative verdict first - the
    first declaration in the file is the one that governs.
    """
    for raw in text.splitlines():
        v = _line_verdict(raw.strip())
        if v is not None:
            return v
    return None


def _appears_complete(fdir):
    """Conservative completeness heuristic for the cross-check mode.

    A feature 'appears complete' if it already has a validation.md, or if it has
    a tasks.md with at least one task and no unchecked '- [ ]' boxes left. When
    the signal is ambiguous (no tasks.md, Tasks phase skipped), returns False so
    an in-flight feature is never falsely flagged.
    """
    if os.path.exists(os.path.join(fdir, "validation.md")):
        return True
    tasks = os.path.join(fdir, "tasks.md")
    if not os.path.exists(tasks):
        return False
    body = open(tasks, encoding="utf-8", errors="replace").read()
    if not re.search(r"^#{2,4}\s+T\d+\s*:", body, re.MULTILINE):
        return False
    if re.search(r"^\s*-\s*\[\s\]", body, re.MULTILINE):
        return False  # unchecked box remains -> still in progress
    return True


def _check_feature(fdir, name):
    """Return list of error strings for one feature (empty = pass)."""
    errors = []
    vpath = os.path.join(fdir, "validation.md")
    if not os.path.exists(vpath):
        errors.append(
            f"{name}: no validation.md - Execute is not done until the Verifier "
            f"writes it (author != verifier). Dispatch validation before marking done."
        )
        return errors
    text = open(vpath, encoding="utf-8", errors="replace").read()
    verdict = _verdict(text)
    if verdict is None:
        errors.append(f"{name}: validation.md has no PASS/FAIL verdict (a prose-only report does not count)")
    elif verdict == "unfilled":
        errors.append(f"{name}: validation.md verdict is still the template placeholder '[PASS | FAIL]' - not filled")
    elif verdict == "fail":
        errors.append(f"{name}: validation.md verdict is FAIL - route the ranked gaps to fix tasks, then re-verify (feature is not done)")
    if verdict == "pass" and not EVIDENCE_RE.search(text):
        errors.append(f"{name}: validation.md is PASS but cites no file:line evidence - evidence-or-zero not satisfied")
    return errors


def _resolve(root, feature):
    base, dirs = _feature_dirs(root)
    if not os.path.isdir(base):
        print(f"validate_state: no {base} directory - nothing to check.")
        return []
    if feature:
        fdir = feature if os.path.isdir(feature) else os.path.join(base, feature)
        if not os.path.isdir(fdir):
            print(f"validate_state: feature not found: {feature}", file=sys.stderr)
            raise SystemExit(2)
        return [(fdir, os.path.basename(fdir.rstrip("/")))]
    if len(dirs) == 1:
        return [(os.path.join(base, dirs[0]), dirs[0])]
    if not dirs:
        print("validate_state: no features under .specs/features/ - nothing to check.")
        return []
    # Cross-check mode: only features that appear complete.
    picked = [(os.path.join(base, d), d) for d in dirs if _appears_complete(os.path.join(base, d))]
    if not picked:
        print("validate_state: no completed feature detected (all in progress) - nothing to gate.")
    return picked


def main(argv=None):
    p = argparse.ArgumentParser(prog="validate_state.py", description="Deterministic completion gate: a done feature must have a real PASS validation report.")
    p.add_argument("feature", nargs="?", default=None, help="Feature dir or name (default: sole feature, else cross-check all completed)")
    p.add_argument("--root", default=".", help="Project root containing .specs/ (default: current dir)")
    args = p.parse_args(argv)
    root = os.path.abspath(args.root)

    targets = _resolve(root, args.feature)
    all_errors = []
    for fdir, name in targets:
        all_errors += _check_feature(fdir, name)

    for e in all_errors:
        print(f"  ERROR {e}")
    n = len(all_errors)
    checked = ", ".join(name for _, name in targets) or "(none)"
    print(f"\nvalidate_state: {n} error(s) across [{checked}]")
    return 1 if n else 0


if __name__ == "__main__":
    raise SystemExit(main())
