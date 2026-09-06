"""
9-gyo-phi: Smart Technical Code & Math Verbalizer Layer
Transforms code lines, directives, formulas, and syntax into natural spoken lecture format for TTS.
Supports fast deterministic rule verbalization and optional MLX LLM (Qwen2.5-Coder) acceleration.
"""

import re
import threading
from typing import Dict, Any, Tuple, Optional

# Pre-compiled regex patterns for C/C++, Python, JS/TS, and general programming
RE_C_HEADER = re.compile(r'^\s*#\s*include\s*<([a-zA-Z0-9_\-\.\/]+)>\s*')
RE_LOCAL_HEADER = re.compile(r'^\s*#\s*include\s*"([a-zA-Z0-9_\-\.\/]+)"\s*')
RE_DEFINE = re.compile(r'^\s*#\s*define\s+([a-zA-Z0-9_]+)(?:\s+(.*))?')
RE_IFDEF = re.compile(r'^\s*#\s*ifdef\s+([a-zA-Z0-9_]+)')
RE_IFNDEF = re.compile(r'^\s*#\s*ifndef\s+([a-zA-Z0-9_]+)')
RE_ENDIF = re.compile(r'^\s*#\s*endif\b')
RE_PRAGMA = re.compile(r'^\s*#\s*pragma\s+(.*)')

RE_MAIN = re.compile(r'^\s*(?:int|void)?\s*main\s*\(\s*(?:void)?\s*\)\s*;?\s*$')
RE_MAIN_ARGS = re.compile(r'^\s*int\s*main\s*\(\s*int\s+argc\s*,\s*char\s*\*\s*argv\s*\[\s*\]\s*\)\s*;?\s*$')

RE_PRINTF = re.compile(r'^\s*printf\s*\(\s*"([^"]*)"\s*(?:,\s*(.*))?\)\s*;?\s*$')
RE_SCANF = re.compile(r'^\s*scanf\s*\(\s*"([^"]*)"\s*(?:,\s*(.*))?\)\s*;?\s*$')
RE_PRINT = re.compile(r'^\s*print\s*\(\s*(?:f?"([^"]*)")?\s*(?:,\s*(.*))?\)\s*;?\s*$')

RE_RETURN = re.compile(r'^\s*return\s+(.+?)\s*;?\s*$')
RE_RETURN_EMPTY = re.compile(r'^\s*return\s*;?\s*$')

RE_COUT = re.compile(r'^\s*std::cout\s*<<\s*(.*);?\s*$|^\s*cout\s*<<\s*(.*);?\s*$')
RE_CIN = re.compile(r'^\s*std::cin\s*>>\s*(.*);?\s*$|^\s*cin\s*>>\s*(.*);?\s*$')

RE_FOR_LOOP = re.compile(r'^\s*for\s*\(\s*([^;]+)\s*;\s*([^;]+)\s*;\s*([^)]+)\s*\)\s*{?\s*$')
RE_WHILE_LOOP = re.compile(r'^\s*while\s*\(\s*([^)]+)\s*\)\s*{?\s*$')
RE_IF_STMT = re.compile(r'^\s*if\s*\(\s*([^)]+)\s*\)\s*{?\s*$')
RE_ELSE_IF = re.compile(r'^\s*else\s+if\s*\(\s*([^)]+)\s*\)\s*{?\s*$')
RE_ELSE = re.compile(r'^\s*else\s*{?\s*$')

RE_COMMENT_LINE = re.compile(r'^\s*(?://|#)\s*(.*)')
RE_COMMENT_BLOCK = re.compile(r'^\s*/\*\s*(.*?)\s*\*/\s*$')

RE_PY_DEF = re.compile(r'^\s*def\s+([a-zA-Z0-9_]+)\s*\((.*?)\)\s*:\s*$')
RE_PY_CLASS = re.compile(r'^\s*class\s+([a-zA-Z0-9_]+)(?:\s*\((.*?)\))?\s*:\s*$')
RE_PY_MAIN_CHECK = re.compile(r'^\s*if\s+__name__\s*==\s*[\'"]__main__[\'"]\s*:\s*$')
RE_PY_IMPORT = re.compile(r'^\s*import\s+([a-zA-Z0-9_]+)(?:\s+as\s+([a-zA-Z0-9_]+))?\s*$')
RE_PY_FROM_IMPORT = re.compile(r'^\s*from\s+([a-zA-Z0-9_\.]+)\s+import\s+(.*)\s*$')

