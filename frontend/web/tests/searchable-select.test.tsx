import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SearchableSelect } from '@/components/searchable-select';

afterEach(cleanup);

it('filters options as the user types and submits the selected value through FormData', () => {
  const submit = vi.fn();
  render(<form onSubmit={event => { event.preventDefault(); submit(String(new FormData(event.currentTarget).get('actor_id'))); }}><label>Người nhận<SearchableSelect name="actor_id" defaultValue="" required><option value="" disabled>Chọn nhân viên</option><option value="one">archivist@c17.local</option><option value="two">codex-direct@example.com</option><option value="three">codex-owner@example.com</option></SearchableSelect></label><button>Gửi</button></form>);

  const input = screen.getByRole('combobox', { name: 'Người nhận' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'direct' } });
  expect(screen.getByRole('option', { name: 'codex-direct@example.com' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'archivist@c17.local' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'codex-direct@example.com' }));
  fireEvent.click(screen.getByRole('button', { name: 'Gửi' }));
  expect(submit).toHaveBeenCalledWith('two');
});

it('matches Vietnamese labels without requiring accents and supports keyboard selection', () => {
  render(<label>Trạng thái<SearchableSelect defaultValue=""><option value="">Tất cả</option><option value="review">Chờ rà soát</option><option value="approved">Đã phê duyệt</option></SearchableSelect></label>);
  const input = screen.getByRole('combobox', { name: 'Trạng thái' });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'ra soat' } });
  expect(screen.getByRole('option', { name: 'Chờ rà soát' })).toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input).toHaveValue('Chờ rà soát');
});