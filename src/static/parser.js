const CODE_PATTERNS = [
  /^\s*#\s*include\b/,
  /^\s*(import|from|def|class|function|fn|func|var|let|const|return|package|using|namespace)\b/,
  /^\s*(public|private|protected)?\s*(static)?\s*(void|int|float|double|char|bool|string)\b/,
  /^\s*[\{\}\(\)\[\];]\s*$/,
  /;\s*$/,
  /^\s*\w+\s*\([^)]*\)\s*\{?\s*$/,
  /\b(printf|println|cout|console\.log|System\.out)\b/,
];

function isCodeLine(text, isMono = false) {
  const t = text ? text.trim() : "";
  if (!t) return false;
  if (isMono) return true;
  return CODE_PATTERNS.some((pat) => pat.test(t));
}

const STANDARD_HEADERS = {
  "stdio.h": "standard header",
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
  iostream: "input output stream header",
  vector: "vector header",
  string: "string header",
  algorithm: "algorithm header",
  memory: "memory header",
  map: "map header",
  set: "set header",
  unordered_map: "unordered map header",
  unordered_set: "unordered set header",
  queue: "queue header",
  stack: "stack header",
  thread: "thread header",
  chrono: "chrono time header",
  utility: "utility header",
  functional: "functional header",
};

function cleanTokenSymbols(text) {
  let t = text;
  t = t.replace(/\\n|\n/g, " backslash n ");
  t = t.replace(/\\t|\t/g, " tab ");
  t = t.replace(/\\r|\r/g, " carriage return ");
  t = t.replace(/\\"/g, " double quote ");
  t = t.replace(/->/g, " arrow ");
  t = t.replace(/===/g, " strictly equals ");
  t = t.replace(/!==/g, " strictly not equals ");
  t = t.replace(/==/g, " equals ");
  t = t.replace(/!=/g, " not equals ");
  t = t.replace(/<=/g, " less than or equal ");
  t = t.replace(/>=/g, " greater than or equal ");
  t = t.replace(/\+\+/g, " increment ");
  t = t.replace(/--/g, " decrement ");
  t = t.replace(/\+=/g, " plus equals ");
  t = t.replace(/-=/g, " minus equals ");
  t = t.replace(/\*=/g, " times equals ");
  t = t.replace(/\/=/g, " divided by equals ");
  t = t.replace(/&&/g, " logical and ");
  t = t.replace(/\|\|/g, " logical or ");
  t = t.replace(/<</g, " shift left ");
  t = t.replace(/>>/g, " shift right ");
  t = t.replace(/;$/, "");
  return t.replace(/\s+/g, " ").trim();
}

const COUNT_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

function splitParameters(source) {
  const parameters = [];
  let start = 0,
    depth = 0,
    quote = "";
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === quote && source[i - 1] !== "\\") quote = "";
    } else if ("\"'`".includes(char)) quote = char;
    else if ("([{<".includes(char)) depth++;
    else if (")]}>".includes(char)) depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      parameters.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = source.slice(start).trim();
  if (tail) parameters.push(tail);
  return parameters;
}

function parameterName(parameter) {
  let value = parameter
    .replace(/\s*=.*$/, "")
    .replace(/^\.\.\./, "")
    .replace(/^\*+/, "")
    .trim();
  if (/^[A-Za-z_$][\w$]*\s*:/.test(value)) value = value.split(":", 1)[0];
  const identifiers = value.match(/[A-Za-z_$][\w$]*/g) || [];
  return identifiers.at(-1) || cleanTokenSymbols(value);
}

function describeFunction(name, parameters) {
  const names = splitParameters(parameters)
    .filter((parameter) => parameter && parameter !== "void")
    .map(parameterName);
  if (!names.length)
    return `function definition for a function named ${name} with no arguments`;
  const count = COUNT_WORDS[names.length] || String(names.length);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `function definition for a function named ${name} with ${count} argument${names.length === 1 ? "" : "s"} ${list}`;
}

