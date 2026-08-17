'use client';

import { Children, isValidElement, KeyboardEvent, ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import styles from './searchable-select.module.css';

type SelectChangeEvent = { target: { value: string }; currentTarget: { value: string } };
type OptionProps = { value?: string | number; disabled?: boolean; children?: ReactNode };

interface SearchableSelectProps {
  children: ReactNode;
  name?: string;
  value?: string;
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  showAvatar?: boolean;
  'aria-label'?: string;
  onChange?: (event: SelectChangeEvent) => void;
}

const textOf = (value: ReactNode): string => Children.toArray(value).map(item => typeof item === 'string' || typeof item === 'number' ? String(item) : '').join('');
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
const initials = (value: string) => value.split(/[@ ._-]/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'U';

export function SearchableSelect({ children, name, value, defaultValue, required, disabled, className, showAvatar = false, 'aria-label': ariaLabel, onChange }: SearchableSelectProps) {
  const listboxId = useId();
  const options = useMemo(() => Children.toArray(children).flatMap(child => {
    if (!isValidElement<OptionProps>(child)) return [];
    const label = textOf(child.props.children);
    return [{ value: child.props.value === undefined ? label : String(child.props.value), label, disabled: Boolean(child.props.disabled) }];
  }), [children]);
  const controlled = value !== undefined;
  const initialValue = defaultValue ?? options.find(option => !option.disabled)?.value ?? '';
  const [internalValue, setInternalValue] = useState(initialValue);
  const selectedValue = controlled ? value : internalValue;
  const selected = options.find(option => option.value === selectedValue);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const keyword = normalize(query);
    return options.filter(option => !keyword || normalize(option.label).includes(keyword));
  }, [options, query]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (!open || !query) return;
    const exact = options.find(option => !option.disabled && (option.value === query || normalize(option.label) === normalize(query)));
    if (!exact) return;
    const timer = window.setTimeout(() => {
      if (!controlled) setInternalValue(exact.value);
      onChange?.({ target: { value: exact.value }, currentTarget: { value: exact.value } });
      setQuery('');
      setOpen(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [controlled, onChange, open, options, query]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.setCustomValidity(required && !selectedValue ? 'Vui lòng chọn một giá trị.' : '');
  }, [required, selectedValue]);

  useEffect(() => {
    const form = rootRef.current?.closest('form');
    if (!form || controlled) return;
    const reset = () => { setInternalValue(initialValue); setQuery(''); setOpen(false); };
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [controlled, initialValue]);

  const choose = (nextValue: string) => {
    const option = options.find(candidate => candidate.value === nextValue);
    if (option?.disabled) return;
    if (!controlled) setInternalValue(nextValue);
    onChange?.({ target: { value: nextValue }, currentTarget: { value: nextValue } });
    setQuery('');
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(current => {
        let next = Math.max(0, Math.min(filtered.length - 1, current + direction));
        while (next >= 0 && next < filtered.length && filtered[next].disabled) next += direction;
        return Math.max(0, Math.min(filtered.length - 1, next));
      });
    } else if (event.key === 'Enter' && open && filtered[activeIndex] && !filtered[activeIndex].disabled) {
      event.preventDefault();
      choose(filtered[activeIndex].value);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return <div ref={rootRef} className={`${styles.root} ${className ?? ''}`}>
    {name && <input type="hidden" name={name} value={selectedValue} aria-hidden="true" />}
<div className={`${styles.control} ${open ? styles.open : ''} ${disabled ? styles.disabled : ''}`}>
      {showAvatar && selected && <b className={styles.avatar}>{initials(selected.label)}</b>}
      <input ref={inputRef} type="text" role="combobox" aria-label={ariaLabel} aria-expanded={open} aria-controls={listboxId} aria-autocomplete="list" aria-required={required} disabled={disabled} required={required} value={open ? query : selected?.label ?? ''} placeholder={selected?.label || 'Chọn hoặc nhập để tìm'} autoComplete="off" onFocus={() => { setOpen(true); setQuery(''); setActiveIndex(0); }} onChange={event => { const typed = event.target.value; const exact = options.find(option => !option.disabled && (option.value === typed || normalize(option.label) === normalize(typed))); if (exact) { choose(exact.value); return; } setQuery(typed); setOpen(true); setActiveIndex(0); }} onKeyDown={keyDown} />
      <button type="button" tabIndex={-1} aria-hidden="true" disabled={disabled} onClick={() => { setOpen(current => !current); setQuery(''); inputRef.current?.focus(); }}>⌄</button>
    </div>
    {open && !disabled && <div id={listboxId} className={styles.menu} role="listbox">
      {filtered.length > 0 ? filtered.map((option, index) => option.disabled ? <button type="button" role="option" aria-selected="false" aria-disabled="true" disabled className={`${styles.option} ${styles.disabledOption}`} key={`${option.value}-${index}`}><span>{option.label}</span><i>Đã cấp</i></button> : <button type="button" role="option" aria-selected={option.value === selectedValue} className={`${styles.option} ${index === activeIndex ? styles.active : ''} ${option.value === selectedValue ? styles.selected : ''}`} key={`${option.value}-${index}`} onMouseEnter={() => setActiveIndex(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(option.value)}>{showAvatar && <b className={styles.avatar}>{initials(option.label)}</b>}<span>{option.label}</span>{option.value === selectedValue && <i>✓</i>}</button>) : <p className={styles.empty}>Không tìm thấy kết quả phù hợp</p>}
    </div>}
  </div>;
}