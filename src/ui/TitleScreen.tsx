import { TitleBackdrop } from './fx';
import { HallOfFame } from './HallOfFame';
import { SettingsButton } from './Settings';
import { loadScores, store } from './store';

export function TitleScreen() {
  const hasSave = store.hasSave();
  const scores = loadScores();
  return (
    <div className="title">
      <TitleBackdrop />
      <div className="title-content">
        <div className="title-kicker">Est. 1849</div>
        <h1>GoldRush</h1>
        {!hasSave && <p className="title-hint">New here? Start with the tutorial: it walks you through your first profitable mine.</p>}
        <div className="title-btns">
          {hasSave && <button onClick={() => store.load()}>Continue</button>}
          <button className={hasSave ? 'secondary' : 'pulse'} onClick={() => store.newTutorial()} title="A guided first mine, step by step">
            🎓 Tutorial
          </button>
          <button onClick={() => store.newGame()}>New game</button>
          <SettingsButton className="secondary" label="⚙ Settings" />
        </div>
        {scores.length > 0 && (
          <div className="panel scores-panel">
            <h3>Hall of fame</h3>
            <HallOfFame scores={scores} />
          </div>
        )}
      </div>
    </div>
  );
}