# Known C/C++ standard library headers to natural names
STANDARD_HEADERS = {
    "stdio.h": "standard header",  # Specifically matches user requirement "hash includes standard header"
    "stdlib.h": "standard library header",
    "string.h": "string header",
    "math.h": "math library header",
    "stdbool.h": "standard boolean header",
    "stdint.h": "standard integer header",
    "stddef.h": "standard definitions header",
    "time.h": "time header",
    "ctype.h": "character type header",
    "assert.h": "assert header",
    "limits.h": "limits header",
    "float.h": "float header",
    "errno.h": "error number header",
    "signal.h": "signal header",
    "setjmp.h": "set jump header",
    "unistd.h": "unix standard header",
    "fcntl.h": "file control header",
    "sys/types.h": "system types header",
    "sys/stat.h": "system stat header",
    "sys/socket.h": "system socket header",
    "netinet/in.h": "internet address header",
    "arpa/inet.h": "internet protocol header",
    "pthread.h": "posix thread header",
    "iostream": "input output stream header",
    "vector": "vector header",
    "string": "string header",
    "algorithm": "algorithm header",
    "memory": "memory header",
    "map": "map header",
    "set": "set header",
    "unordered_map": "unordered map header",
    "unordered_set": "unordered set header",
    "queue": "queue header",
    "stack": "stack header",
    "thread": "thread header",
    "chrono": "chrono time header",
    "utility": "utility header",
    "functional": "functional header"
}

def clean_token_symbols(text: str) -> str:
    """Replaces operator and punctuation characters with natural words."""
    t = text
    t = re.sub(r'\\n|\n', ' backslash n ', t)
    t = re.sub(r'\\t|\t', ' tab ', t)
    t = re.sub(r'\\r|\r', ' carriage return ', t)
    t = re.sub(r'\\"', ' double quote ', t)
    t = re.sub(r'->', ' arrow ', t)
    t = re.sub(r'===', ' strictly equals ', t)
    t = re.sub(r'!==', ' strictly not equals ', t)
    t = re.sub(r'==', ' equals ', t)
    t = re.sub(r'!=', ' not equals ', t)
    t = re.sub(r'<=', ' less than or equal ', t)
    t = re.sub(r'>=', ' greater than or equal ', t)
    t = re.sub(r'\+\+', ' increment ', t)
    t = re.sub(r'--', ' decrement ', t)
    t = re.sub(r'\+=', ' plus equals ', t)
    t = re.sub(r'-=', ' minus equals ', t)
    t = re.sub(r'\*=', ' times equals ', t)
    t = re.sub(r'/=', ' divided by equals ', t)
    t = re.sub(r'&&', ' logical and ', t)
    t = re.sub(r'\|\|', ' logical or ', t)
    t = re.sub(r'<<', ' shift left ', t)
    t = re.sub(r'>>', ' shift right ', t)
    t = re.sub(r';$', '', t)
    return re.sub(r'\s+', ' ', t).strip()

