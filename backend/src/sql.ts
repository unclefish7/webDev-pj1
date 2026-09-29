/** 按 SQL 字符串/注释边界分割语句，不按行或逗号拆分教师数据。 */
export function splitSql(input: string): string[] {
  const statements: string[] = [];
  let current = '';
  let quote = '';
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const next = input[i + 1];
    if (lineComment) { if (c === '\n') { lineComment = false; current += '\n'; } continue; }
    if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      current += c;
      if (c === '\\' && next !== undefined) { current += next; i++; }
      else if (c === quote) {
        if (next === quote) { current += next; i++; } else quote = '';
      }
      continue;
    }
    if (c === '-' && next === '-' && /\s/.test(input[i + 2] || '')) { lineComment = true; i++; continue; }
    if (c === '#') { lineComment = true; continue; }
    if (c === '/' && next === '*') { blockComment = true; current += ' '; i++; continue; }
    if (c === "'" || c === '"' || c === '`') quote = c;
    if (c === ';') { if (current.trim()) statements.push(current.trim()); current = ''; }
    else current += c;
  }
  if (quote || blockComment) throw new Error('SQL 文件包含未闭合字符串或注释');
  if (current.trim()) statements.push(current.trim());
  return statements;
}