function verbalizeRuleBasedNative(rawText) {
  const text = rawText ? rawText.trim() : "";
  if (!text) return { text: "", transformed: false, explanation: "" };

  if (text === "{")
    return {
      text: "open brace",
      transformed: true,
      explanation: "Code Block Start",
    };
  if (text === "}")
    return {
      text: "close brace",
      transformed: true,
      explanation: "Code Block End",
    };
  if (text === "(")
    return {
      text: "open parenthesis",
      transformed: true,
      explanation: "Delimiter",
    };
  if (text === ")")
    return {
      text: "close parenthesis",
      transformed: true,
      explanation: "Delimiter",
    };
  if (text === ";")
    return {
      text: "semicolon",
      transformed: true,
      explanation: "Statement Terminator",
    };

  let m = text.match(/^\s*#\s*include\s*<([a-zA-Z0-9_\-\.\/]+)>/);
  if (m) {
    const h = m[1].toLowerCase();
    const readable = STANDARD_HEADERS[h] || `${h.replace(".h", "")} header`;
    return {
      text: `hash includes ${readable}`,
      transformed: true,
      explanation: "Header Inclusion",
    };
  }

  m = text.match(/^\s*#\s*include\s*"([a-zA-Z0-9_\-\.\/]+)"/);
  if (m) {
    const h = m[1];
    return {
      text: `hash includes local header ${h.replace(".h", "")}`,
      transformed: true,
      explanation: "Local Header Inclusion",
    };
  }

  m = text.match(/^\s*#\s*define\s+([a-zA-Z0-9_]+)(?:\s+(.*))?/);
  if (m) {
    const macro = m[1];
    const val = m[2] ? cleanTokenSymbols(m[2]) : "";
    return {
      text: `hash define ${macro} ${val}`.trim(),
      transformed: true,
      explanation: "Macro Definition",
    };
  }

  if (/^\s*#\s*ifdef\s+([a-zA-Z0-9_]+)/.test(text)) {
    return {
      text: `hash if def ${RegExp.$1}`,
      transformed: true,
      explanation: "Conditional Compilation",
    };
  }
  if (/^\s*#\s*ifndef\s+([a-zA-Z0-9_]+)/.test(text)) {
    return {
      text: `hash if not def ${RegExp.$1}`,
      transformed: true,
      explanation: "Conditional Compilation",
    };
  }
  if (/^\s*#\s*endif\b/.test(text)) {
    return {
      text: "hash end if",
      transformed: true,
      explanation: "Conditional Compilation",
    };
  }

  m = text.match(/^\s*static_assert\s*\((.*)\)\s*;?\s*$/);
  if (m) {
    const argumentsList = splitParameters(m[1]);
    const rawCondition = argumentsList.length
      ? argumentsList[0].replace(
          /\bsizeof\s*\(\s*([^()]+?)\s*\)/g,
          (_, type) => `size of ${type.replace(/\*/g, " pointer ")}`,
        )
      : "condition";
    const condition = cleanTokenSymbols(rawCondition);
    const message =
      argumentsList.length > 1
        ? `, with message ${cleanTokenSymbols(argumentsList[1])}`
        : "";
    return {
      text: `static assertion requiring ${condition} to be true at compile time${message}`,
      transformed: true,
      explanation: "Static Assertion",
    };
  }

  m = text.match(
    /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\((.*)\)\s*(?:->\s*[^:]+)?\s*:?\s*$/,
  );
  if (m)
    return {
      text: describeFunction(m[1], m[2]),
      transformed: true,
      explanation: "Function Definition",
    };

  m = text.match(
    /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\((.*)\)\s*\{?\s*$/,
  );
  if (m)
    return {
      text: describeFunction(m[1], m[2]),
      transformed: true,
      explanation: "Function Definition",
    };

  m = text.match(
    /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)\s*\((.*)\)\s*(?:->\s*[^\{]+)?\s*\{?\s*$/,
  );
  if (m)
    return {
      text: describeFunction(m[1], m[2]),
      transformed: true,
      explanation: "Function Definition",
    };

  if (/^\s*(?:int|void)?\s*main\s*\(\s*(?:void)?\s*\)\s*;?\s*$/.test(text)) {
    return {
      text: "main function with no arguments",
      transformed: true,
      explanation: "Main Function Entrypoint",
    };
  }

  m = text.match(
    /^\s*(?:(?:public|private|protected|static|final|virtual|inline|constexpr|synchronized)\s+)*(?:[A-Za-z_$][\w$:<>,.?\[\]*&]*\s+)+([A-Za-z_$][\w$]*)\s*\((.*)\)\s*(?:const\s*)?[{;]?\s*$/,
  );
  if (m && !["if", "for", "while", "switch", "catch"].includes(m[1]))
    return {
      text: describeFunction(m[1], m[2]),
      transformed: true,
      explanation: "Function Definition",
    };
  if (
    /^\s*int\s*main\s*\(\s*int\s+argc\s*,\s*char\s*\*\s*argv\s*\[\s*\]\s*\)\s*;?\s*$/.test(
      text,
    )
  ) {
    return {
      text: "main function taking argument count and argument vector",
      transformed: true,
      explanation: "Main Function Entrypoint",
    };
  }

  m = text.match(/^\s*printf\s*\(\s*"([^"]*)"\s*(?:,\s*(.*))?\)\s*;?\s*$/);
  if (m) {
    const fmt = cleanTokenSymbols(m[1]);
    const args = m[2] ? cleanTokenSymbols(m[2]) : "";
    return {
      text: args
        ? `print f with format string ${fmt}, arguments ${args}`
        : `print f with string ${fmt}`,
      transformed: true,
      explanation: "Standard I/O Print",
    };
  }

  m = text.match(
    /^\s*for\s*\(\s*([^;]+)\s*;\s*([^;]+)\s*;\s*([^)]+)\s*\)\s*{?\s*$/,
  );
  if (m) {
    return {
      text: `for loop ${cleanTokenSymbols(m[1])}, while ${cleanTokenSymbols(m[2])}, then ${cleanTokenSymbols(m[3])}`,
      transformed: true,
      explanation: "Loop Construct",
    };
  }

  m = text.match(/^\s*while\s*\(\s*([^)]+)\s*\)\s*{?\s*$/);
  if (m) {
    return {
      text: `while (${cleanTokenSymbols(m[1])})`,
      transformed: true,
      explanation: "Loop Construct",
    };
  }

  m = text.match(/^\s*if\s*\(\s*([^)]+)\s*\)\s*{?\s*$/);
  if (m) {
    return {
      text: `if (${cleanTokenSymbols(m[1])})`,
      transformed: true,
      explanation: "Conditional Statement",
    };
  }

  if (/^\s*return\s+(.+?)\s*;?\s*$/.test(text)) {
    let val = cleanTokenSymbols(RegExp.$1);
    if (val === "0") val = "zero";
    return {
      text: `return ${val}`,
      transformed: true,
      explanation: "Return Statement",
    };
  }

  if (/^\s*(?:\/\/|#)\s*(.*)/.test(text)) {
    return {
      text: `comment: ${RegExp.$1.trim()}`,
      transformed: true,
      explanation: "Source Comment",
    };
  }

  const cleaned = cleanTokenSymbols(text);
  const punctuationOnly = cleaned === text.replace(/;\s*$/, "").trim();
  if (cleaned !== text && !punctuationOnly) {
    return {
      text: cleaned,
      transformed: true,
      explanation: "Syntax Normalization",
    };
  }

  return { text, transformed: false, explanation: "" };
}

function verbalizeSegmentNative(text, isCode = false) {
  const rule = verbalizeRuleBasedNative(text);
  return {
    original_text: text,
    speech_text: rule.text || text,
    is_code: isCode || rule.transformed,
    transformed: rule.transformed,
    verbalizer: rule.transformed ? "rules" : "none",
    explanation: rule.explanation,
  };
}

// =======================================================================
// CLIENT-SIDE SPATIAL PDF PARSER (RECURSIVE XY-CUT)
// =======================================================================
function recursiveXYCut(lines, minGutterWidth = 12.0, minParaGap = 15.0) {
  if (lines.length <= 1) return lines;

  // 1. Check for Vertical Gutters (X-Cuts dividing into columns)
  const linesX = [...lines].sort((a, b) => a.bbox[0] - b.bbox[0]);
  const xCuts = [];
  let currentMaxX1 = linesX[0].bbox[2];

  for (let i = 1; i < linesX.length; i++) {
    const curr = linesX[i];
    const gap = curr.bbox[0] - currentMaxX1;
    if (gap >= minGutterWidth) {
      xCuts.push(i);
    }
    currentMaxX1 = Math.max(currentMaxX1, curr.bbox[2]);
  }

  if (xCuts.length > 0) {
    const ordered = [];
    let startIdx = 0;
    for (const cutIdx of xCuts) {
      const colLines = linesX.slice(startIdx, cutIdx);
      ordered.push(...recursiveXYCut(colLines, minGutterWidth, minParaGap));
      startIdx = cutIdx;
    }
    const colLines = linesX.slice(startIdx);
    ordered.push(...recursiveXYCut(colLines, minGutterWidth, minParaGap));
    return ordered;
  }

  // 2. Horizontal Gap (Y-Cut)
  const linesY = [...lines].sort((a, b) => a.bbox[1] - b.bbox[1]);
  let currentMaxY1 = linesY[0].bbox[3];
  let yCutIdx = null;
  let maxGap = 0;

  for (let i = 1; i < linesY.length; i++) {
    const curr = linesY[i];
    const gap = curr.bbox[1] - currentMaxY1;
    if (gap >= minParaGap && gap > maxGap) {
      maxGap = gap;
      yCutIdx = i;
    }
    currentMaxY1 = Math.max(currentMaxY1, curr.bbox[3]);
  }

  if (yCutIdx !== null) {
    const topLines = linesY.slice(0, yCutIdx);
    const bottomLines = linesY.slice(yCutIdx);
    return [
      ...recursiveXYCut(topLines, minGutterWidth, minParaGap),
      ...recursiveXYCut(bottomLines, minGutterWidth, minParaGap),
    ];
  }

  return linesY;
}

async function parsePdfInBrowser(pdfDoc) {
  const t0 = performance.now();
  const totalPages = pdfDoc.numPages;
  const pagesMeta = [];
  const allSegments = [];
  let segId = 0;
  const sentenceEndRegex = /[.?!…]$/;

  // Headers and footers are a document-level property. Detect text repeated in
  // the page margins before building the reading order so it never reaches TTS.
  const marginalPages = new Map();
  const pageSources = [];
  const normalizeMarginal = (text) =>
    text.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const page = await pdfDoc.getPage(pageIdx + 1);
    const viewport = page.getViewport({ scale: 1.0 });
    const { height } = viewport;
    const { items = [] } = await page.getTextContent({
      normalizeWhitespace: false,
    });
    pageSources.push({ viewport, items });
    const seen = new Set();
    for (const item of items) {
      const text = item.str?.trim();
      if (!text) continue;
      const itemHeight = Math.max(
        8,
        item.height || Math.abs(item.transform[3]) || 10,
      );
      const top = height - item.transform[5] - itemHeight;
      const bottom = top + itemHeight;
      if (top > height * 0.09 && bottom < height * 0.91) continue;
      const key = normalizeMarginal(text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (!marginalPages.has(key)) marginalPages.set(key, new Set());
      marginalPages.get(key).add(pageIdx);
    }
  }
  const repeatThreshold = Math.max(2, Math.ceil(totalPages * 0.5));
  const repeatedMarginals = new Set(
    [...marginalPages]
      .filter(([, pages]) => pages.size >= repeatThreshold)
      .map(([text]) => text),
  );

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const { viewport, items: rawItems } = pageSources[pageIdx];
    const pw = viewport.width;
    const ph = viewport.height;
    pagesMeta.push({
      page: pageIdx,
      width: Math.round(pw * 10) / 10,
      height: Math.round(ph * 10) / 10,
    });

    if (rawItems.length === 0) continue;

    const lineBuckets = [];
    const LINE_Y_TOLERANCE = 4.0;

    for (const item of rawItems) {
      const str = item.str;
      if (!str || !str.trim()) continue;

      const tx = item.transform[4];
      const ty = item.transform[5];
      const itemH = Math.max(
        8,
        item.height || Math.abs(item.transform[3]) || 10,
      );
      const itemW =
        item.width || str.length * Math.abs(item.transform[0]) * 0.55;
      const topY = ph - ty - itemH;
      const bottomY = topY + itemH;
      const leftX = tx;
      const rightX = tx + itemW;

      if (topY < ph * 0.09 || bottomY > ph * 0.91) {
        const marginText = str.trim();
        if (
          /^\s*(?:page\s*)?\d+(?:\s*(?:of|\/)\s*\d+)?\s*$/i.test(marginText) ||
          repeatedMarginals.has(normalizeMarginal(marginText))
        )
          continue;
      }

      const fontName = (item.fontName || "").toLowerCase();
      const isMono =
        /mono|courier|consolas|inconsolata|menlo|typewriter|fixed|code|source/i.test(
          fontName,
        );

      let matchedBucket = null;
      for (const bucket of lineBuckets) {
        if (Math.abs(bucket.y - topY) <= LINE_Y_TOLERANCE) {
          matchedBucket = bucket;
          break;
        }
      }
      if (!matchedBucket) {
        matchedBucket = { y: topY, items: [] };
        lineBuckets.push(matchedBucket);
      }
      matchedBucket.items.push({
        text: str,
        bbox: [leftX, topY, rightX, bottomY],
        isMono,
      });
    }

    lineBuckets.sort((a, b) => a.y - b.y);

    const rawLines = [];
    for (const bucket of lineBuckets) {
      bucket.items.sort((a, b) => a.bbox[0] - b.bbox[0]);
      const groups = [];
      for (const item of bucket.items) {
        const previous = groups.at(-1)?.at(-1);
        const height = item.bbox[3] - item.bbox[1];
        if (
          previous &&
          item.bbox[0] - previous.bbox[2] > Math.max(24, height * 2.25)
        )
          groups.push([]);
        if (!groups.length) groups.push([]);
        groups.at(-1).push(item);
      }

      for (const items of groups) {
        const fullText = items
          .map((it) => it.text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (!fullText) continue;

        const minX = Math.min(...items.map((it) => it.bbox[0]));
        const minY = Math.min(...items.map((it) => it.bbox[1]));
        const maxX = Math.max(...items.map((it) => it.bbox[2]));
        const maxY = Math.max(...items.map((it) => it.bbox[3]));
        const isMonoLine = items.some((it) => it.isMono);
        const codeFlag = isCodeLine(fullText, isMonoLine);

        const words = [];
        const charWidth = (maxX - minX) / Math.max(1, fullText.length);
        const rawWords = fullText.split(" ");
        let curPos = 0;
        for (const w of rawWords) {
          if (!w) continue;
          const wStart = fullText.indexOf(w, curPos);
          const wEnd = wStart + w.length;
          curPos = wEnd;
          words.push({
            text: w,
            bbox: [
              minX + wStart * charWidth,
              minY,
              minX + wEnd * charWidth,
              maxY,
            ],
          });
        }

        rawLines.push({
          bbox: [minX, minY, maxX, maxY],
          words,
          text: fullText,
          is_code: codeFlag,
        });
      }
    }

    if (rawLines.length === 0) continue;

    const orderedLines = recursiveXYCut(rawLines);

    let currProseWords = [];
    let prevLineY0 = null,
      prevLineY1 = null;

    function flushProse() {
      if (currProseWords.length === 0) return;
      const sText = currProseWords
        .map((w) => w.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      let cleanText = sText.replace(/(\w+)-\s+(\w+)/g, "$1$2");
      cleanText = cleanText.replace(/([a-zA-Z\)])([.?!…])\d+\b/g, "$1$2");
      cleanText = cleanText.replace(/([a-zA-Z]{3,})\d+\b/g, "$1");

      const linesMap = {};
      currProseWords.forEach((w) => {
        const lid = w.line_id || 0;
        if (!linesMap[lid]) linesMap[lid] = [];
        linesMap[lid].push(w);
      });

      const boxes = [];
      Object.values(linesMap).forEach((lw) => {
        const bx0 =
          Math.round((Math.min(...lw.map((it) => it.bbox[0])) / pw) * 10000) /
          100;
        const by0 =
          Math.round((Math.min(...lw.map((it) => it.bbox[1])) / ph) * 10000) /
          100;
        const bx1 =
          Math.round((Math.max(...lw.map((it) => it.bbox[2])) / pw) * 10000) /
          100;
        const by1 =
          Math.round((Math.max(...lw.map((it) => it.bbox[3])) / ph) * 10000) /
          100;
        boxes.push({
          x: bx0,
          y: by0,
          w: Math.max(0.1, Math.round((bx1 - bx0) * 100) / 100),
          h: Math.max(0.1, Math.round((by1 - by0) * 100) / 100),
        });
      });
      const wordBoxes = currProseWords.map((word) => ({
        text: word.text,
        x: Math.round((word.bbox[0] / pw) * 10000) / 100,
        y: Math.round((word.bbox[1] / ph) * 10000) / 100,
        w:
          Math.max(
            10,
            Math.round(((word.bbox[2] - word.bbox[0]) / pw) * 10000),
          ) / 100,
        h:
          Math.max(
            10,
            Math.round(((word.bbox[3] - word.bbox[1]) / ph) * 10000),
          ) / 100,
      }));

      const verb = verbalizeSegmentNative(cleanText, false);
      if (cleanText.length > 1) {
        allSegments.push({
          id: segId++,
          page: pageIdx,
          text: verb.speech_text,
          original_text: sText,
          speech_text: verb.speech_text,
          boxes,
          word_boxes: wordBoxes,
          is_code: false,
          transformed: verb.transformed,
          verbalizer: verb.verbalizer,
          explanation: verb.explanation,
        });
      }
      currProseWords = [];
    }

    for (let lineId = 0; lineId < orderedLines.length; lineId++) {
      const line = orderedLines[lineId];
      const lineText = line.text.trim();
      const lineBbox = line.bbox;
      const isCode = line.is_code;

      if (prevLineY1 !== null) {
        const gap = lineBbox[1] - prevLineY1;
        const lineHeight = lineBbox[3] - lineBbox[1];
        const movedToNextColumn = lineBbox[1] + lineHeight < prevLineY0;
        if (gap > Math.max(8.0, lineHeight * 1.3) || movedToNextColumn) {
          flushProse();
        }
      }
      prevLineY0 = lineBbox[1];
      prevLineY1 = lineBbox[3];

      if (isCode) {
        flushProse();
        const verb = verbalizeSegmentNative(lineText, true);
        const bx0 = Math.round((lineBbox[0] / pw) * 10000) / 100;
        const by0 = Math.round((lineBbox[1] / ph) * 10000) / 100;
        const bx1 = Math.round((lineBbox[2] / pw) * 10000) / 100;
        const by1 = Math.round((lineBbox[3] / ph) * 10000) / 100;
        allSegments.push({
          id: segId++,
          page: pageIdx,
          text: verb.speech_text,
          original_text: lineText,
          speech_text: verb.speech_text,
          boxes: [
            {
              x: bx0,
              y: by0,
              w: Math.max(0.1, Math.round((bx1 - bx0) * 100) / 100),
              h: Math.max(0.1, Math.round((by1 - by0) * 100) / 100),
            },
          ],
          word_boxes: line.words.map((word) => ({
            text: word.text,
            x: Math.round((word.bbox[0] / pw) * 10000) / 100,
            y: Math.round((word.bbox[1] / ph) * 10000) / 100,
            w:
              Math.max(
                10,
                Math.round(((word.bbox[2] - word.bbox[0]) / pw) * 10000),
              ) / 100,
            h:
              Math.max(
                10,
                Math.round(((word.bbox[3] - word.bbox[1]) / ph) * 10000),
              ) / 100,
          })),
          is_code: true,
          transformed: verb.transformed,
          verbalizer: verb.verbalizer,
          explanation: verb.explanation,
        });
        continue;
      }

      for (const w of line.words) {
        const wCopy = { ...w, line_id: lineId };
        currProseWords.push(wCopy);
        const cleanW = wCopy.text.replace(/\d+$/, "");
        if (
          sentenceEndRegex.test(cleanW) &&
          cleanW.length > 1 &&
          !/\d+\.\d+$/.test(wCopy.text)
        ) {
          flushProse();
        }
      }
    }
    flushProse();
  }

  const parseTime = Math.round(performance.now() - t0);
  return {
    num_pages: totalPages,
    pages: pagesMeta,
    segments: allSegments,
    total_segments: allSegments.length,
    parse_time_ms: parseTime,
  };
}

export {
  isCodeLine,
  verbalizeRuleBasedNative,
  verbalizeSegmentNative,
  recursiveXYCut,
  parsePdfInBrowser,
};
