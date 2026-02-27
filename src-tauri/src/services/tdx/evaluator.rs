/// TDX 公式求值引擎
///
/// 所有变量都是 Series（Vec<f64>，每根 K 线一个值）
/// DRAWTEXT 仅检查最后一根 K 线上条件是否为 true（值 > 0.5）

use super::parser::{BinOp, Expr, Statement, UnOp};
use crate::services::kline::KlineBar;
use std::collections::HashMap;

/// Series: 每根 K 线对应一个值
type Series = Vec<f64>;

/// DRAWTEXT 信号
#[derive(Debug, Clone, serde::Serialize)]
pub struct Signal {
    pub text: String,
    pub triggered: bool,
    pub value: f64, // price_expr 在最后一根 K 线上的值
}

/// 求值结果
#[derive(Debug, Clone, serde::Serialize)]
pub struct EvalResult {
    pub outputs: HashMap<String, Vec<f64>>,
    pub signals: Vec<Signal>,
}

pub struct Evaluator {
    bars: Vec<KlineBar>,
    len: usize,
    vars: HashMap<String, Series>,
}

impl Evaluator {
    pub fn new(bars: Vec<KlineBar>) -> Self {
        let len = bars.len();
        Self {
            bars,
            len,
            vars: HashMap::new(),
        }
    }

    pub fn evaluate(&mut self, stmts: &[Statement]) -> Result<EvalResult, String> {
        if self.len == 0 {
            return Err("K线数据为空".to_string());
        }

        // 预置内置变量
        self.init_builtin_vars();

        let mut outputs: HashMap<String, Vec<f64>> = HashMap::new();
        let mut signals: Vec<Signal> = Vec::new();

        for stmt in stmts {
            match stmt {
                Statement::Assign { name, expr } => {
                    let series = self.eval_expr(expr)?;
                    self.vars.insert(name.clone(), series);
                }
                Statement::Output { name, expr } => {
                    let series = self.eval_expr(expr)?;
                    self.vars.insert(name.clone(), series.clone());
                    outputs.insert(name.clone(), series);
                }
                Statement::DrawText {
                    condition,
                    price_expr,
                    text,
                } => {
                    let cond_series = self.eval_expr(condition)?;
                    let price_series = self.eval_expr(price_expr)?;

                    let last_cond = *cond_series.last().unwrap_or(&0.0);
                    let last_price = *price_series.last().unwrap_or(&0.0);

                    signals.push(Signal {
                        text: text.clone(),
                        triggered: last_cond > 0.5,
                        value: last_price,
                    });
                }
            }
        }

        Ok(EvalResult { outputs, signals })
    }

    fn init_builtin_vars(&mut self) {
        let close: Series = self.bars.iter().map(|b| b.close).collect();
        let open: Series = self.bars.iter().map(|b| b.open).collect();
        let high: Series = self.bars.iter().map(|b| b.high).collect();
        let low: Series = self.bars.iter().map(|b| b.low).collect();
        let volume: Series = self.bars.iter().map(|b| b.volume).collect();

        self.vars.insert("CLOSE".to_string(), close.clone());
        self.vars.insert("C".to_string(), close);
        self.vars.insert("OPEN".to_string(), open.clone());
        self.vars.insert("O".to_string(), open);
        self.vars.insert("HIGH".to_string(), high.clone());
        self.vars.insert("H".to_string(), high);
        self.vars.insert("LOW".to_string(), low.clone());
        self.vars.insert("L".to_string(), low);
        self.vars.insert("VOLUME".to_string(), volume.clone());
        self.vars.insert("V".to_string(), volume.clone());
        self.vars.insert("VOL".to_string(), volume);
    }

    fn eval_expr(&self, expr: &Expr) -> Result<Series, String> {
        match expr {
            Expr::Number(n) => Ok(vec![*n; self.len]),
            Expr::Str(_) => Ok(vec![0.0; self.len]),
            Expr::Variable(name) => {
                let upper = name.to_uppercase();
                self.vars
                    .get(&upper)
                    .cloned()
                    .ok_or_else(|| format!("未定义的变量: {}", name))
            }
            Expr::BinaryOp { op, left, right } => {
                let l = self.eval_expr(left)?;
                let r = self.eval_expr(right)?;
                self.eval_binary_op(*op, &l, &r)
            }
            Expr::UnaryOp { op, operand } => {
                let s = self.eval_expr(operand)?;
                self.eval_unary_op(*op, &s)
            }
            Expr::FuncCall { name, args } => self.eval_func(name, args),
        }
    }

