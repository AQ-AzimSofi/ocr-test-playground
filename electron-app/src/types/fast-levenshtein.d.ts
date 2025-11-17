declare module 'fast-levenshtein' {
  export function get(str1: string, str2: string, options?: { useCollator?: boolean }): number;
}