def verbalize_rule_based(raw_text: str) -> Tuple[str, bool, str]:
    """
    Fast, deterministic rule-based verbalization for code lines.
    Returns: (spoken_text, is_transformed, explanation)
    """
    text = raw_text.strip()
    if not text:
        return "", False, ""

    # Standalone braces and delimiters
    if text == '{':
        return 'open brace', True, 'Code Block Start'
    elif text == '}':
        return 'close brace', True, 'Code Block End'
    elif text == '(':
        return 'open parenthesis', True, 'Delimiter'
    elif text == ')':
        return 'close parenthesis', True, 'Delimiter'
    elif text == ';':
        return 'semicolon', True, 'Statement Terminator'

    # Preprocessor Directives
    m = RE_C_HEADER.match(text)
    if m:
        h_name = m.group(1).lower()
        readable_header = STANDARD_HEADERS.get(h_name, f"{h_name.replace('.h', '')} header")
        return f"hash includes {readable_header}", True, "Header Inclusion"

    m = RE_LOCAL_HEADER.match(text)
    if m:
        h_name = m.group(1)
        return f"hash includes local header {h_name.replace('.h', '')}", True, "Local Header Inclusion"

    m = RE_DEFINE.match(text)
    if m:
        macro = m.group(1)
        val = m.group(2) or ""
        val_clean = clean_token_symbols(val) if val else ""
        return f"hash define {macro} {val_clean}".strip(), True, "Macro Definition"

    m = RE_IFDEF.match(text)
    if m:
        return f"hash if def {m.group(1)}", True, "Conditional Compilation"

    m = RE_IFNDEF.match(text)
    if m:
        return f"hash if not def {m.group(1)}", True, "Conditional Compilation"

    if RE_ENDIF.match(text):
        return "hash end if", True, "Conditional Compilation"

    m = RE_PRAGMA.match(text)
    if m:
        return f"hash pragma {m.group(1)}", True, "Compiler Directive"

    # Main function
    if RE_MAIN.match(text):
        return "main function with no arguments", True, "Main Function Entrypoint"

    if RE_MAIN_ARGS.match(text):
        return "main function taking argument count and argument vector", True, "Main Function Entrypoint"

    # Print / I/O functions
    m = RE_PRINTF.match(text)
    if m:
        fmt = m.group(1)
        fmt_clean = clean_token_symbols(fmt)
        args = m.group(2)
        if args:
            args_clean = clean_token_symbols(args)
            return f"print f with format string {fmt_clean}, arguments {args_clean}", True, "Standard I/O Print"
        return f"print f with string {fmt_clean}", True, "Standard I/O Print"

    m = RE_SCANF.match(text)
    if m:
        fmt = clean_token_symbols(m.group(1))
        args = clean_token_symbols(m.group(2) or "")
        return f"scan f format {fmt} into {args}".strip(), True, "Standard I/O Scan"

    m = RE_PRINT.match(text)
    if m:
        s = m.group(1)
        args = m.group(2)
        spoken_parts = []
        if s:
            spoken_parts.append(clean_token_symbols(s))
        if args:
            spoken_parts.append(clean_token_symbols(args))
        return f"print {' '.join(spoken_parts)}", True, "Console Output"

    # Control Flow
    m = RE_FOR_LOOP.match(text)
    if m:
        init_part = clean_token_symbols(m.group(1))
        cond_part = clean_token_symbols(m.group(2))
        step_part = clean_token_symbols(m.group(3))
        return f"for loop {init_part}, while {cond_part}, then {step_part}", True, "Loop Construct"

    m = RE_WHILE_LOOP.match(text)
    if m:
        cond = clean_token_symbols(m.group(1))
        return f"while ({cond})", True, "Loop Construct"

    m = RE_IF_STMT.match(text)
    if m:
        cond = clean_token_symbols(m.group(1))
        return f"if ({cond})", True, "Conditional Statement"

    m = RE_ELSE_IF.match(text)
    if m:
        cond = clean_token_symbols(m.group(1))
        return f"else if ({cond})", True, "Conditional Statement"

    if RE_ELSE.match(text):
        return "else block", True, "Conditional Statement"

    # Returns
    m = RE_RETURN.match(text)
    if m:
        val = clean_token_symbols(m.group(1))
        if val == "0":
            val = "zero"
        return f"return {val}", True, "Return Statement"

    if RE_RETURN_EMPTY.match(text):
        return "return", True, "Return Statement"

    # Comments
    m = RE_COMMENT_LINE.match(text)
    if m:
        c_text = m.group(1).strip()
        return f"comment: {c_text}", True, "Source Comment"

    m = RE_COMMENT_BLOCK.match(text)
    if m:
        c_text = m.group(1).strip()
        return f"comment: {c_text}", True, "Source Comment"

    # Python Specifics
    m = RE_PY_DEF.match(text)
    if m:
        fn_name = m.group(1)
        params = m.group(2).strip()
        param_desc = f"taking {clean_token_symbols(params)}" if params else "with no parameters"
        return f"define function {fn_name} {param_desc}", True, "Function Definition"

    m = RE_PY_CLASS.match(text)
    if m:
        cls_name = m.group(1)
        bases = m.group(2)
        base_desc = f"inheriting from {clean_token_symbols(bases)}" if bases else ""
        return f"class {cls_name} {base_desc}".strip(), True, "Class Definition"

    if RE_PY_MAIN_CHECK.match(text):
        return "if module executed directly as main script", True, "Module Entrypoint"

    m = RE_PY_IMPORT.match(text)
    if m:
        mod = m.group(1)
        alias = m.group(2)
        return f"import {mod} as {alias}" if alias else f"import {mod}", True, "Module Import"

    m = RE_PY_FROM_IMPORT.match(text)
    if m:
        src = m.group(1)
        items = clean_token_symbols(m.group(2))
        return f"from {src} import {items}", True, "Module Import"

    # Clean punctuation symbols in general code statements
    cleaned = clean_token_symbols(text)
    if cleaned != text:
        return cleaned, True, "Syntax Normalization"

    return text, False, ""