    fn eval_binary_op(&self, op: BinOp, left: &Series, right: &Series) -> Result<Series, String> {
        let len = self.len;
        let mut result = vec![0.0; len];

        for i in 0..len {
            let l = left.get(i).copied().unwrap_or(0.0);
            let r = right.get(i).copied().unwrap_or(0.0);
            result[i] = match op {
                BinOp::Add => l + r,
                BinOp::Sub => l - r,
                BinOp::Mul => l * r,
                BinOp::Div => {
                    if r.abs() < f64::EPSILON {
                        0.0
                    } else {
                        l / r
                    }
                }
                BinOp::Gt => bool_to_f64(l > r),
                BinOp::Lt => bool_to_f64(l < r),
                BinOp::Ge => bool_to_f64(l >= r),
                BinOp::Le => bool_to_f64(l <= r),
                BinOp::Eq => bool_to_f64((l - r).abs() < f64::EPSILON),
                BinOp::And => bool_to_f64(l > 0.5 && r > 0.5),
                BinOp::Or => bool_to_f64(l > 0.5 || r > 0.5),
            };
        }

        Ok(result)
    }

    fn eval_unary_op(&self, op: UnOp, series: &Series) -> Result<Series, String> {
        Ok(series
            .iter()
            .map(|v| match op {
                UnOp::Neg => -v,
                UnOp::Not => bool_to_f64(*v <= 0.5),
            })
            .collect())
    }

    fn eval_func(&self, name: &str, args: &[Expr]) -> Result<Series, String> {
        let upper = name.to_uppercase();
        match upper.as_str() {
            "MA" => {
                self.check_args(&upper, args, 2)?;
                let data = self.eval_expr(&args[0])?;
                let period = self.eval_const(&args[1])? as usize;
                Ok(calc_ma(&data, period))
            }
            "EMA" => {
                self.check_args(&upper, args, 2)?;
                let data = self.eval_expr(&args[0])?;
                let period = self.eval_const(&args[1])? as usize;
                Ok(calc_ema(&data, period))
            }
            "SMA" => {
                // SMA(data, period, weight)
                self.check_args(&upper, args, 3)?;
                let data = self.eval_expr(&args[0])?;
                let period = self.eval_const(&args[1])? as usize;
                let weight = self.eval_const(&args[2])?;
                Ok(calc_sma(&data, period, weight))
            }
            "REF" => {
                self.check_args(&upper, args, 2)?;
                let data = self.eval_expr(&args[0])?;
                let n = self.eval_const(&args[1])? as usize;
                Ok(calc_ref(&data, n))
            }
            "LLV" => {
                self.check_args(&upper, args, 2)?;
                let data = self.eval_expr(&args[0])?;
                let period = self.eval_const(&args[1])? as usize;
                Ok(calc_llv(&data, period))
            }
            "HHV" => {
                self.check_args(&upper, args, 2)?;
                let data = self.eval_expr(&args[0])?;
                let period = self.eval_const(&args[1])? as usize;
                Ok(calc_hhv(&data, period))
            }
            "IF" => {
                self.check_args(&upper, args, 3)?;
                let cond = self.eval_expr(&args[0])?;
                let a = self.eval_expr(&args[1])?;
                let b = self.eval_expr(&args[2])?;
                Ok(calc_if(&cond, &a, &b))
            }
            "MAX" => {
                self.check_args(&upper, args, 2)?;
                let a = self.eval_expr(&args[0])?;
                let b = self.eval_expr(&args[1])?;
                Ok(a.iter()
                    .zip(b.iter())
                    .map(|(x, y)| x.max(*y))
                    .collect())
            }
            "MIN" => {
                self.check_args(&upper, args, 2)?;
                let a = self.eval_expr(&args[0])?;
                let b = self.eval_expr(&args[1])?;
                Ok(a.iter()
                    .zip(b.iter())
                    .map(|(x, y)| x.min(*y))
                    .collect())
            }
            "ABS" => {
                self.check_args(&upper, args, 1)?;
                let data = self.eval_expr(&args[0])?;
                Ok(data.iter().map(|v| v.abs()).collect())
            }
            "CROSS" => {
                // CROSS(A, B): A 从下方穿越 B
                self.check_args(&upper, args, 2)?;
                let a = self.eval_expr(&args[0])?;
                let b = self.eval_expr(&args[1])?;
                Ok(calc_cross(&a, &b))
            }
            "COUNT" => {
                // COUNT(cond, period): 统计最近 period 根 K 线条件成立次数
                self.check_args(&upper, args, 2)?;
                let cond = self.eval_expr(&args[0])?;
                let period = self.eval_const(&args[1])? as usize;
                Ok(calc_count(&cond, period))
            }
            "EVERY" => {
                // EVERY(cond, period): 最近 period 根全部满足
                self.check_args(&upper, args, 2)?;
                let cond = self.eval_expr(&args[0])?;
                let period = self.eval_const(&args[1])? as usize;
                let count = calc_count(&cond, period);
                Ok(count
                    .iter()
                    .map(|c| bool_to_f64((*c - period as f64).abs() < 0.5))
                    .collect())
            }
            "BARSLAST" => {
                // BARSLAST(cond): 上次条件成立距今的周期数
                self.check_args(&upper, args, 1)?;
                let cond = self.eval_expr(&args[0])?;
                Ok(calc_barslast(&cond))
            }
            "AVEDEV" => {
                // AVEDEV(data, period): 平均绝对偏差
                self.check_args(&upper, args, 2)?;
                let data = self.eval_expr(&args[0])?;
                let period = self.eval_const(&args[1])? as usize;
                Ok(calc_avedev(&data, period))
            }
            "STD" => {
                // STD(data, period): 标准差
                self.check_args(&upper, args, 2)?;
                let data = self.eval_expr(&args[0])?;
                let period = self.eval_const(&args[1])? as usize;
                Ok(calc_std(&data, period))
            }
            "SLOPE" => {
                // SLOPE(data, period): 线性回归斜率
                self.check_args(&upper, args, 2)?;
                let data = self.eval_expr(&args[0])?;
                let period = self.eval_const(&args[1])? as usize;
                Ok(calc_slope(&data, period))
            }
            "EXIST" => {
                // EXIST(cond, period): 是否存在满足条件的 K 线
                self.check_args(&upper, args, 2)?;
                let cond = self.eval_expr(&args[0])?;
                let period = self.eval_const(&args[1])? as usize;
                let count = calc_count(&cond, period);
                Ok(count.iter().map(|c| bool_to_f64(*c > 0.5)).collect())
            }
            "INTPART" => {
                self.check_args(&upper, args, 1)?;
                let data = self.eval_expr(&args[0])?;
                Ok(data.iter().map(|v| v.trunc()).collect())
            }
            _ => Err(format!("不支持的函数: {}", name)),
        }
    }

