/** Find All Valid Math Expressions — Backtracking with precedence tracking */
export function findAllValidMathExpressions(data: [string, number]): string[] {
  const [digits, target] = data;
  const results: string[] = [];

  function bt(pos: number, expr: string, value: number, last: number): void {
    if (pos === digits.length) {
      if (value === target) results.push(expr);
      return;
    }
    for (let end = pos; end < digits.length; end++) {
      const seg = digits.substring(pos, end + 1);
      if (seg.length > 1 && seg[0] === "0") break;
      const num = Number(seg);
      if (pos === 0) {
        bt(end + 1, seg, num, num);
      } else {
        bt(end + 1, expr + "+" + seg, value + num, num);
        bt(end + 1, expr + "-" + seg, value - num, -num);
        bt(end + 1, expr + "*" + seg, value - last + last * num, last * num);
      }
    }
  }

  bt(0, "", 0, 0);
  return results;
}
