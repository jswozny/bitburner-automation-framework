/** Shortest Path in a Grid — BFS, return UDLR path string */
export function shortestPathInGrid(grid: number[][]): string {
  const rows = grid.length;
  const cols = grid[0].length;
  if (grid[0][0] === 1 || grid[rows - 1][cols - 1] === 1) return "";

  const dirs = [[-1, 0, "U"], [1, 0, "D"], [0, -1, "L"], [0, 1, "R"]] as const;
  const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const queue: [number, number, string][] = [[0, 0, ""]];
  visited[0][0] = true;

  while (queue.length > 0) {
    const [r, c, path] = queue.shift()!;
    if (r === rows - 1 && c === cols - 1) return path;
    for (const [dr, dc, dir] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc] && grid[nr][nc] === 0) {
        visited[nr][nc] = true;
        queue.push([nr, nc, path + dir]);
      }
    }
  }
  return "";
}
