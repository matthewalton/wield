/**
 * Parse the scanner's info-metric exposition text back into series. The
 * renderer's output is the wire-compatibility contract with the CI leg
 * (decisions/0001), so the push delivers exactly what it prints — labels,
 * escaping, and ordering included — rather than re-deriving series from the
 * metadata map and drifting.
 */

export interface Series {
  name: string;
  labels: [string, string][];
  value: number;
}

/** Inverse of the renderer's escaping: \\ → \, \" → ", \n → newline. */
function readQuoted(line: string, start: number): { value: string; end: number } {
  let value = "";
  let i = start;
  while (i < line.length && line[i] !== '"') {
    if (line[i] === "\\") {
      const next = line[i + 1];
      value += next === "n" ? "\n" : (next ?? "");
      i += 2;
    } else {
      value += line[i]!;
      i += 1;
    }
  }
  if (line[i] !== '"') throw new Error(`unterminated label value in: ${line}`);
  return { value, end: i + 1 };
}

function parseLine(line: string): Series {
  const brace = line.indexOf("{");
  if (brace === -1) throw new Error(`series without labels in: ${line}`);
  const name = line.slice(0, brace);

  const labels: [string, string][] = [];
  let i = brace + 1;
  while (line[i] !== "}") {
    if (line[i] === ",") i += 1;
    const eq = line.indexOf("=", i);
    if (eq === -1 || line[eq + 1] !== '"') throw new Error(`malformed label in: ${line}`);
    const labelName = line.slice(i, eq);
    const { value, end } = readQuoted(line, eq + 2);
    labels.push([labelName, value]);
    i = end;
  }

  const value = Number(line.slice(i + 1).trim());
  if (Number.isNaN(value)) throw new Error(`unreadable sample value in: ${line}`);
  return { name, labels, value };
}

export function parseExposition(text: string): Series[] {
  return text
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map(parseLine);
}
