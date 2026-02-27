/// TDX 公式语法分析器
///
/// 支持：
/// - X := expr;  (中间变量赋值)
/// - X : expr;   (输出变量)
/// - DRAWTEXT(cond, price_expr, text);

use super::tokenizer::{Token, TokenWithPos};

#[derive(Debug, Clone)]
pub enum Statement {
    Assign {
        name: String,
        expr: Expr,
    },
    Output {
        name: String,
        expr: Expr,
    },
    DrawText {
        condition: Expr,
        price_expr: Expr,
        text: String,
    },
}

#[derive(Debug, Clone)]
pub enum Expr {
    Number(f64),
    Str(String),
    Variable(String),
    BinaryOp {
        op: BinOp,
        left: Box<Expr>,
        right: Box<Expr>,
    },
    UnaryOp {
        op: UnOp,
        operand: Box<Expr>,
    },
    FuncCall {
        name: String,
        args: Vec<Expr>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BinOp {
    Add,
    Sub,
    Mul,
    Div,
    Gt,
    Lt,
    Ge,
    Le,
    Eq,
    And,
    Or,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum UnOp {
    Neg,
    Not,
}

pub struct Parser {
    tokens: Vec<TokenWithPos>,
    pos: usize,
}

impl Parser {
    pub fn new(tokens: Vec<TokenWithPos>) -> Self {
        Self { tokens, pos: 0 }
    }

    pub fn parse(&mut self) -> Result<Vec<Statement>, String> {
        let mut stmts = Vec::new();

        while !self.at_end() {
            // 跳过多余分号
            if self.check(&Token::Semicolon) {
                self.advance();
                continue;
            }
            if self.at_end() {
                break;
            }

            let stmt = self.parse_statement()?;
            stmts.push(stmt);

            // 分号可选（宽容）
            if self.check(&Token::Semicolon) {
                self.advance();
            }
        }

        Ok(stmts)
    }

    fn parse_statement(&mut self) -> Result<Statement, String> {
        // 检查是否是 DRAWTEXT
        if self.check_ident("DRAWTEXT") {
            return self.parse_drawtext();
        }

        // 标识符开头：可能是 X := expr 或 X : expr
        if let Token::Ident(name) = self.peek().token.clone() {
            // 向前看：下一个 token 是 := 还是 :
            if self.pos + 1 < self.tokens.len() {
                match &self.tokens[self.pos + 1].token {
                    Token::ColonAssign => {
                        self.advance(); // name
                        self.advance(); // :=
                        let expr = self.parse_expr()?;
                        return Ok(Statement::Assign { name, expr });
                    }
                    Token::Colon => {
                        self.advance(); // name
                        self.advance(); // :
                        let expr = self.parse_expr()?;
                        return Ok(Statement::Output { name, expr });
                    }
                    _ => {}
                }
            }
        }

        // 如果都不是，尝试解析为表达式（可能是无名输出或仅函数调用）
        let tp = self.peek();
        Err(format!(
            "第 {} 行第 {} 列: 期望赋值语句或 DRAWTEXT，发现 {:?}",
            tp.line, tp.col, tp.token
        ))
    }

    fn parse_drawtext(&mut self) -> Result<Statement, String> {
        self.advance(); // DRAWTEXT
        self.expect(&Token::LParen, "DRAWTEXT 后期望 '('")?;

        let condition = self.parse_expr()?;
        self.expect(&Token::Comma, "DRAWTEXT 条件后期望 ','")?;

        let price_expr = self.parse_expr()?;
        self.expect(&Token::Comma, "DRAWTEXT 价格表达式后期望 ','")?;

        // 文本参数
        let text = match &self.peek().token {
            Token::Str(s) => {
                let s = s.clone();
                self.advance();
                s
            }
            _ => {
                let tp = self.peek();
                return Err(format!(
                    "第 {} 行第 {} 列: DRAWTEXT 第三个参数期望字符串",
                    tp.line, tp.col
                ));
            }
        };

        self.expect(&Token::RParen, "DRAWTEXT 期望 ')'")?;

        Ok(Statement::DrawText {
            condition,
            price_expr,
            text,
        })
    }

    // ── 表达式优先级解析 ──

    fn parse_expr(&mut self) -> Result<Expr, String> {
        self.parse_or()
    }

    fn parse_or(&mut self) -> Result<Expr, String> {
        let mut left = self.parse_and()?;
        while self.check(&Token::Or) {
            self.advance();
            let right = self.parse_and()?;
            left = Expr::BinaryOp {
                op: BinOp::Or,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_and(&mut self) -> Result<Expr, String> {
        let mut left = self.parse_comparison()?;
        while self.check(&Token::And) {
            self.advance();
            let right = self.parse_comparison()?;
            left = Expr::BinaryOp {
                op: BinOp::And,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_comparison(&mut self) -> Result<Expr, String> {
        let mut left = self.parse_add()?;
        loop {
            let op = match &self.peek().token {
                Token::Gt => BinOp::Gt,
                Token::Lt => BinOp::Lt,
                Token::Ge => BinOp::Ge,
                Token::Le => BinOp::Le,
                Token::Eq => BinOp::Eq,
                _ => break,
            };
            self.advance();
            let right = self.parse_add()?;
            left = Expr::BinaryOp {
                op,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_add(&mut self) -> Result<Expr, String> {
        let mut left = self.parse_mul()?;
        loop {
            let op = match &self.peek().token {
                Token::Plus => BinOp::Add,
                Token::Minus => BinOp::Sub,
                _ => break,
            };
            self.advance();
            let right = self.parse_mul()?;
            left = Expr::BinaryOp {
                op,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_mul(&mut self) -> Result<Expr, String> {
        let mut left = self.parse_unary()?;
        loop {
            let op = match &self.peek().token {
                Token::Star => BinOp::Mul,
                Token::Slash => BinOp::Div,
                _ => break,
            };
            self.advance();
            let right = self.parse_unary()?;
            left = Expr::BinaryOp {
                op,
                left: Box::new(left),
                right: Box::new(right),
            };
        }
        Ok(left)
    }

    fn parse_unary(&mut self) -> Result<Expr, String> {
        if self.check(&Token::Minus) {
            self.advance();
            let operand = self.parse_unary()?;
            return Ok(Expr::UnaryOp {
                op: UnOp::Neg,
                operand: Box::new(operand),
            });
        }
        if self.check(&Token::Not) {
            self.advance();
            let operand = self.parse_unary()?;
            return Ok(Expr::UnaryOp {
                op: UnOp::Not,
                operand: Box::new(operand),
            });
        }
        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Result<Expr, String> {
        let tp = self.peek().clone();

        match &tp.token {
            Token::Number(n) => {
                let n = *n;
                self.advance();
                Ok(Expr::Number(n))
            }
            Token::Str(s) => {
                let s = s.clone();
                self.advance();
                Ok(Expr::Str(s))
            }
            Token::Ident(name) => {
                let name = name.clone();
                self.advance();

                // 检查是否是函数调用
                if self.check(&Token::LParen) {
                    self.advance(); // (
                    let mut args = Vec::new();

                    if !self.check(&Token::RParen) {
                        args.push(self.parse_expr()?);
                        while self.check(&Token::Comma) {
                            self.advance();
                            args.push(self.parse_expr()?);
                        }
                    }

                    self.expect(&Token::RParen, &format!("函数 {} 调用期望 ')'", name))?;

                    Ok(Expr::FuncCall { name, args })
                } else {
                    Ok(Expr::Variable(name))
                }
            }
            Token::LParen => {
                self.advance(); // (
                let expr = self.parse_expr()?;
                self.expect(&Token::RParen, "期望 ')'")?;
                Ok(expr)
            }
            _ => Err(format!(
                "第 {} 行第 {} 列: 期望表达式，发现 {:?}",
                tp.line, tp.col, tp.token
            )),
        }
    }

    // ── 辅助方法 ──

    fn peek(&self) -> &TokenWithPos {
        &self.tokens[self.pos.min(self.tokens.len() - 1)]
    }

    fn advance(&mut self) {
        if self.pos < self.tokens.len() {
            self.pos += 1;
        }
    }

    fn at_end(&self) -> bool {
        self.pos >= self.tokens.len() || self.tokens[self.pos].token == Token::Eof
    }

    fn check(&self, token: &Token) -> bool {
        if self.at_end() {
            return false;
        }
        std::mem::discriminant(&self.tokens[self.pos].token) == std::mem::discriminant(token)
    }

    fn check_ident(&self, name: &str) -> bool {
        if self.at_end() {
            return false;
        }
        matches!(&self.tokens[self.pos].token, Token::Ident(n) if n.to_uppercase() == name)
    }

    fn expect(&mut self, expected: &Token, msg: &str) -> Result<(), String> {
        if self.check(expected) {
            self.advance();
            Ok(())
        } else {
            let tp = self.peek();
            Err(format!(
                "第 {} 行第 {} 列: {}, 发现 {:?}",
                tp.line, tp.col, msg, tp.token
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::tdx::tokenizer::Tokenizer;

    fn parse_source(source: &str) -> Vec<Statement> {
        let mut t = Tokenizer::new(source);
        let tokens = t.tokenize().unwrap();
        let mut p = Parser::new(tokens);
        p.parse().unwrap()
    }

    #[test]
    fn test_assign_and_output() {
        let stmts = parse_source("MA5 := MA(CLOSE, 5);\nMA5OUT : MA5;");
        assert_eq!(stmts.len(), 2);
        assert!(matches!(&stmts[0], Statement::Assign { name, .. } if name == "MA5"));
        assert!(matches!(&stmts[1], Statement::Output { name, .. } if name == "MA5OUT"));
    }

    #[test]
    fn test_drawtext() {
        let stmts = parse_source("DRAWTEXT(CLOSE > REF(CLOSE, 1), LOW, '买入信号');");
        assert_eq!(stmts.len(), 1);
        assert!(matches!(&stmts[0], Statement::DrawText { text, .. } if text == "买入信号"));
    }

    #[test]
    fn test_complex_expr() {
        let stmts = parse_source("X := (MA(C, 5) + MA(C, 10)) / 2;");
        assert_eq!(stmts.len(), 1);
        assert!(matches!(&stmts[0], Statement::Assign { .. }));
    }

    #[test]
    fn test_comparison_and_logic() {
        let stmts = parse_source("BUY := C > REF(C, 1) AND V > REF(V, 1);");
        assert_eq!(stmts.len(), 1);
    }
}
