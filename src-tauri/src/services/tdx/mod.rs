pub mod evaluator;
pub mod parser;
pub mod tokenizer;

use crate::services::kline::KlineBar;
use evaluator::{EvalResult, Evaluator};
use parser::{Parser, Statement};
use serde::Serialize;
use tokenizer::Tokenizer;

/// 公式验证结果
#[derive(Debug, Serialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
    pub output_vars: Vec<String>,
    pub assign_vars: Vec<String>,
    pub drawtext_count: usize,
}

/// 验证 TDX 公式语法
pub fn validate_formula(source: &str) -> ValidationResult {
    let mut result = ValidationResult {
        valid: false,
        errors: Vec::new(),
        warnings: Vec::new(),
        output_vars: Vec::new(),
        assign_vars: Vec::new(),
        drawtext_count: 0,
    };

    // 词法分析
    let mut tokenizer = Tokenizer::new(source);
    let tokens = match tokenizer.tokenize() {
        Ok(t) => t,
        Err(e) => {
            result.errors.push(e);
            return result;
        }
    };

    // 语法分析
    let mut parser = Parser::new(tokens);
    let stmts = match parser.parse() {
        Ok(s) => s,
        Err(e) => {
            result.errors.push(e);
            return result;
        }
    };

    // 提取信息
    for stmt in &stmts {
        match stmt {
            Statement::Assign { name, .. } => {
                result.assign_vars.push(name.clone());
            }
            Statement::Output { name, .. } => {
                result.output_vars.push(name.clone());
            }
            Statement::DrawText { .. } => {
                result.drawtext_count += 1;
            }
        }
    }

    if result.drawtext_count == 0 {
        result
            .warnings
            .push("公式中没有 DRAWTEXT 语句，将无法产生信号提醒".to_string());
    }

    result.valid = true;
    result
}

/// 解析 TDX 公式为 AST
pub fn parse_formula(source: &str) -> Result<Vec<Statement>, String> {
    let mut tokenizer = Tokenizer::new(source);
    let tokens = tokenizer.tokenize()?;
    let mut parser = Parser::new(tokens);
    parser.parse()
}

/// 计算 TDX 公式（使用 K 线数据）
pub fn evaluate_formula(source: &str, bars: &[KlineBar]) -> Result<EvalResult, String> {
    let stmts = parse_formula(source)?;
    let mut evaluator = Evaluator::new(bars.to_vec());
    evaluator.evaluate(&stmts)
}
