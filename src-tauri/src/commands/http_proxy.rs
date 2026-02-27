use std::collections::HashMap;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct HttpRequestParams {
    pub method: String,
    pub url: String,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<serde_json::Value>,
    pub timeout_secs: Option<u64>,
}

#[derive(Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

fn is_blocked_url(url: &str) -> bool {
    let lower = url.to_lowercase();

    // 禁止 file:// 协议
    if lower.starts_with("file://") {
        return true;
    }

    // 解析 host
    let host = if let Some(rest) = lower.strip_prefix("http://") {
        rest.split('/').next().unwrap_or("")
    } else if let Some(rest) = lower.strip_prefix("https://") {
        rest.split('/').next().unwrap_or("")
    } else {
        return true; // 不支持的协议
    };

    // 去掉端口号
    let host_no_port = host.split(':').next().unwrap_or(host);

    // 禁止 localhost
    if host_no_port == "localhost" || host_no_port == "127.0.0.1" || host_no_port == "::1" {
        return true;
    }

    // 禁止内网 IP 段
    if host_no_port.starts_with("10.")
        || host_no_port.starts_with("192.168.")
        || host_no_port.starts_with("0.")
    {
        return true;
    }
    // 172.16.0.0 - 172.31.255.255
    if host_no_port.starts_with("172.") {
        if let Some(second) = host_no_port.split('.').nth(1) {
            if let Ok(n) = second.parse::<u8>() {
                if (16..=31).contains(&n) {
                    return true;
                }
            }
        }
    }

    false
}

#[tauri::command]
pub async fn cmd_http_request(params: HttpRequestParams) -> Result<HttpResponse, String> {
    // 安全检查
    if is_blocked_url(&params.url) {
        return Err("安全限制：不允许访问本地或内网地址".to_string());
    }

    let timeout = Duration::from_secs(params.timeout_secs.unwrap_or(30));
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let method = params.method.to_uppercase();
    let mut builder = match method.as_str() {
        "GET" => client.get(&params.url),
        "POST" => client.post(&params.url),
        "PUT" => client.put(&params.url),
        "DELETE" => client.delete(&params.url),
        "PATCH" => client.patch(&params.url),
        _ => return Err(format!("不支持的 HTTP 方法: {}", method)),
    };

    // 设置自定义请求头
    if let Some(headers) = &params.headers {
        let mut header_map = HeaderMap::new();
        for (key, value) in headers {
            let name = HeaderName::from_bytes(key.as_bytes())
                .map_err(|e| format!("无效的请求头名: {}", e))?;
            let val = HeaderValue::from_str(value)
                .map_err(|e| format!("无效的请求头值: {}", e))?;
            header_map.insert(name, val);
        }
        builder = builder.headers(header_map);
    }

    // 设置请求体
    if let Some(body) = &params.body {
        builder = builder.json(body);
    }

    let response = builder
        .send()
        .await
        .map_err(|e| format!("HTTP 请求失败: {}", e))?;

    let status = response.status().as_u16();

    let mut resp_headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(v) = value.to_str() {
            resp_headers.insert(key.to_string(), v.to_string());
        }
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("读取响应体失败: {}", e))?;

    Ok(HttpResponse {
        status,
        body,
        headers: resp_headers,
    })
}
