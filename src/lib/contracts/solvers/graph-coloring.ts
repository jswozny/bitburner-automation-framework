/** Proper 2-Coloring of a Graph — BFS bipartite check */
export function proper2Coloring(data: [number, number[][]]): number[] {
  const [n, edges] = data;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) {
    adj[u].push(v);
    adj[v].push(u);
  }

  const colors = new Array(n).fill(-1);
  for (let start = 0; start < n; start++) {
    if (colors[start] !== -1) continue;
    colors[start] = 0;
    const queue = [start];
    while (queue.length > 0) {
      const node = queue.shift()!;
      for (const neighbor of adj[node]) {
        if (colors[neighbor] === -1) {
          colors[neighbor] = 1 - colors[node];
          queue.push(neighbor);
        } else if (colors[neighbor] === colors[node]) {
          return [];
        }
      }
    }
  }
  return colors;
}
