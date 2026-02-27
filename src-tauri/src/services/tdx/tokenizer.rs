/// TDX 公式词法分析器
///
/// 支持：数字、标识符（含中文）、字符串、运算符、括号、分号、冒号赋值
/// 忽略：COLOR*、LINETHICK*、{} 注释

#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    Number(f64),
    Ident(String),       // 标识符（变量名或函数名）
    Str(String),         // 字符串字面量 '...'
    Plus,
    Minus,
    Star,
    Slash,
    Gt,
    Lt,
    Ge,                  // >=
    Le,                  // <=
    Eq,                  // =（比较）
    And,
    Or,
    Not,
    LParen,
    RParen,
    Comma,
    Semicolon,
    Colon,               // : （输出变量）
    ColonAssign,         // :=（中间变量赋值）
    Eof,
}

#[derive(Debug, Clone)]
pub struct TokenWithPos {
    pub token: Token,
    pub line: usize,
    pub col: usize,
}

pub struct Tokenizer {
    chars: Vec<char>,
    pos: usize,
    line: usize,
    col: usize,
}

impl Tokenizer {
    pub fn new(source: &str) -> Self {
        Self {
            chars: source.chars().collect(),
            pos: 0,
            line: 1,
            col: 1,
        }
    }

    pub fn tokenize(&mut self) -> Result<Vec<TokenWithPos>, String> {
        let mut tokens = Vec::new();

        loop {
            self.skip_whitespace();
            self.skip_comment();
            self.skip_whitespace();

            if self.pos >= self.chars.len() {
                tokens.push(TokenWithPos {
                    token: Token::Eof,
                    line: self.line,
                    col: self.col,
                });
                break;
            }

            let line = self.line;
            let col = self.col;
            let ch = self.chars[self.pos];

            match ch {
                '+' => {
                    tokens.push(TokenWithPos { token: Token::Plus, line, col });
                    self.advance();
                }
                '-' => {
                    tokens.push(TokenWithPos { token: Token::Minus, line, col });
                    self.advance();
                }
                '*' => {
                    tokens.push(TokenWithPos { token: Token::Star, line, col });
                    self.advance();
                }
                '/' => {
                    tokens.push(TokenWithPos { token: Token::Slash, line, col });
                    self.advance();
                }
                '>' => {
                    self.advance();
                    if self.pos < self.chars.len() && self.chars[self.pos] == '=' {
                        self.advance();
                        tokens.push(TokenWithPos { token: Token::Ge, line, col });
                    } else {
                        tokens.push(TokenWithPos { token: Token::Gt, line, col });
                    }
                }
                '<' => {
                    self.advance();
                    if self.pos < self.chars.len() && self.chars[self.pos] == '=' {
                        self.advance();
                        tokens.push(TokenWithPos { token: Token::Le, line, col });
                    } else {
                        tokens.push(TokenWithPos { token: Token::Lt, line, col });
                    }
                }
                '=' => {
                    tokens.push(TokenWithPos { token: Token::Eq, line, col });
                    self.advance();
                }
                '(' => {
                    tokens.push(TokenWithPos { token: Token::LParen, line, col });
                    self.advance();
                }
                ')' => {
                    tokens.push(TokenWithPos { token: Token::RParen, line, col });
                    self.advance();
                }
                ',' => {
                    tokens.push(TokenWithPos { token: Token::Comma, line, col });
                    self.advance();
                }
                ';' => {
                    tokens.push(TokenWithPos { token: Token::Semicolon, line, col });
                    self.advance();
                }
                ':' => {
                    self.advance();
                    if self.pos < self.chars.len() && self.chars[self.pos] == '=' {
                        self.advance();
                        tokens.push(TokenWithPos { token: Token::ColonAssign, line, col });
                    } else {
                        tokens.push(TokenWithPos { token: Token::Colon, line, col });
                    }
                }
                '\'' => {
                    let s = self.read_string()?;
                    tokens.push(TokenWithPos { token: Token::Str(s), line, col });
                }
                _ if ch.is_ascii_digit() || ch == '.' => {
                    let num = self.read_number()?;
                    tokens.push(TokenWithPos { token: Token::Number(num), line, col });
                }
                _ if is_ident_start(ch) => {
                    let ident = self.read_ident();
                    // 检查是否为关键字
                    match ident.to_uppercase().as_str() {
                        "AND" => tokens.push(TokenWithPos { token: Token::And, line, col }),
                        "OR" => tokens.push(TokenWithPos { token: Token::Or, line, col }),
                        "NOT" => tokens.push(TokenWithPos { token: Token::Not, line, col }),
                        _ => {
                            // 跳过 COLOR* 和 LINETHICK* 属性
                            let upper = ident.to_uppercase();
                            if upper.starts_with("COLOR") || upper.starts_with("LINETHICK") || upper.starts_with("POINTDOT") || upper.starts_with("DOTLINE") || upper.starts_with("CIRCLEDOT") || upper.starts_with("NODRAW") {
                                // 忽略这些视觉属性
                            } else {
                                tokens.push(TokenWithPos { token: Token::Ident(ident), line, col });
                            }
                        }
                    }
                }
                _ => {
                    return Err(format!("第 {} 行第 {} 列: 未知字符 '{}'", line, col, ch));
                }
            }
        }

        Ok(tokens)
    }

