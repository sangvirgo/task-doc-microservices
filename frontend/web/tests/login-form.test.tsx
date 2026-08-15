import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '@/features/auth/login-form';
import { GatewayError } from '@/lib/errors';

const mocks = vi.hoisted(() => ({ replace: vi.fn(), login: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/api/auth', () => ({ authApi: { login: mocks.login } }));

const submit = () => {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'person@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
};

describe('LoginForm', () => {
  afterEach(cleanup);
  beforeEach(() => { mocks.replace.mockReset(); mocks.login.mockReset(); });

  it('exposes labelled inputs and announces an unsuccessful sign-in', async () => {
    mocks.login.mockRejectedValue(new Error('no network'));
    render(<LoginForm />);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to sign in');
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('reports a locked account instead of claiming the session expired', async () => {
    mocks.login.mockRejectedValue(new GatewayError(401, 'Account is locked'));
    render(<LoginForm />);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Tài khoản đã bị khóa');
    expect(screen.queryByText(/session|phiên làm việc đã hết hạn/i)).not.toBeInTheDocument();
  });
});