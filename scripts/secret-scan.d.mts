export const FORBIDDEN_FILES: RegExp[];
export const SECRET_PATTERNS: { name: string; re: RegExp }[];
export function scanFile(path: string, text: string): string[];
