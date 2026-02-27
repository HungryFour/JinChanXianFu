use crate::services::market::get_market_code;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KlineBar {
    pub date: String,
    pub open: f64,
    pub close: f64,
    pub high: f64,
    pub low: f64,
    pub volume: f64,
    pub amount: f64,
}

struct KlineCache {
    bars: Vec<KlineBar>,
    fetched_at: Instant,
}

static CACHE: once_cell::sync::Lazy<Mutex<HashMap<String, KlineCache>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

const CACHE_TTL_SECS: u64 = 300; // 5 分钟
const MAX_CACHE_ENTRIES: usize = 100;

/// 获取日 K 线数据（带 5 分钟内存缓存）
pub async fn fetch_daily_klines(symbol: &str, limit: usize) -> Result<Vec<KlineBar>, String> {
    let cache_key = format!("{}_{}", symbol, limit);

    // 检查缓存
    {
        let cache = CACHE.lock().map_err(|e| e.to_string())?;
        if let Some(entry) = cache.get(&cache_key) {
            if entry.fetched_at.elapsed().as_secs() < CACHE_TTL_SECS {
                return Ok(entry.bars.clone());
            }
        }
    }

    // 缓存未命中，请求东方财富 API
    let market = get_market_code(symbol);
    let url = format!(
        "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid={}.{}&klt=101&fqt=1&end=20500101&lmt={}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57",
        market, symbol, limit
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0")
        .header("Referer", "https://quote.eastmoney.com/")
        .send()
        .await
        .map_err(|e| format!("K线请求失败: {}", e))?;

    let json: serde_json::Value = resp.json().await.map_err(|e| format!("K线解析失败: {}", e))?;

    let klines = json["data"]["klines"]
        .as_array()
        .ok_or("K线数据为空")?;

    let bars: Vec<KlineBar> = klines
        .iter()
        .filter_map(|v| {
            let line = v.as_str()?;
            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() < 7 {
                return None;
            }
            Some(KlineBar {
                date: parts[0].to_string(),
                open: parts[1].parse().unwrap_or(0.0),
                close: parts[2].parse().unwrap_or(0.0),
                high: parts[3].parse().unwrap_or(0.0),
                low: parts[4].parse().unwrap_or(0.0),
                volume: parts[5].parse().unwrap_or(0.0),
                amount: parts[6].parse().unwrap_or(0.0),
            })
        })
        .collect();

    // 写入缓存（LRU 淘汰）
    {
        let mut cache = CACHE.lock().map_err(|e| e.to_string())?;
        if cache.len() >= MAX_CACHE_ENTRIES && !cache.contains_key(&cache_key) {
            // 淘汰最旧的
            if let Some(oldest_key) = cache
                .iter()
                .min_by_key(|(_, v)| v.fetched_at)
                .map(|(k, _)| k.clone())
            {
                cache.remove(&oldest_key);
            }
        }
        cache.insert(
            cache_key,
            KlineCache {
                bars: bars.clone(),
                fetched_at: Instant::now(),
            },
        );
    }

    Ok(bars)
}
