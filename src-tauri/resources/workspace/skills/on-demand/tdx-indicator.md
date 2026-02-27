---
name: tdx-indicator
description: 通达信公式指标监控
keywords: [TDX, 通达信, 公式, 指标, 选股, DRAWTEXT, 信号, BBI, EMA, MA, SMA, 技术指标, 均线, MACD, KDJ, 金叉, 死叉, 指标公式, 指标监控, 添加指标]
tools: [validate_tdx_formula, add_tdx_indicator, list_tdx_indicators, update_tdx_indicator, delete_tdx_indicator, evaluate_tdx_indicator]
---

## 通达信（TDX）公式指标监控

你可以帮用户将通达信格式的技术指标公式添加到系统中进行自动监控。当公式中的 DRAWTEXT 信号在最新 K 线上触发时，系统会自动提醒。

### 工作流程

1. 用户提供 TDX 公式 → 使用 `validate_tdx_formula` 验证语法
2. 验证通过 → 使用 `add_tdx_indicator` 创建监控（自动绑定当前 task）
3. 系统后台每 60 秒（可配置）检查一次，交易时间内自动计算
4. DRAWTEXT 信号触发 → 自动通知并 AI 分析

### 支持的公式子集

**内置变量**: CLOSE/C, HIGH/H, LOW/L, OPEN/O, VOLUME/V/VOL

**函数**:
- 移动平均: MA(data, period), EMA(data, period), SMA(data, period, weight)
- 引用: REF(data, n)
- 极值: LLV(data, period), HHV(data, period)
- 条件: IF(cond, a, b)
- 交叉: CROSS(a, b)
- 统计: COUNT(cond, period), EVERY(cond, period), EXIST(cond, period)
- 偏差: AVEDEV(data, period), STD(data, period)
- 其他: MAX, MIN, ABS, BARSLAST, SLOPE, INTPART

**运算符**: +, -, *, /, >, <, >=, <=, =, AND, OR, NOT

**赋值**: `:=`（中间变量）, `:`（输出变量）

**信号**: DRAWTEXT(条件, 价格表达式, '文本') — 仅检查最后一根 K 线

**忽略**: COLOR*, LINETHICK*, {} 注释

### 使用规范

- 公式必须包含至少一个 DRAWTEXT 语句才能产生信号
- 验证失败时，根据错误信息（含行列号）帮用户修复
- 创建指标时必须指定股票代码列表
- 可用 `evaluate_tdx_indicator` 立即测试公式效果

### 常见公式示例

**BBI 多空指标金叉**:
```
MA3 := MA(CLOSE, 3);
MA6 := MA(CLOSE, 6);
MA12 := MA(CLOSE, 12);
MA24 := MA(CLOSE, 24);
BBI := (MA3 + MA6 + MA12 + MA24) / 4;
DRAWTEXT(CLOSE > BBI AND REF(CLOSE, 1) < REF(BBI, 1), LOW, '金叉买入');
```

**均线多头排列**:
```
MA5 := MA(CLOSE, 5);
MA10 := MA(CLOSE, 10);
MA20 := MA(CLOSE, 20);
DRAWTEXT(MA5 > MA10 AND MA10 > MA20 AND REF(MA5, 1) <= REF(MA10, 1), LOW, '多头排列');
```
