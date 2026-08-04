import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm } from '@/features/auth/login-form';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/api/auth', () => ({ authApi: { login: vi.fn().mockRejectedValue(new Error('no network')) } }));
describe('LoginForm', () => {
  it('exposes labelled inputs and announces an unsuccessful sign-in', async () => {
    render(<LoginForm />); fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'person@example.test' } }); fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } }); fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to sign in'); expect(replace).not.toHaveBeenCalled();
  });
});
