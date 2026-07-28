// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

/**
 * A number input that lets you type freely — including an empty box or a
 * half-finished decimal — and only reports a value once it parses.
 */
export function NumberInput({
  value,
  onChange,
  suffix,
  min,
  max,
  step = 'any',
  label,
  hint,
}: {
  value: number
  onChange: (v: number) => void
  suffix?: string
  min?: number
  max?: number
  step?: number | 'any'
  label?: string
  hint?: string
}) {
  const [text, setText] = useState(String(value))
  const focused = useRef(false)
  const id = useId()

  useEffect(() => {
    if (!focused.current) setText(String(value))
  }, [value])

  const commit = (raw: string) => {
    setText(raw)
    if (raw.trim() === '' || raw === '-' || raw.endsWith('.')) return
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    let next = parsed
    if (min != null) next = Math.max(min, next)
    if (max != null) next = Math.min(max, next)
    onChange(next)
  }

  const input = (
    <input
      id={id}
      className="control numeric"
      type="number"
      inputMode="decimal"
      step={step}
      value={text}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
        setText(String(value))
      }}
      onChange={(e) => commit(e.target.value)}
    />
  )

  const body = suffix ? (
    <span className="suffix-wrap">
      {input}
      <span className="suffix">{suffix}</span>
    </span>
  ) : (
    input
  )

  if (!label) return body
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {body}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  hint,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label?: string
  hint?: string
}) {
  const id = useId()
  const select = (
    <select id={id} className="control" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
  if (!label) return select
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {select}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  label,
  hint,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  label?: string
  hint?: string
  placeholder?: string
}) {
  const id = useId()
  const input = (
    <input
      id={id}
      className="control"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
  if (!label) return input
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {input}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

export function Panel({
  title,
  note,
  children,
  actions,
}: {
  title: string
  note?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <section className="panel">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span>{title}</span>
        {actions ? <span style={{ marginLeft: 'auto' }}>{actions}</span> : null}
      </h3>
      {note ? <p className="panel-note">{note}</p> : null}
      {children}
    </section>
  )
}

export function Readout({
  label,
  value,
  unit,
  sub,
  tone,
}: {
  label: string
  value: string
  unit?: string
  sub?: string
  tone?: 'heat' | 'cool'
}) {
  return (
    <div className="readout">
      <span className="k">{label}</span>
      <div className={`v${tone ? ` ${tone}` : ''}`}>
        {value}
        {unit ? <span className="u">{unit}</span> : null}
      </div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  )
}
