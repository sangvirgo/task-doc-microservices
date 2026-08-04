import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NetworkBanner } from '@/components/network-banner';

describe('NetworkBanner', () => {
  it('announces that saving is unavailable while offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    render(<NetworkBanner />);
    expect(await screen.findByRole('status')).toHaveTextContent('Changes cannot be saved');
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });
});
