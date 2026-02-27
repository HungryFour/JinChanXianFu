use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StockQuote {
    pub symbol: String,
    pub name: String,
    pub price: f64,
    pub change: f64,
    pub change_percent: f64,
    pub volume: f64,
    pub high: f64,
    pub low: f64,
    pub open: f64,
    pub prev_close: f64,
    pub turnover: f64,
    pub volume_ratio: f64,
    pub pe_ratio: f64,
    pub market_cap: f64,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StockSearchResult {
    pub symbol: String,
    pub name: String,
    pub market: String,
}

/// 根据股票代码推断市场代码: 6开头→1(沪), 0/3开头→0(深)
pub fn get_market_code(symbol: &str) -> &str {
    match symbol.chars().next() {
        Some('6') => "1",
        Some('0') | Some('3') => "0",
        _ => "1",
    }
}

/// 获取单股实时行情
pub async fn fetch_stock_quote(symbol: &str) -> Result<StockQuote, String> {
    let market = get_market_code(symbol);
    let url = format!(
        "https://push2.eastmoney.com/api/qt/stock/get?secid={}.{}&fields=f43,f44,f45,f46,f47,f48,f50,f57,f58,f60,f116,f170&fltt=2&invt=2",
        market, symbol
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .header("Referer", "https://quote.eastmoney.com/")
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let json: serde_json::Value = resp.json().await.map_err(|e| format!("解析失败: {}", e))?;

    let data = json.get("data").ok_or("返回数据为空")?;

    let price = data["f43"].as_f64().unwrap_or(0.0);
    let prev_close = data["f60"].as_f64().unwrap_or(0.0);
    let change = price - prev_close;
    let change_percent = if prev_close > 0.0 {
        (change / prev_close) * 100.0
    } else {
        data["f170"].as_f64().unwrap_or(0.0)
    };

    Ok(StockQuote {
        symbol: data["f57"].as_str().unwrap_or(symbol).to_string(),
        name: data["f58"].as_str().unwrap_or("").to_string(),
        price,
        change,
        change_percent,
        volume: data["f47"].as_f64().unwrap_or(0.0),
        high: data["f44"].as_f64().unwrap_or(0.0),
        low: data["f45"].as_f64().unwrap_or(0.0),
        open: data["f46"].as_f64().unwrap_or(0.0),
        prev_close,
        turnover: data["f48"].as_f64().unwrap_or(0.0),
        volume_ratio: data["f50"].as_f64().unwrap_or(0.0),
        pe_ratio: 0.0, // 需要额外字段
        market_cap: data["f116"].as_f64().unwrap_or(0.0),
        timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

/// 搜索股票
pub async fn search_stocks(keyword: &str) -> Result<Vec<StockSearchResult>, String> {
    let url = format!(
        "https://searchapi.eastmoney.com/api/suggest/get?input={}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=10",
        keyword
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .send()
        .await
        .map_err(|e| format!("搜索失败: {}", e))?;

    let json: serde_json::Value = resp.json().await.map_err(|e| format!("解析失败: {}", e))?;

    let mut results = Vec::new();

    if let Some(quote_list) = json["QuotationCodeTable"]["Data"].as_array() {
        for item in quote_list {
            let code = item["Code"].as_str().unwrap_or("");
            let name = item["Name"].as_str().unwrap_or("");
            let market_id = item["MktNum"].as_str().unwrap_or("");

            // 只保留A股（沪深）
            if market_id == "01" || market_id == "02" {
                let market = if market_id == "01" { "沪" } else { "深" };
                results.push(StockSearchResult {
                    symbol: code.to_string(),
                    name: name.to_string(),
                    market: market.to_string(),
                });
            }
        }
    }

    Ok(results)
}

/// 批量获取行情
pub async fn fetch_batch_quotes(symbols: &[String]) -> Result<Vec<StockQuote>, String> {
    let mut quotes = Vec::new();
    for symbol in symbols {
        match fetch_stock_quote(symbol).await {
            Ok(q) => quotes.push(q),
            Err(e) => {
                eprintln!("获取 {} 行情失败: {}", symbol, e);
            }
        }
    }
    Ok(quotes)
}

/// 获取涨停/跌停股票列表
pub async fn fetch_limit_stocks(limit_type: &str) -> Result<Vec<StockQuote>, String> {
    // 涨跌停列表：按涨跌幅排序
    let (sort_field, sort_order) = match limit_type {
        "up" => ("f3", "1"),   // 涨幅降序
        "down" => ("f3", "0"), // 涨幅升序
        _ => return Err("无效的类型，请使用 up 或 down".to_string()),
    };

    let url = format!(
        "https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=50&po={}&np=1&fltt=2&invt=2&fields=f2,f3,f4,f5,f6,f7,f12,f14,f15,f16,f17,f18&fid={}&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
        sort_order, sort_field
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .header("Referer", "https://quote.eastmoney.com/")
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let json: serde_json::Value = resp.json().await.map_err(|e| format!("解析失败: {}", e))?;

    let mut results = Vec::new();

    if let Some(diff) = json["data"]["diff"].as_array() {
        for item in diff {
            let change_pct = item["f3"].as_f64().unwrap_or(0.0);

            // 涨停：涨幅 >= 9.9%（科创板/创业板 >= 19.9%）
            // 跌停：跌幅 <= -9.9%（科创板/创业板 <= -19.9%）
            let symbol = item["f12"].as_str().unwrap_or("");
            let is_kcb_cyb = symbol.starts_with("30") || symbol.starts_with("68");
            let threshold = if is_kcb_cyb { 19.9 } else { 9.9 };

            let include = match limit_type {
                "up" => change_pct >= threshold,
                "down" => change_pct <= -threshold,
                _ => false,
            };

            if include {
                results.push(StockQuote {
                    symbol: symbol.to_string(),
                    name: item["f14"].as_str().unwrap_or("").to_string(),
                    price: item["f2"].as_f64().unwrap_or(0.0),
                    change: item["f4"].as_f64().unwrap_or(0.0),
                    change_percent: change_pct,
                    volume: item["f5"].as_f64().unwrap_or(0.0),
                    high: item["f15"].as_f64().unwrap_or(0.0),
                    low: item["f16"].as_f64().unwrap_or(0.0),
                    open: item["f17"].as_f64().unwrap_or(0.0),
                    prev_close: item["f18"].as_f64().unwrap_or(0.0),
                    turnover: item["f6"].as_f64().unwrap_or(0.0),
                    volume_ratio: item["f7"].as_f64().unwrap_or(0.0),
                    pe_ratio: 0.0,
                    market_cap: 0.0,
                    timestamp: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                });
            }
        }
    }

    Ok(results)
}
