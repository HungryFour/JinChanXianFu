use crate::services::market;

#[tauri::command]
pub async fn cmd_fetch_stock_quote(symbol: String) -> Result<market::StockQuote, String> {
    market::fetch_stock_quote(&symbol).await
}

#[tauri::command]
pub async fn cmd_search_stocks(keyword: String) -> Result<Vec<market::StockSearchResult>, String> {
    market::search_stocks(&keyword).await
}

#[tauri::command]
pub async fn cmd_fetch_batch_quotes(symbols: Vec<String>) -> Result<Vec<market::StockQuote>, String> {
    market::fetch_batch_quotes(&symbols).await
}

#[tauri::command]
pub async fn cmd_fetch_limit_stocks(limit_type: String) -> Result<Vec<market::StockQuote>, String> {
    market::fetch_limit_stocks(&limit_type).await
}
