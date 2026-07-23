import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameInfoMenu } from '@/components/game-info-menu';

describe('GameInfoMenu', () => {
  it('opens instructions and closes them again', async () => {
    const user = userEvent.setup();

    render(<GameInfoMenu title="Skindle" steps={['Make a guess', 'Use the clues']} />);

    expect(screen.queryByRole('heading', { name: 'Skindle' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'How to play Skindle' }));
    expect(screen.getByRole('heading', { name: 'Skindle' })).toBeInTheDocument();
    expect(screen.getByText('Make a guess')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close how to play' }));
    expect(screen.queryByRole('heading', { name: 'Skindle' })).not.toBeInTheDocument();
  });
});
