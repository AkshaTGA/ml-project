// Tiny safe arithmetic evaluator for agent-made calculators (no eval).
// Supports numbers, variables, + - * / ^ %, parentheses and round/ceil/floor/min/max/abs/sqrt.

const FUNCS = {
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
  ceil: Math.ceil, floor: Math.floor, min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt,
}

function tokenize(src) {
  const text = src.trim()
  const tokens = []
  const re = /\s*(\d+\.?\d*|\.\d+|[A-Za-z_][A-Za-z0-9_]*|[-+*/^%(),])/y
  let pos = 0
  while (pos < text.length) {
    re.lastIndex = pos
    const m = re.exec(text)
    if (!m) throw new Error('Bad formula')
    tokens.push(m[1])
    pos = re.lastIndex
  }
  return tokens
}

export function evaluate(formula, vars) {
  const tokens = tokenize(String(formula))
  let i = 0
  const peek = () => tokens[i]
  const take = (t) => { if (tokens[i] !== t) throw new Error(`Expected ${t}`); i++ }

  function primary() {
    const t = tokens[i++]
    if (t === undefined) throw new Error('Unexpected end')
    if (t === '(') { const v = expr(); take(')'); return v }
    if (t === '-') return -primary()
    if (t === '+') return primary()
    if (/^[\d.]/.test(t)) return parseFloat(t)
    if (peek() === '(' && Object.hasOwn(FUNCS, t)) {
      take('(')
      const args = []
      if (peek() !== ')') { args.push(expr()); while (peek() === ',') { i++; args.push(expr()) } }
      take(')')
      return FUNCS[t](...args)
    }
    if (Object.hasOwn(vars, t)) return Number(vars[t]) || 0
    throw new Error(`Unknown name ${t}`)
  }
  function power() { const b = primary(); return peek() === '^' ? (i++, b ** power()) : b }
  function term() {
    let v = power()
    while (['*', '/', '%'].includes(peek())) {
      const op = tokens[i++]
      const r = power()
      v = op === '*' ? v * r : op === '/' ? v / r : v % r
    }
    return v
  }
  function expr() {
    let v = term()
    while (peek() === '+' || peek() === '-') v = tokens[i++] === '+' ? v + term() : v - term()
    return v
  }

  const value = expr()
  if (i !== tokens.length) throw new Error('Unexpected input')
  return value
}
