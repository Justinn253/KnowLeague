import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Randodraft } from '@/components/randodraft';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/ui-sounds', () => ({ playUiSound: vi.fn() }));
vi.mock('@/lib/auth-session-client', () => ({ subscribeToAuthSession: (listener: (session: null) => void) => { listener(null); return () => {}; } }));

function spin(label: string) {
  fireEvent.click(screen.getByRole('button', { name: `Spin ${label}` }));
  act(() => { vi.advanceTimersByTime(1650); });
}
function start() {
  fireEvent.click(screen.getByRole('button', { name: 'Play', exact: true }));
}

describe('Randodraft game flow', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(0); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('shows the compact settings/history lobby and all three Random build options', () => {
    render(<Randodraft />);
    expect(screen.queryByText('Pre-game lobby')).not.toBeInTheDocument();
    expect(screen.queryByText('Ready to draft')).not.toBeInTheDocument();
    expect(screen.queryByText('Five picks. Make them count.')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Game settings' })).getByRole('button', { name: 'Play', exact: true })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Recent drafts' })).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    fireEvent.click(screen.getByRole('button', { name: 'No random build types' }));
    expect(screen.getByRole('option', { name: /Allow random build types/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /All build types are random/ }));
    start();
    spin('Type');
    expect(screen.getByRole('button', { name: /Type locked: Random/ })).toBeDisabled();
  });

  it('plays all five picks in any order, rolls or skips builds, then shows the map', () => {
    render(<Randodraft />);
    expect(screen.queryByRole('switch', { name: 'Random build path' })).not.toBeInTheDocument();
    start();
    expect(screen.queryByRole('button', { name: 'Choose Champion manually' })).not.toBeInTheDocument();
    for (let index = 0; index < 5; index++) {
      const nextName = index === 4 ? 'Finish' : 'Next';
      expect(screen.getByRole('button', { name: nextName })).toBeDisabled();
      spin('Type');
      spin('Lane');
      expect(screen.queryByRole('button', { name: 'Spin Build path' })).not.toBeInTheDocument();
      spin('Champion');
      expect(screen.getByRole('button', { name: nextName })).toBeEnabled();
      if (index === 0) {
        spin('Build path');
        expect(screen.getByRole('button', { name: /Build path locked/ })).toBeDisabled();
      }
      fireEvent.click(screen.getByRole('button', { name: nextName }));
    }
    expect(screen.getByRole('heading', { name: 'Your team on the Rift' })).toBeInTheDocument();
    const mapButtons = screen.getAllByRole('button', { name: /^(Top|Jungle|Mid|Support|Bot):/ });
    expect(mapButtons).toHaveLength(5);
    fireEvent.click(mapButtons[1]);
    expect(mapButtons[1]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'New draft' }));
    expect(screen.getByRole('button', { name: 'Play', exact: true })).toBeInTheDocument();
  });

  it('spends manual selections per category and resets them for the next pick', () => {
    render(<Randodraft />);
    fireEvent.click(screen.getByRole('button', { name: '0 · Spin all categories' }));
    fireEvent.click(screen.getByRole('option', { name: /2 · Choose two categories/ }));
    start();
    fireEvent.click(screen.getByRole('button', { name: 'Choose Champion manually' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search Champion' }), { target: { value: 'Ahri' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ahri', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose Lane manually' }));
    fireEvent.click(screen.getByRole('button', { name: 'Top', exact: true }));
    expect(screen.getByRole('button', { name: 'Choose Type manually' })).toBeDisabled();
    spin('Type');
    expect(screen.getByRole('button', { name: 'Spin Build path' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('2 manual selections remaining this pick')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose Lane manually' }));
    expect(screen.queryByRole('button', { name: 'Top', exact: true })).not.toBeInTheDocument();
  });

  it('blocks actions during a spin and cancels callbacks when returning to the lobby', () => {
    render(<Randodraft />);
    start();
    fireEvent.click(screen.getByRole('button', { name: 'Spin Champion' }));
    expect(screen.getByRole('button', { name: 'Spin Lane' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to lobby' }));
    start();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('button', { name: 'Spin Champion' })).toBeEnabled();
    expect(within(screen.getByRole('region', { name: 'Current team' })).getByText('0 / 5 complete')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to lobby' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to games' }));
    expect(push).toHaveBeenCalledWith('/games');
  });
});
