// Types for the tier2 argument parser, which the unit tests import directly.
export function parseArgs(tokens: string[], booleanFlags?: ReadonlySet<string>): Record<string, string | true>;
