// Argument parsing for the tier2 harnesses.
//
// A boolean flag takes no value. The naive "next token is the value" rule misreads a trailing flag as an
// empty string (false, so the feature silently never runs) and `--flag false` as truthy (so it silently
// always runs). Boolean flags are therefore listed explicitly, and an explicit value is rejected instead
// of being interpreted: the caller wrote something the harness cannot honour.
export function parseArgs(tokens, booleanFlags = new Set()) {
  const args = {};
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    const next = tokens[index + 1];
    if (booleanFlags.has(name)) {
      if (next !== undefined && !next.startsWith('--')) {
        throw new Error(`--${name} is a flag and takes no value; got "${next}"`);
      }
      args[name] = true;
      continue;
    }
    args[name] = next ?? '';
    if (next !== undefined) index++;
  }
  return args;
}