class LLMVerbalizerEngine:
    """Optional MLX-LM powered verbalizer for deep technical prose & lecture synthesis."""
    def __init__(self, model_id: str = "mlx-community/Qwen2.5-Coder-3B-Instruct-4bit"):
        self.model_id = model_id
        self._model = None
        self._tokenizer = None
        self._lock = threading.Lock()
        self._cache = {}
        self._is_loading = False

    def is_available(self) -> bool:
        try:
            import mlx_lm
            from server import is_model_installed
            installed, _, _ = is_model_installed(self.model_id)
            return bool(installed)
        except Exception:
            return False

    def ensure_loaded(self):
        if self._model is not None:
            return True
        with self._lock:
            if self._model is not None:
                return True
            try:
                import mlx_lm
                print(f"[LLM Verbalizer] Loading {self.model_id} on Apple Silicon Metal...")
                self._model, self._tokenizer = mlx_lm.load(self.model_id)
                print("[LLM Verbalizer] Loaded successfully!")
                return True
            except Exception as err:
                print(f"[LLM Verbalizer] Failed to load {self.model_id}:", err)
                return False

    def verbalize(self, text: str, max_tokens: int = 45) -> Optional[str]:
        cleaned_in = text.strip()
        if not cleaned_in:
            return None
        if cleaned_in in self._cache:
            return self._cache[cleaned_in]

        if not self.ensure_loaded():
            return None

        import mlx_lm
        prompt = (
            f"You are a technical audio lecture verbalizer for computer science textbooks. "
            f"Convert this code into a natural, spoken lecture explanation for text-to-speech. "
            f"Follow convention: '#include <stdio.h>' becomes 'hash includes standard header'. "
            f"Output ONLY the spoken words. No markdown, no quotes, no extra conversational preamble.\n\n"
            f"Code: {cleaned_in}\n"
            f"Spoken:"
        )

        with self._lock:
            try:
                raw_out = mlx_lm.generate(
                    self._model,
                    self._tokenizer,
                    prompt=prompt,
                    max_tokens=max_tokens,
                    verbose=False
                )
                spoken = raw_out.strip().split('\n')[0].strip()
                # Strip any quotes or redundant "Spoken:" prefixes
                spoken = re.sub(r'^(?:Spoken:|"|\')\s*', '', spoken)
                spoken = re.sub(r'["\']\s*$', '', spoken).strip()
                if spoken and len(spoken) > 3:
                    self._cache[cleaned_in] = spoken
                    return spoken
            except Exception as e:
                print("[LLM Verbalizer] Inference error:", e)
        return None


# Global singleton instance
llm_engine = LLMVerbalizerEngine()

def verbalize_segment(text: str, is_code: bool = False, use_llm: bool = True) -> Dict[str, Any]:
    """
    Unified verbalization interface.
    Attempts high-speed rules first, with LLM acceleration for complex or multi-statement lines.
    """
    raw_text = text.strip()
    if not raw_text:
        return {
            "original_text": text,
            "speech_text": text,
            "is_code": False,
            "transformed": False,
            "verbalizer": "none",
            "explanation": ""
        }

    # 1. Rule-based verbalization (Fast, deterministic, guaranteed exactness)
    rule_speech, rule_trans, explanation = verbalize_rule_based(raw_text)

    # If already successfully transformed by dedicated rule
    if rule_trans:
        return {
            "original_text": raw_text,
            "speech_text": rule_speech,
            "is_code": True if is_code or rule_trans else False,
            "transformed": True,
            "verbalizer": "rules",
            "explanation": explanation
        }

    # 2. If it's a code block and LLM is requested & available, try LLM verbalization
    if is_code and use_llm and llm_engine.is_available():
        llm_speech = llm_engine.verbalize(raw_text)
        if llm_speech:
            return {
                "original_text": raw_text,
                "speech_text": llm_speech,
                "is_code": True,
                "transformed": True,
                "verbalizer": "llm",
                "explanation": "Qwen2.5-Coder Verbalization"
            }

    # 3. Default prose or untransformed
    return {
        "original_text": raw_text,
        "speech_text": rule_speech if rule_speech else raw_text,
        "is_code": is_code,
        "transformed": bool(rule_speech != raw_text),
        "verbalizer": "rules" if (rule_speech != raw_text) else "none",
        "explanation": explanation if (rule_speech != raw_text) else ""
    }
