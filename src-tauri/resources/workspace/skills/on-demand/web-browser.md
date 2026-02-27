---
name: web-browser
description: 内置浏览器自动化（视觉驱动）
keywords: [搜索, 浏览, 打开网页, 登录, 网站, 浏览器, 百度, Google, 网页, 访问, 东方财富, 同花顺, 雪球, 富途, 查看网页, 上网]
tools: [browser_open, browser_navigate, browser_screenshot, browser_click, browser_type, browser_scroll, browser_get_info, browser_close]
---

你可以使用内嵌浏览器访问网页。所有操作基于 **截图 + 坐标**，不依赖 CSS 选择器。

## 核心工作流

1. **打开浏览器**: `browser_open` 打开目标网页
2. **截图查看**: `browser_screenshot` 截取页面 → 你会看到页面截图
3. **分析页面**: 根据截图内容，确定要操作的元素的坐标位置
4. **坐标操作**: `browser_click(x, y)` 点击 / `browser_type(x, y, text)` 输入 / `browser_scroll(direction)` 滚动
5. **再次截图**: 操作后截图验证结果
6. **完成后关闭**: `browser_close`

## 坐标系统

- 截图的像素坐标 = 操作的坐标参数，**零转换**
- 截图左上角为 (0, 0)，x 向右增长，y 向下增长
- 点击/输入时，瞄准元素的**中心位置**

## 注意事项

- 每次操作后都要截图确认结果，形成"截图 → 操作 → 截图"循环
- 页面加载需要时间，打开或导航后等一下再截图
- 滚动可以查看页面更多内容，滚动后截图查看新区域
- 完成任务后记得关闭浏览器
