// Argument parsing for the tier2 harnesses.
//
// A boolean flag takes no value. The naive "next token is the value" rule misreads a trailing flag as an
// empty string (false, so the feature silently never runs) and `--flag false` as truthy (so it silently
// always runs). Boolean flags are therefore listed explicitly, and an explicit value is rejected instead
// of being interpreted: the caller wrote something the harness cannot honour.
//
// Two inputs are refused rather than resolved, because both would silently run a different experiment:
//   - `--flag=false` writes a value to a flag, which is neither on nor off under this rule.
//   - `--hour --screenshots` makes the following flag the value, so the option is wrong *and* the flag
//     disappears; a value option followed by another option is a mistake in the command, not a default.
export function parseArgs(tokens, booleanFlags = new Set()) {
  const args = {};
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token.startsWith('--')) continue;
    const equals = token.indexOf('=');
    const name = equals === -1 ? token.slice(2) : token.slice(2, equals);
    const inline = equals === -1 ? undefined : token.slice(equals + 1);
    if (booleanFlags.has(name)) {
      if (inline !== undefined) {
        throw new Error(`--${name} is a flag and takes no value; got "${inline}"`);
      }
      const next = tokens[index + 1];
      if (next !== undefined && !next.startsWith('--')) {
        throw new Error(`--${name} is a flag and takes no value; got "${next}"`);
      }
      args[name] = true;
      continue;
    }
    if (inline !== undefined) {
      if (inline === '') throw new Error(`--${name} needs a value`);
      args[name] = inline;
      continue;
    }
    const next = tokens[index + 1];
    if (next === undefined) throw new Error(`--${name} needs a value`);
    if (next.startsWith('--')) throw new Error(`--${name} needs a value; got the option "${next}"`);
    args[name] = next;
    index++;
  }
  return args;
}