    fn check_args(&self, name: &str, args: &[Expr], expected: usize) -> Result<(), String> {
        if args.len() != expected {
            return Err(format!(
                "函数 {} 需要 {} 个参数，实际传入 {} 个",
                name,
                expected,
                args.len()
            ));
        }
        Ok(())
    }

    fn eval_const(&self, expr: &Expr) -> Result<f64, String> {
        match expr {
            Expr::Number(n) => Ok(*n),
            _ => {
                // 尝试求值取最后一个值
                let series = self.eval_expr(expr)?;
                Ok(*series.last().unwrap_or(&0.0))
            }
        }
    }
}

// ── 计算函数 ──

fn bool_to_f64(b: bool) -> f64 {
    if b {
        1.0
    } else {
        0.0
    }
}

fn calc_ma(data: &[f64], period: usize) -> Series {
    let len = data.len();
    let mut result = vec![0.0; len];
    if period == 0 {
        return result;
    }

    for i in 0..len {
        if i + 1 < period {
            // 不足 period 根，用已有数据的均值
            let sum: f64 = data[..=i].iter().sum();
            result[i] = sum / (i + 1) as f64;
        } else {
            let sum: f64 = data[i + 1 - period..=i].iter().sum();
            result[i] = sum / period as f64;
        }
    }
    result
}

fn calc_ema(data: &[f64], period: usize) -> Series {
    let len = data.len();
    let mut result = vec![0.0; len];
    if len == 0 || period == 0 {
        return result;
    }

    let k = 2.0 / (period as f64 + 1.0);
    result[0] = data[0];
    for i in 1..len {
        result[i] = data[i] * k + result[i - 1] * (1.0 - k);
    }
    result
}

fn calc_sma(data: &[f64], period: usize, weight: f64) -> Series {
    // 通达信 SMA(X, N, M) = (X * M + SMA' * (N - M)) / N
    let len = data.len();
    let mut result = vec![0.0; len];
    if len == 0 || period == 0 {
        return result;
    }

    result[0] = data[0];
    let n = period as f64;
    for i in 1..len {
        result[i] = (data[i] * weight + result[i - 1] * (n - weight)) / n;
    }
    result
}

