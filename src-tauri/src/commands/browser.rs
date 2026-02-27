use base64::Engine;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{Manager, Url, WebviewUrl, webview::WebviewBuilder};

/// 零 IPC 桥接脚本 — 涟漪动画 + 坐标操作 + 拦截 target="_blank"
/// 使用 DOMContentLoaded 确保 DOM 就绪，并用 try-catch 保护
const BRIDGE_JS: &str = r#"
(function() {
  // 等待 DOM 就绪
  function init() {
    if (window.__JC__) return;

    // 注入涟漪动画 CSS（安全）
    try {
      var style = document.createElement('style');
      style.textContent = `
        @keyframes __jc_ripple {
          0%   { transform: scale(0); opacity: 0.7; }
          100% { transform: scale(1); opacity: 0; }
        }
        .__jc_ripple {
          position: fixed;
          width: 40px; height: 40px;
          border-radius: 50%;
          background: rgba(255, 215, 0, 0.4);
          pointer-events: none;
          z-index: 2147483647;
          animation: __jc_ripple 0.5s ease-out forwards;
        }
      `;
      if (document.head) {
        document.head.appendChild(style);
      } else if (document.documentElement) {
        document.documentElement.appendChild(style);
      } else {
        document.addEventListener('DOMContentLoaded', function() {
          if (document.head) document.head.appendChild(style);
        });
      }
    } catch (e) {
      console.error('[__JC__] Style injection failed:', e);
    }

    // 核心 API
    window.__JC__ = {
      showRipple: function(x, y) {
        try {
          var el = document.createElement('div');
          el.className = '__jc_ripple';
          el.style.left = (x - 20) + 'px';
          el.style.top = (y - 20) + 'px';
          document.body.appendChild(el);
          setTimeout(function() { el.remove(); }, 600);
        } catch (e) {
          console.error('[__JC__] showRipple failed:', e);
        }
      },

      clickAt: function(x, y) {
        try {
          this.showRipple(x, y);
          var target = document.elementFromPoint(x, y);
          if (target) {
            target.click();
          }
        } catch (e) {
          console.error('[__JC__] clickAt failed:', e);
        }
      },

      typeAt: function(x, y, text) {
        try {
          this.showRipple(x, y);
          var target = document.elementFromPoint(x, y);
          if (!target) return;
          target.focus();
          if ('value' in target) {
            target.value = '';
            target.dispatchEvent(new Event('input', { bubbles: true }));
          }
          for (var i = 0; i < text.length; i++) {
            if ('value' in target) {
              target.value += text[i];
            }
            target.dispatchEvent(new Event('input', { bubbles: true }));
          }
          target.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) {
          console.error('[__JC__] typeAt failed:', e);
        }
      },

      scrollPage: function(direction, amount) {
        try {
          var px = (amount || 3) * 100;
          switch (direction) {
            case 'up':    window.scrollBy(0, -px); break;
            case 'down':  window.scrollBy(0, px); break;
            case 'left':  window.scrollBy(-px, 0); break;
            case 'right': window.scrollBy(px, 0); break;
          }
        } catch (e) {
          console.error('[__JC__] scrollPage failed:', e);
        }
      }
    };

    console.log('[__JC__] Bridge initialized');
  }

  // DOM 已就绪
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 拦截所有 target="_blank" 链接，改为当前窗口打开
  // （capture 阶段，在其他处理之前）
  document.addEventListener('click', function(e) {
    var target = e.target;
    while (target && target !== document) {
      if (target.tagName === 'A' && target.target === '_blank') {
        e.preventDefault();
        e.stopPropagation();
        // 移除 target 属性后点击
        var oldTarget = target.target;
        target.target = '_self';
        target.click();
        target.target = oldTarget;
        return false;
      }
      target = target.parentElement;
    }
  }, true); // capture phase
})();
"#;

/// webview 引用 + 当前 URL + 位置信息
pub(crate) struct BrowserInner {
    webview: tauri::Webview<tauri::Wry>,
    current_url: String,
    position: (f64, f64, f64, f64), // x, y, w, h 逻辑像素
}

pub struct BrowserState(pub(crate) Mutex<Option<BrowserInner>>);

