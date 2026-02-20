/** Sanitize Parentheses in Expression — BFS remove parens level by level */
export function sanitizeParentheses(s: string): string[] {
  let queue = [s];
  const visited = new Set<string>([s]);

  while (queue.length > 0) {
    const valid = queue.filter(isValidParens);
    if (valid.length > 0) return valid;

    const next: string[] = [];
    for (const str of queue) {
      for (let i = 0; i < str.length; i++) {
        if (str[i] !== "(" && str[i] !== ")") continue;
        const candidate = str.slice(0, i) + str.slice(i + 1);
        if (!visited.has(candidate)) {
          visited.add(candidate);
          next.push(candidate);
        }
      }
    }
    queue = next;
  }
  return [""];
}

function isValidParens(s: string): boolean {
  let count = 0;
  for (const ch of s) {
    if (ch === "(") count++;
    else if (ch === ")") count--;
    if (count < 0) return false;
  }
  return count === 0;
}