fn calc_ref(data: &[f64], n: usize) -> Series {
    let len = data.len();
    let mut result = vec![0.0; len];
    for i in 0..len {
        if i >= n {
            result[i] = data[i - n];
        } else {
            result[i] = data[0]; // 不足时用第一个值
        }
    }
    result
}

fn calc_llv(data: &[f64], period: usize) -> Series {
    let len = data.len();
    let mut result = vec![0.0; len];
    if period == 0 {
        return result;
    }

    for i in 0..len {
        let start = if i + 1 >= period { i + 1 - period } else { 0 };
        result[i] = data[start..=i]
            .iter()
            .cloned()
            .fold(f64::MAX, f64::min);
    }
    result
}

fn calc_hhv(data: &[f64], period: usize) -> Series {
    let len = data.len();
    let mut result = vec![0.0; len];
    if period == 0 {
        return result;
    }

    for i in 0..len {
        let start = if i + 1 >= period { i + 1 - period } else { 0 };
        result[i] = data[start..=i]
            .iter()
            .cloned()
            .fold(f64::MIN, f64::max);
    }
    result
}

fn calc_if(cond: &[f64], a: &[f64], b: &[f64]) -> Series {
    cond.iter()
        .zip(a.iter())
        .zip(b.iter())
        .map(|((c, x), y)| if *c > 0.5 { *x } else { *y })
        .collect()
}

fn calc_cross(a: &[f64], b: &[f64]) -> Series {
    let len = a.len();
    let mut result = vec![0.0; len];
    for i in 1..len {
        if a[i] > b[i] && a[i - 1] <= b[i - 1] {
            result[i] = 1.0;
        }
    }
    result
}

fn calc_count(cond: &[f64], period: usize) -> Series {
    let len = cond.len();
    let mut result = vec![0.0; len];
    if period == 0 {
        return result;
    }

    for i in 0..len {
        let start = if i + 1 >= period { i + 1 - period } else { 0 };
        result[i] = cond[start..=i].iter().filter(|v| **v > 0.5).count() as f64;
    }
    result
}

fn calc_barslast(cond: &[f64]) -> Series {
    let len = cond.len();
    let mut result = vec![0.0; len];
    let mut last_true: Option<usize> = None;

    for i in 0..len {
        if cond[i] > 0.5 {
            last_true = Some(i);
        }
        result[i] = match last_true {
            Some(idx) => (i - idx) as f64,
            None => len as f64, // 从未发生过
        };
    }
    result
}

fn calc_avedev(data: &[f64], period: usize) -> Series {
    let len = data.len();
    let mut result = vec![0.0; len];
    if period == 0 {
        return result;
    }

    for i in 0..len {
        let start = if i + 1 >= period { i + 1 - period } else { 0 };
        let slice = &data[start..=i];
        let n = slice.len() as f64;
        let mean = slice.iter().sum::<f64>() / n;
        result[i] = slice.iter().map(|v| (v - mean).abs()).sum::<f64>() / n;
    }
    result
}

fn calc_std(data: &[f64], period: usize) -> Series {
    let len = data.len();
    let mut result = vec![0.0; len];
    if period == 0 {
        return result;
    }

    for i in 0..len {
        let start = if i + 1 >= period { i + 1 - period } else { 0 };
        let slice = &data[start..=i];
        let n = slice.len() as f64;
        let mean = slice.iter().sum::<f64>() / n;
        let variance = slice.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n;
        result[i] = variance.sqrt();
    }
    result
}

