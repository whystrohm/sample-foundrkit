#!/usr/bin/env node
/**
 * foundrkit-lint — the firewall the GitHub Action runs on every PR.
 *
 * Reads foundrkit.rules.json + forbidden.json and applies them to one
 * or more markdown files. Exits 0 if every file passes every block
 * rule. Exits 1 if any block rule fires. Warn rules surface in the log
 * but don't fail CI.
 *
 * Usage:
 *   node foundrkit-lint.mjs <file> [<file> ...]
 *
 * Output format is intentionally human-readable in CI logs:
 *
 *   examples/bad-post.md
 *     ✗ no-em-dashes               em-dash on line 3 col 47
 *     ✗ no-forbidden-words         "game-changing" on line 1 col 14
 *     ⚠ max-sentence-length        38% of sentences over 25 words (limit 30%)
 *
 *   1 file checked, 2 block violations, 1 warning. FAILED.
 *
 * Zero external dependencies — runs on any Node 18+ without npm install,
 * so the GitHub Action can use a bare `node` step.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES = JSON.parse(readFileSync(resolve(HERE, "foundrkit.rules.json"), "utf8"));
const FORBIDDEN = JSON.parse(readFileSync(resolve(HERE, "forbidden.json"), "utf8"));

// Flatten all forbidden categories into one case-insensitive list,
// preserving the source category for log readability.
function flattenForbidden() {
  const out = [];
  for (const [category, items] of Object.entries(FORBIDDEN)) {
    if (category.startsWith("_") || category.startsWith("$")) continue;
    if (!Array.isArray(items)) continue;
    for (const phrase of items) {
      out.push({ phrase, category });
    }
  }
  return out;
}
const FORBIDDEN_FLAT = flattenForbidden();

// Strip markdown front matter, code fences, and inline code so the
// linter doesn't false-flag a forbidden word inside a `code block`
// that's quoting bad input.
function stripCodeAndFront(content) {
  let s = content;
  if (s.startsWith("---")) {
    const close = s.indexOf("\n---", 3);
    if (close !== -1) s = s.slice(close + 4);
  }
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`[^`]*`/g, " ");
  return s;
}

function findLineCol(content, index) {
  let line = 1, col = 1;
  for (let i = 0; i < index; i++) {
    if (content[i] === "\n") { line++; col = 1; } else { col++; }
  }
  return { line, col };
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z(])/)
    .map(s => s.trim())
    .filter(Boolean);
}

function checkFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  const stripped = stripCodeAndFront(raw);
  const violations = [];

  // ── no-em-dashes ─────────────────────────────────────────
  const emDashRe = /(—|&mdash;)/g;
  let m;
  while ((m = emDashRe.exec(stripped)) !== null) {
    const { line, col } = findLineCol(stripped, m.index);
    violations.push({
      ruleId: "no-em-dashes",
      level: "block",
      detail: `em-dash on line ${line} col ${col}`,
    });
  }

  // ── no-forbidden-words ───────────────────────────────────
  // Two-mode match. Single-token entries ("very", "leverage") use a
  // regex word boundary so we don't false-positive on "every",
  // "leveraging-by", etc. Multi-word phrases ("relentless focus", "in
  // today's fast-paced", "AI-powered") use substring match because the
  // surrounding whitespace already does the boundary work and \b would
  // miss hits straddling punctuation.
  const lower = stripped.toLowerCase();
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  for (const { phrase, category } of FORBIDDEN_FLAT) {
    const needle = phrase.toLowerCase();
    const isSingleToken = !/\s/.test(needle);
    if (isSingleToken) {
      const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`, "gi");
      let m;
      while ((m = re.exec(stripped)) !== null) {
        const { line, col } = findLineCol(stripped, m.index);
        violations.push({
          ruleId: "no-forbidden-words",
          level: "block",
          detail: `"${phrase}" (${category}) on line ${line} col ${col}`,
        });
      }
    } else {
      let idx = 0;
      while ((idx = lower.indexOf(needle, idx)) !== -1) {
        const { line, col } = findLineCol(stripped, idx);
        violations.push({
          ruleId: "no-forbidden-words",
          level: "block",
          detail: `"${phrase}" (${category}) on line ${line} col ${col}`,
        });
        idx += needle.length;
      }
    }
  }

  // ── max-sentence-length ──────────────────────────────────
  const lengthRule = RULES.rules.find(r => r.id === "max-sentence-length");
  if (lengthRule) {
    const sentences = splitSentences(stripped);
    const maxWords = lengthRule.params?.max_words ?? 25;
    const maxPercent = lengthRule.params?.max_percent_over ?? 30;
    const over = sentences.filter(s => s.split(/\s+/).length > maxWords);
    const ratio = sentences.length === 0 ? 0 : (over.length / sentences.length) * 100;
    if (ratio > maxPercent) {
      violations.push({
        ruleId: "max-sentence-length",
        level: "warn",
        detail: `${Math.round(ratio)}% of sentences over ${maxWords} words (limit ${maxPercent}%)`,
      });
    }
  }

  // ── no-three-adjective-stacks ────────────────────────────
  // Heuristic — looks for three or more comma-separated adjectives
  // ending in a noun. Catches the textbook "innovative, robust, and
  // seamless solution" stack without trying to do real NLP.
  const adjStackRe =
    /\b(\w+ly)?\s*\w+,\s+\w+,\s+(and\s+)?\w+\s+(?=\w+)/gi;
  // Looser regex: three adjective-like tokens separated by commas before
  // a noun-like token. Tunable as the false-positive rate becomes clear.
  const stackHits = stripped.match(/\b\w+,\s+\w+,\s+(?:and\s+)?\w+\b/gi) ?? [];
  // Filter to ones with adjective endings to reduce noise.
  const adjEndingRe = /(ive|ic|ous|able|less|ful|ent|ant|al|ed|ing|ling)$/i;
  const stackViolations = stackHits.filter(s => {
    const parts = s.split(/,\s*(?:and\s+)?/);
    return (
      parts.length >= 3 &&
      parts.slice(0, 3).every(p => adjEndingRe.test(p.trim()))
    );
  });
  if (stackViolations.length > 0) {
    violations.push({
      ruleId: "no-three-adjective-stacks",
      level: "warn",
      detail: `${stackViolations.length} likely adjective stack(s): ${stackViolations
        .slice(0, 3)
        .map(s => `"${s.slice(0, 60)}"`)
        .join(", ")}`,
    });
  }

  return { filePath, violations };
}

function report(results) {
  let blockCount = 0;
  let warnCount = 0;
  for (const { filePath, violations } of results) {
    const blocks = violations.filter(v => v.level === "block");
    const warns = violations.filter(v => v.level === "warn");
    blockCount += blocks.length;
    warnCount += warns.length;

    console.log(`\n${filePath}`);
    if (violations.length === 0) {
      console.log("  ✓ clean");
      continue;
    }
    for (const v of blocks) {
      console.log(`  ✗ ${v.ruleId.padEnd(28)} ${v.detail}`);
    }
    for (const v of warns) {
      console.log(`  ⚠ ${v.ruleId.padEnd(28)} ${v.detail}`);
    }
  }
  const status = blockCount === 0 ? "PASSED" : "FAILED";
  console.log(
    `\n${results.length} file${results.length === 1 ? "" : "s"} checked, ${blockCount} block violation${
      blockCount === 1 ? "" : "s"
    }, ${warnCount} warning${warnCount === 1 ? "" : "s"}. ${status}.\n`,
  );
  return blockCount === 0 ? 0 : 1;
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("usage: node foundrkit-lint.mjs <file> [<file> ...]");
  process.exit(2);
}

const results = targets.map(t => checkFile(resolve(process.cwd(), t)));
process.exit(report(results));
