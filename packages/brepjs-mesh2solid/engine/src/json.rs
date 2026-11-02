//! Minimal JSON writer for the conversion report (no serde in the wasm build).

use std::fmt::Write;

pub struct Obj {
    buf: String,
    first: bool,
}

impl Obj {
    pub fn new() -> Obj {
        Obj {
            buf: String::from("{"),
            first: true,
        }
    }

    fn key(&mut self, k: &str) {
        if !self.first {
            self.buf.push(',');
        }
        self.first = false;
        push_str(&mut self.buf, k);
        self.buf.push(':');
    }

    pub fn num(mut self, k: &str, v: f64) -> Obj {
        self.key(k);
        push_num(&mut self.buf, v);
        self
    }

    pub fn int(mut self, k: &str, v: usize) -> Obj {
        self.key(k);
        let _ = write!(self.buf, "{v}");
        self
    }

    pub fn boolean(mut self, k: &str, v: bool) -> Obj {
        self.key(k);
        self.buf.push_str(if v { "true" } else { "false" });
        self
    }

    pub fn str(mut self, k: &str, v: &str) -> Obj {
        self.key(k);
        push_str(&mut self.buf, v);
        self
    }

    pub fn raw(mut self, k: &str, json: &str) -> Obj {
        self.key(k);
        self.buf.push_str(json);
        self
    }

    pub fn nums(mut self, k: &str, vs: &[f64]) -> Obj {
        self.key(k);
        self.buf.push('[');
        for (i, &v) in vs.iter().enumerate() {
            if i > 0 {
                self.buf.push(',');
            }
            push_num(&mut self.buf, v);
        }
        self.buf.push(']');
        self
    }

    pub fn strs(mut self, k: &str, vs: &[String]) -> Obj {
        self.key(k);
        self.buf.push('[');
        for (i, v) in vs.iter().enumerate() {
            if i > 0 {
                self.buf.push(',');
            }
            push_str(&mut self.buf, v);
        }
        self.buf.push(']');
        self
    }

    pub fn finish(mut self) -> String {
        self.buf.push('}');
        self.buf
    }
}

pub fn array(items: &[String]) -> String {
    format!("[{}]", items.join(","))
}

fn push_num(buf: &mut String, v: f64) {
    if v.is_finite() {
        let _ = write!(buf, "{v}");
    } else {
        buf.push_str("null");
    }
}

fn push_str(buf: &mut String, s: &str) {
    buf.push('"');
    for c in s.chars() {
        match c {
            '"' => buf.push_str("\\\""),
            '\\' => buf.push_str("\\\\"),
            '\n' => buf.push_str("\\n"),
            '\r' => buf.push_str("\\r"),
            '\t' => buf.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                let _ = write!(buf, "\\u{:04x}", c as u32);
            }
            c => buf.push(c),
        }
    }
    buf.push('"');
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_valid_object() {
        let s = Obj::new()
            .num("a", 1.5)
            .num("nan", f64::NAN)
            .int("n", 3)
            .boolean("b", true)
            .str("s", "q\"\n")
            .nums("v", &[1.0, 2.0])
            .strs("w", &["x".into()])
            .raw("o", &Obj::new().int("k", 1).finish())
            .finish();
        assert_eq!(
            s,
            r#"{"a":1.5,"nan":null,"n":3,"b":true,"s":"q\"\n","v":[1,2],"w":["x"],"o":{"k":1}}"#
        );
    }
}