fn calc_slope(data: &[f64], period: usize) -> Series {
    let len = data.len();
    let mut result = vec![0.0; len];
    if period < 2 {
        return result;
    }

    for i in 0..len {
        if i + 1 < period {
            continue;
        }
        let start = i + 1 - period;
        let n = period as f64;
        let mut sum_x = 0.0;
        let mut sum_y = 0.0;
        let mut sum_xy = 0.0;
        let mut sum_x2 = 0.0;
        for (j, idx) in (start..=i).enumerate() {
            let x = j as f64;
            let y = data[idx];
            sum_x += x;
            sum_y += y;
            sum_xy += x * y;
            sum_x2 += x * x;
        }
        let denom = n * sum_x2 - sum_x * sum_x;
        if denom.abs() > f64::EPSILON {
            result[i] = (n * sum_xy - sum_x * sum_y) / denom;
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::tdx::tokenizer::Tokenizer;
    use crate::services::tdx::parser::Parser;

    fn make_bars(closes: &[f64]) -> Vec<KlineBar> {
        closes
            .iter()
            .enumerate()
            .map(|(i, &c)| KlineBar {
                date: format!("2025-01-{:02}", i + 1),
                open: c - 0.5,
                close: c,
                high: c + 1.0,
                low: c - 1.0,
                volume: 10000.0,
                amount: c * 10000.0,
            })
            .collect()
    }

    fn eval_source(source: &str, bars: &[KlineBar]) -> EvalResult {
        let mut t = Tokenizer::new(source);
        let tokens = t.tokenize().unwrap();
        let mut p = Parser::new(tokens);
        let stmts = p.parse().unwrap();
        let mut e = Evaluator::new(bars.to_vec());
        e.evaluate(&stmts).unwrap()
    }

    #[test]
    fn test_ma() {
        let bars = make_bars(&[10.0, 20.0, 30.0, 40.0, 50.0]);
        let result = eval_source("MA5 : MA(CLOSE, 3);", &bars);
        let ma5 = &result.outputs["MA5"];
        // MA(3) at index 4: (30+40+50)/3 = 40
        assert!((ma5[4] - 40.0).abs() < 0.01);
    }

    #[test]
    fn test_ema() {
        let bars = make_bars(&[10.0, 20.0, 30.0, 40.0, 50.0]);
        let result = eval_source("E : EMA(CLOSE, 3);", &bars);
        let e = &result.outputs["E"];
        // EMA: k=2/(3+1)=0.5, e[0]=10, e[1]=20*0.5+10*0.5=15, e[2]=30*0.5+15*0.5=22.5
        assert!((e[0] - 10.0).abs() < 0.01);
        assert!((e[1] - 15.0).abs() < 0.01);
        assert!((e[2] - 22.5).abs() < 0.01);
    }

    #[test]
    fn test_drawtext_signal() {
        // 最后一根 K 线: close=50, ref(close,1)=40, 50>40 → triggered
        let bars = make_bars(&[10.0, 20.0, 30.0, 40.0, 50.0]);
        let result = eval_source("DRAWTEXT(C > REF(C, 1), LOW, '涨了');", &bars);
        assert_eq!(result.signals.len(), 1);
        assert!(result.signals[0].triggered);
        assert_eq!(result.signals[0].text, "涨了");
    }

    #[test]
    fn test_drawtext_not_triggered() {
        // 最后一根 K 线: close=10, ref(close,1)=50, 10<50 → not triggered
        let bars = make_bars(&[50.0, 40.0, 30.0, 20.0, 10.0]);
        let result = eval_source("DRAWTEXT(C > REF(C, 1), LOW, '涨了');", &bars);
        assert!(!result.signals[0].triggered);
    }

    #[test]
    fn test_cross() {
        let bars = make_bars(&[10.0, 20.0, 15.0, 25.0, 30.0]);
        let result = eval_source(
            "MA3 := MA(C, 3);\nMA5 := MA(C, 5);\nGOLD := CROSS(MA3, MA5);\nGOLD_OUT : GOLD;",
            &bars,
        );
        let gold = &result.outputs["GOLD_OUT"];
        // 验证输出有值
        assert_eq!(gold.len(), 5);
    }

    #[test]
    fn test_full_bbi_formula() {
        let closes: Vec<f64> = (1..=30).map(|i| 10.0 + i as f64 * 0.5).collect();
        let bars = make_bars(&closes);
        let source = r#"
            MA3 := MA(CLOSE, 3);
            MA6 := MA(CLOSE, 6);
            MA12 := MA(CLOSE, 12);
            MA24 := MA(CLOSE, 24);
            BBI : (MA3 + MA6 + MA12 + MA24) / 4;
            DRAWTEXT(CLOSE > BBI AND REF(CLOSE, 1) < REF(BBI, 1), LOW, '金叉买入');
        "#;
        let result = eval_source(source, &bars);
        assert!(result.outputs.contains_key("BBI"));
        assert_eq!(result.signals.len(), 1);
    }

    #[test]
    fn test_sma() {
        let bars = make_bars(&[10.0, 20.0, 30.0, 40.0, 50.0]);
        let result = eval_source("S : SMA(CLOSE, 3, 1);", &bars);
        let s = &result.outputs["S"];
        // SMA(X, 3, 1): s[0]=10, s[1]=(20*1 + 10*(3-1))/3 = 40/3 ≈ 13.33
        assert!((s[0] - 10.0).abs() < 0.01);
        assert!((s[1] - 13.333).abs() < 0.01);
    }
}