    fn advance(&mut self) {
        if self.pos < self.chars.len() {
            if self.chars[self.pos] == '\n' {
                self.line += 1;
                self.col = 1;
            } else {
                self.col += 1;
            }
            self.pos += 1;
        }
    }

    fn skip_whitespace(&mut self) {
        while self.pos < self.chars.len() && self.chars[self.pos].is_whitespace() {
            self.advance();
        }
    }

    fn skip_comment(&mut self) {
        // {} 花括号注释
        if self.pos < self.chars.len() && self.chars[self.pos] == '{' {
            while self.pos < self.chars.len() && self.chars[self.pos] != '}' {
                self.advance();
            }
            if self.pos < self.chars.len() {
                self.advance(); // 跳过 '}'
            }
        }
        // // 行注释
        if self.pos + 1 < self.chars.len()
            && self.chars[self.pos] == '/'
            && self.chars[self.pos + 1] == '/'
        {
            while self.pos < self.chars.len() && self.chars[self.pos] != '\n' {
                self.advance();
            }
        }
    }

    fn read_number(&mut self) -> Result<f64, String> {
        let start = self.pos;
        let line = self.line;
        let col = self.col;
        let mut has_dot = false;

        while self.pos < self.chars.len() {
            let ch = self.chars[self.pos];
            if ch.is_ascii_digit() {
                self.advance();
            } else if ch == '.' && !has_dot {
                has_dot = true;
                self.advance();
            } else {
                break;
            }
        }

        let s: String = self.chars[start..self.pos].iter().collect();
        s.parse::<f64>()
            .map_err(|_| format!("第 {} 行第 {} 列: 无效数字 '{}'", line, col, s))
    }

    fn read_ident(&mut self) -> String {
        let start = self.pos;
        while self.pos < self.chars.len() && is_ident_char(self.chars[self.pos]) {
            self.advance();
        }
        self.chars[start..self.pos].iter().collect()
    }

    fn read_string(&mut self) -> Result<String, String> {
        let line = self.line;
        let col = self.col;
        self.advance(); // 跳过开头的 '
        let start = self.pos;

        while self.pos < self.chars.len() && self.chars[self.pos] != '\'' {
            self.advance();
        }

        if self.pos >= self.chars.len() {
            return Err(format!("第 {} 行第 {} 列: 字符串未闭合", line, col));
        }

        let s: String = self.chars[start..self.pos].iter().collect();
        self.advance(); // 跳过结尾的 '
        Ok(s)
    }
}

fn is_ident_start(ch: char) -> bool {
    ch.is_alphabetic() || ch == '_' || ch > '\u{007F}' // 支持中文
}

fn is_ident_char(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_' || ch > '\u{007F}'
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_tokenize() {
        let mut t = Tokenizer::new("MA5 := MA(CLOSE, 5);");
        let tokens = t.tokenize().unwrap();
        assert_eq!(tokens[0].token, Token::Ident("MA5".into()));
        assert_eq!(tokens[1].token, Token::ColonAssign);
        assert_eq!(tokens[2].token, Token::Ident("MA".into()));
        assert_eq!(tokens[3].token, Token::LParen);
        assert_eq!(tokens[4].token, Token::Ident("CLOSE".into()));
        assert_eq!(tokens[5].token, Token::Comma);
        assert_eq!(tokens[6].token, Token::Number(5.0));
        assert_eq!(tokens[7].token, Token::RParen);
        assert_eq!(tokens[8].token, Token::Semicolon);
    }

    #[test]
    fn test_drawtext() {
        let mut t = Tokenizer::new("DRAWTEXT(C>REF(C,1), LOW, '买入');");
        let tokens = t.tokenize().unwrap();
        assert!(tokens.iter().any(|t| t.token == Token::Ident("DRAWTEXT".into())));
        assert!(tokens.iter().any(|t| t.token == Token::Str("买入".into())));
    }

    #[test]
    fn test_skip_color() {
        let mut t = Tokenizer::new("MA5 : MA(CLOSE, 5), COLORRED, LINETHICK2;");
        let tokens = t.tokenize().unwrap();
        // COLORRED and LINETHICK2 should be skipped
        assert!(!tokens.iter().any(|t| matches!(&t.token, Token::Ident(s) if s.starts_with("COLOR"))));
        assert!(!tokens.iter().any(|t| matches!(&t.token, Token::Ident(s) if s.starts_with("LINETHICK"))));
    }

    #[test]
    fn test_comment() {
        let mut t = Tokenizer::new("{这是注释} MA5 := MA(CLOSE, 5);");
        let tokens = t.tokenize().unwrap();
        assert_eq!(tokens[0].token, Token::Ident("MA5".into()));
    }
}
