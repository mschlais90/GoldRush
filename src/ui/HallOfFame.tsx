import { money } from './format';
import type { ScoreEntry } from './store';

/** Top scores as a table: numbers right-aligned so magnitudes line up, text left-aligned. */
export function HallOfFame({ scores }: { scores: ScoreEntry[] }) {
  return (
    <table className="scores">
      <thead>
        <tr>
          <th className="num">#</th>
          <th className="num">Net worth</th>
          <th className="num">Return/yr</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {scores.slice(0, 8).map((sc, i) => (
          <tr key={i}>
            <td className="num muted">{i + 1}</td>
            <td className="num">
              <b>{money(sc.netWorth)}</b>
            </td>
            <td className={`num ${sc.annual >= 0 ? 'pos' : 'neg'}`}>{(sc.annual * 100).toFixed(0)}%</td>
            <td className="muted">{sc.date}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