impl Default for BrowserState {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

#[derive(Serialize)]
pub struct BrowserInfo {
    pub url: String,
    pub is_open: bool,
}

#[tauri::command]
pub async fn cmd_browser_open(
    app: tauri::AppHandle,
    state: tauri::State<'_, BrowserState>,
    url: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    // 已经有 webview，导航到新 URL
    if let Some(inner) = guard.as_mut() {
        inner.current_url = url.clone();
        let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
        inner.webview.navigate(parsed).map_err(|e| e.to_string())?;
        inner.webview
            .set_position(tauri::LogicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        inner.webview
            .set_size(tauri::LogicalSize::new(w, h))
            .map_err(|e| e.to_string())?;
        inner.position = (x, y, w, h);
        return Ok(());
    }

    // 创建新 webview
    let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
    let window = app.get_window("main").ok_or("main window not found")?;

    let builder = WebviewBuilder::new("browser-panel", WebviewUrl::External(parsed))
        .initialization_script(BRIDGE_JS)
        .auto_resize();

    let webview = window
        .add_child(
            builder,
            tauri::LogicalPosition::new(x, y),
            tauri::LogicalSize::new(w, h),
        )
        .map_err(|e| e.to_string())?;

    *guard = Some(BrowserInner {
        webview,
        current_url: url,
        position: (x, y, w, h),
    });

    Ok(())
}

#[tauri::command]
pub async fn cmd_browser_navigate(
    state: tauri::State<'_, BrowserState>,
    url: String,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let inner = guard.as_mut().ok_or("浏览器未打开")?;
    let parsed = Url::parse(&url).map_err(|e| e.to_string())?;
    inner.webview.navigate(parsed).map_err(|e| e.to_string())?;
    inner.current_url = url;
    Ok(())
}

/// fire-and-forget 执行 JS，不等待返回值
#[tauri::command]
pub async fn cmd_browser_exec_js(
    state: tauri::State<'_, BrowserState>,
    js: String,
) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let inner = guard.as_ref().ok_or("浏览器未打开")?;
    inner.webview.eval(&js).map_err(|e| e.to_string())?;
    Ok(())
}

/// 截取浏览器面板区域，返回 base64 JPEG
#[tauri::command]
pub async fn cmd_browser_screenshot(
    app: tauri::AppHandle,
    state: tauri::State<'_, BrowserState>,
) -> Result<String, String> {
    let (pos_x, pos_y, pos_w, pos_h) = {
        let guard = state.0.lock().map_err(|e| e.to_string())?;
        let inner = guard.as_ref().ok_or("浏览器未打开")?;
        inner.position
    };

    if pos_w < 1.0 || pos_h < 1.0 {
        return Err("浏览器面板尺寸无效".to_string());
    }

    // 获取缩放比
    let window = app.get_window("main").ok_or("main window not found")?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;

    // 通过 xcap 找到 "金蟾" 窗口并截图
    let windows = xcap::Window::all().map_err(|e| format!("枚举窗口失败: {}", e))?;
    let target = windows
        .into_iter()
        .find(|w| {
            let title = w.title().unwrap_or_default();
            title.contains("金蟾") || title.contains("JinChan")
        })
        .ok_or("未找到金蟾窗口")?;

    let full_image = target
        .capture_image()
        .map_err(|e| format!("截图失败: {}", e))?;

    let img_w = full_image.width();
    let img_h = full_image.height();

    // 逻辑坐标 × scale → 物理像素裁剪（clamp 防越界）
    let crop_x = ((pos_x * scale).round() as u32).min(img_w.saturating_sub(1));
    let crop_y = ((pos_y * scale).round() as u32).min(img_h.saturating_sub(1));
    let crop_w = ((pos_w * scale).round() as u32).min(img_w - crop_x);
    let crop_h = ((pos_h * scale).round() as u32).min(img_h - crop_y);

    if crop_w == 0 || crop_h == 0 {
        return Err("裁剪区域为空".to_string());
    }

    let img = image::DynamicImage::from(full_image);
    let cropped = img.crop_imm(crop_x, crop_y, crop_w, crop_h);

    // resize 回逻辑尺寸（AI 坐标 = CSS 坐标 = clickAt 坐标）
    let logical_w = pos_w.round() as u32;
    let logical_h = pos_h.round() as u32;
    let resized = cropped.resize_exact(
        logical_w,
        logical_h,
        image::imageops::FilterType::Lanczos3,
    );

    // RGBA → RGB（JPEG 不支持 alpha）
    let rgb = resized.to_rgb8();

    // 编码 JPEG quality=80
    let mut buf = Vec::new();
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
        std::io::Cursor::new(&mut buf),
        80,
    );
    rgb.write_with_encoder(encoder)
        .map_err(|e| format!("JPEG 编码失败: {}", e))?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

#[tauri::command]
pub async fn cmd_browser_close(
    state: tauri::State<'_, BrowserState>,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(inner) = guard.take() {
        let _ = inner.webview.close();
    }
    Ok(())
}

#[tauri::command]
pub async fn cmd_browser_resize(
    state: tauri::State<'_, BrowserState>,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let inner = guard.as_mut().ok_or("浏览器未打开")?;
    inner.webview
        .set_position(tauri::LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    inner.webview
        .set_size(tauri::LogicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    inner.position = (x, y, w, h);
    Ok(())
}

#[tauri::command]
pub async fn cmd_browser_get_info(
    state: tauri::State<'_, BrowserState>,
) -> Result<BrowserInfo, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    match guard.as_ref() {
        Some(inner) => Ok(BrowserInfo {
            url: inner.current_url.clone(),
            is_open: true,
        }),
        None => Ok(BrowserInfo {
            url: String::new(),
            is_open: false,
        }),
    }
}
