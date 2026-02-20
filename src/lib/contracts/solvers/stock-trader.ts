/** Algorithmic Stock Trader I — Track min price, max profit */
export function stockTraderI(prices: number[]): number {
  let minPrice = Infinity;
  let maxProfit = 0;
  for (const p of prices) {
    minPrice = Math.min(minPrice, p);
    maxProfit = Math.max(maxProfit, p - minPrice);
  }
  return maxProfit;
}

/** Algorithmic Stock Trader II — Sum positive deltas */
export function stockTraderII(prices: number[]): number {
  let profit = 0;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > prices[i - 1]) profit += prices[i] - prices[i - 1];
  }
  return profit;
}

/** Algorithmic Stock Trader III — k=2 transaction DP */
export function stockTraderIII(prices: number[]): number {
  return stockTraderK([2, prices]);
}

/** Algorithmic Stock Trader IV — General k-transaction DP */
export function stockTraderK(data: [number, number[]]): number {
  const [k, prices] = data;
  if (prices.length < 2) return 0;

  if (k >= Math.floor(prices.length / 2)) {
    return stockTraderII(prices);
  }

  const buy = new Array(k + 1).fill(-Infinity);
  const sell = new Array(k + 1).fill(0);
  for (const price of prices) {
    for (let t = 1; t <= k; t++) {
      buy[t] = Math.max(buy[t], sell[t - 1] - price);
      sell[t] = Math.max(sell[t], buy[t] + price);
    }
  }
  return sell[k];
}
