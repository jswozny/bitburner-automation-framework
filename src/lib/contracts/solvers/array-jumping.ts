/** Array Jumping Game — Greedy reachability, returns 0|1 */
export function arrayJumpingGame(arr: number[]): number {
  let reach = 0;
  for (let i = 0; i < arr.length && i <= reach; i++) {
    reach = Math.max(reach, i + arr[i]);
    if (reach >= arr.length - 1) return 1;
  }
  return 0;
}

/** Array Jumping Game II — BFS min jumps (0 if impossible) */
export function arrayJumpingGameII(arr: number[]): number {
  if (arr.length <= 1) return 0;
  let jumps = 0;
  let curEnd = 0;
  let farthest = 0;
  for (let i = 0; i < arr.length - 1; i++) {
    farthest = Math.max(farthest, i + arr[i]);
    if (i === curEnd) {
      jumps++;
      curEnd = farthest;
      if (curEnd >= arr.length - 1) return jumps;
    }
  }
  return 0;
}
