export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  timestamp: string;
}

export interface WatchlistItem {
  symbol: string;
  name: string | null;
  exchange: string | null;
  added_at: string;
}
