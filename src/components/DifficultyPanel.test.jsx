import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../lib/engine.js';
import { DifficultyPanel } from './DifficultyPanel.jsx';

describe('DifficultyPanel', () => {
  it('renders every control group by default and marks the active difficulty', () => {
    render(<DifficultyPanel settings={DEFAULT_SETTINGS} onChange={() => {}} />);

    expect(screen.getByText('Schwierigkeit')).toBeInTheDocument();
    expect(screen.getByText('Streckenlänge')).toBeInTheDocument();
    expect(screen.getByText('Antwortmöglichkeiten')).toBeInTheDocument();

    const small = screen.getByRole('button', { name: /Kleines Einmaleins/ });
    expect(small).toHaveClass('segment-button--active');
  });

  it('reports difficulty changes through onChange', () => {
    const onChange = vi.fn();
    render(<DifficultyPanel settings={DEFAULT_SETTINGS} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Großes Einmaleins/ }));
    expect(onChange).toHaveBeenCalledWith('difficulty', 'large');
  });

  it('reports checkbox toggles through onChange', () => {
    const onChange = vi.fn();
    render(<DifficultyPanel settings={DEFAULT_SETTINGS} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('1er- und 2er-Reihe weglassen'));
    expect(onChange).toHaveBeenCalledWith('skipEasyRows', true);
  });

  it('reports answer-count changes through onChange', () => {
    const onChange = vi.fn();
    render(<DifficultyPanel settings={DEFAULT_SETTINGS} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /8\s*Antworten/ }));
    expect(onChange).toHaveBeenCalledWith('answerCount', 8);
  });

  it('hides groups that are not listed in fields', () => {
    render(<DifficultyPanel settings={DEFAULT_SETTINGS} onChange={() => {}} fields={['difficulty']} />);

    expect(screen.getByText('Schwierigkeit')).toBeInTheDocument();
    expect(screen.queryByText('Streckenlänge')).not.toBeInTheDocument();
    expect(screen.queryByText('Antwortmöglichkeiten')).not.toBeInTheDocument();
  });

  it('renders operation controls only when requested and prevents disabling the last operation', () => {
    const onChange = vi.fn();
    render(
      <DifficultyPanel
        settings={{ ...DEFAULT_SETTINGS, operations: { add: true, subtract: false, multiply: false, divide: false } }}
        onChange={onChange}
        fields={['operations']}
      />,
    );

    expect(screen.getByText('Rechenarten')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Plus/));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/Minus/));
    expect(onChange).toHaveBeenCalledWith('operations', {
      add: true,
      subtract: true,
      multiply: false,
      divide: false,
    });
  });

  it('renders children below the controls', () => {
    render(
      <DifficultyPanel settings={DEFAULT_SETTINGS} onChange={() => {}}>
        <p>Vorschau-Text</p>
      </DifficultyPanel>,
    );
    expect(screen.getByText('Vorschau-Text')).toBeInTheDocument();
  });
});
