import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Randodraft } from '@/components/randodraft';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/ui-sounds', () => ({ playUiSound: vi.fn() }));
vi.mock('@/lib/auth-session-client', () => ({ subscribeToAuthSession: (listener: (session: null) => void) => { listener(null); return () => {}; } }));

function spin(label: string) {
  fireEvent.click(screen.getByRole('button', { name: `Spin ${label}` }));
  act(() => { vi.advanceTimersByTime(2475); });
}
function start() {
  fireEvent.click(screen.getByRole('button', { name: 'Play', exact: true }));
}

describe('Randodraft game flow', () => {
  beforeEach(() => { window.localStorage.clear(); vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(0); });
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
    expect(screen.getByRole('button', { name: /Class locked: Random/ })).toBeDisabled();
  });

  it('plays all five picks in any order, requires every build, then shows the map', () => {
    render(<Randodraft />);
    expect(screen.queryByRole('switch', { name: 'Random build path' })).not.toBeInTheDocument();
    start();
    expect(screen.queryByRole('button', { name: 'Choose Champion manually' })).not.toBeInTheDocument();
    for (let index = 0; index < 5; index++) {
      const nextName = index === 4 ? 'Finish' : 'Next';
      expect(screen.getByRole('button', { name: nextName })).toBeDisabled();
      spin('Class');
      spin('Lane');
      expect(screen.queryByRole('button', { name: 'Spin Build path' })).not.toBeInTheDocument();
      spin('Champion');
      expect(screen.getByRole('button', { name: nextName })).toBeDisabled();
      {
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
    expect(screen.getByRole('heading', { name: 'Pick 1 1/5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spin Champion' })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Choose Class manually' })).toBeDisabled();
    spin('Class');
    expect(screen.getByRole('button', { name: 'Spin Build path' })).toBeEnabled();
    spin('Build path');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('2 manual selections remaining this pick')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Choose Lane manually' }));
    expect(screen.queryByRole('button', { name: 'Top', exact: true })).not.toBeInTheDocument();
  });

  it('allows other categories to spin and cancels callbacks when returning to the lobby', () => {
    render(<Randodraft />);
    start();
    fireEvent.click(screen.getByRole('button', { name: 'Spin Champion' }));
    expect(screen.getByRole('button', { name: 'Spin Lane' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to lobby' }));
    start();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByRole('button', { name: 'Spin Champion' })).toBeEnabled();
    expect(within(screen.getByRole('region', { name: 'Current team' })).getByText('0 / 5 complete')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to lobby' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to games' }));
    expect(push).toHaveBeenCalledWith('/games');
  });

  it('allows overlapping category spins and waits for the last one before advancing', () => {
    render(<Randodraft />);
    start();
    fireEvent.click(screen.getByRole('button', { name: 'Spin Champion' }));
    act(() => vi.advanceTimersByTime(500));
    fireEvent.click(screen.getByRole('button', { name: 'Spin Lane' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spin Class' }));
    expect(screen.getByRole('button', { name: 'Finish Champion spin' })).toBeEnabled();
    act(() => vi.advanceTimersByTime(1975));
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Champion category' })).toHaveClass('border-emerald-300/70');
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    spin('Build path');
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    for (const label of ['Champion', 'Lane', 'Class']) {
      const category = screen.getByRole('region', { name: label + ' category' });
      expect(within(category).getByRole('button', { name: 'Spin ' + label })).toBeEnabled();
      expect(category).not.toHaveClass('border-emerald-300/70');
      expect(within(category).queryByRole('button', { name: /locked:/ })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Spin Build path' })).not.toBeInTheDocument();
  });

  it('replaces the reel with manual choices and restores it when toggled closed', () => {
    render(<Randodraft />);
    fireEvent.click(screen.getByRole('button', { name: /Spin all categories/ }));
    fireEvent.click(screen.getByRole('option', { name: /Choose two categories/ }));
    start();
    const card = screen.getByRole('region', { name: 'Champion category' });
    const toggle = within(card).getByRole('button', { name: 'Choose Champion manually' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(card).queryByRole('button', { name: 'Spin Champion' })).not.toBeInTheDocument();
    expect(within(card).getByRole('textbox', { name: 'Search Champion' })).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(card).getByRole('button', { name: 'Spin Champion' })).toBeEnabled();
    expect(within(card).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('edits pick labels and keeps completed builds with the team when advancing', () => {
    render(<Randodraft />);
    start();
    expect(screen.queryByText('Lock all three categories to continue.')).not.toBeInTheDocument();
    expect(screen.queryByText(/League catalogue/)).not.toBeInTheDocument();
    for (const text of ['Who joins your team?', 'One pick for every lane.', 'Choose their build direction.', 'Let the draft unfold']) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Edit pick 1 name' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Pick 1 name' }), { target: { value: 'Carry' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save pick 1 name' }));
    spin('Champion'); spin('Lane'); spin('Class');
    spin('Build path');
    const team = screen.getByRole('region', { name: 'Current team' });
    const build = within(team).getByRole('list', { name: 'Carry build' });
    expect(within(build).getAllByRole('listitem')).toHaveLength(6);
    expect(within(build).getAllByRole('tooltip', { hidden: true }).every((note) => !!note.textContent)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(within(team).getByText('Carry')).toBeInTheDocument();
    expect(within(team).getByRole('list', { name: 'Carry build' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pick 2 2/5' })).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: 'Champion category' })).toHaveLength(1);
  });

  it('resumes locally after the first completed pick without saving progress to the backend', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const first = render(<Randodraft />);
    start();
    expect(screen.queryByText(/manual selections remaining this pick/)).not.toBeInTheDocument();
    spin('Champion'); spin('Lane'); spin('Class'); spin('Build path');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    first.unmount();
    render(<Randodraft />);
    fireEvent.click(screen.getByRole('button', { name: /Resume Randodraft/ }));
    expect(screen.getByRole('heading', { name: 'Pick 2 2/5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const saved = JSON.parse(window.localStorage.getItem('knowleague:randodraft:progress:v1:guest')!);
    expect(saved.state.picks).toHaveLength(1);
    expect(saved.state.picks[0].build).toHaveLength(6);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('supports ARAM without lanes and renders the Howling Abyss results map', () => {
    render(<Randodraft />);
    fireEvent.click(screen.getByRole('button', { name: /Summoner's Rift/ }));
    fireEvent.click(screen.getByRole('option', { name: /^ARAM/ }));
    start();
    expect(screen.queryByRole('region', { name: 'Lane category' })).not.toBeInTheDocument();
    for (let index = 0; index < 5; index++) {
      spin('Champion');
      spin('Class');
      spin('Build path');
      fireEvent.click(screen.getByRole('button', { name: index === 4 ? 'Finish' : 'Next' }));
    }
    expect(screen.getByRole('heading', { name: 'Your team on the Howling Abyss' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Pick [1-5]:/ })).toHaveLength(5);
  });

  it('renders source images directly and uses local lane and class icons', () => {
    const { container } = render(<Randodraft />);
    start();
    const sources = Array.from(container.querySelectorAll('img')).map((image) => image.getAttribute('src'));
    expect(sources.some((src) => src?.startsWith('/role-icons/'))).toBe(true);
    expect(sources.some((src) => src?.startsWith('/class-icons/'))).toBe(true);
    expect(sources.every((src) => !src?.includes('/_next/image'))).toBe(true);
    expect(container.querySelector('img[srcset]')).toBeNull();
  });
});
