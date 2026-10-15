import { useEffect, useState } from 'react';
import { Clue, GRID_D, LAYER_M, cx, cy } from '../sim/geology/types';
import { pitBlocksRemaining } from '../sim/mining';
import { REGIONS } from '../sim/regions';
import type { Notice } from '../sim/state';
import { money } from './format';
import { ClueIcon, MapCanvas, type Overlay, type Tool } from './map/MapCanvas';
import { CellInfo, CoreLog, ExplorePanel, OVERLAYS } from './panels/ExplorePanel';
import { LandOffice } from './panels/LandOffice';
import { MinePanel } from './panels/MinePanel';
import { Achievements, GameOverModal, NewsFeed, NoticeModal } from './panels/Modals';
import { BankPanel, ReportPanel } from './panels/ReportPanel';
import { TopBar } from './panels/TopBar';
import { TitleScreen } from './TitleScreen';
import { store, useGame, useVersion } from './store';
import { Reveal3D } from './view3d/Reveal3D';
import { TutorialCoach, tutorialMarks, type RightTab, type TutorialUi } from './Tutorial';

export function App() {
  const s = useGame();
  const version = useVersion();
  const [propId, setPropId] = useState<number | null>(null);
  const [view, setView] = useState<'map' | '3d'>('map');
  const [tool, setTool] = useState<Tool>('inspect');
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [slice, setSlice] = useState(-1);
  const [drillDepth, setDrillDepth] = useState(12);
  const [rush, setRush] = useState(false);
  const [pitDepth, setPitDepth] = useState(4);
  const [stopeRange, setStopeRange] = useState<[number, number]>([4, 15]);
  const [trenchStart, setTrenchStart] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [holeId, setHoleId] = useState<number | null>(null);
  const [office, setOffice] = useState(false);
  const [tab, setTab] = useState<RightTab>('explore');
  const [showShell, setShowShell] = useState(true);
  const [xray, setXray] = useState(true);
  const [showTruth, setShowTruth] = useState(false);

  // keyboard shortcuts for time
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!store.state || (e.target as HTMLElement).tagName === 'INPUT') return;
      if (store.state.notices.some((n) => n.popup)) return;
      const days = e.key === ' ' ? 1 : e.key === 'w' ? 7 : e.key === 'm' ? 30 : 0;
      if (days) {
        e.preventDefault();
        store.dispatch({ type: 'advance', days });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // toast auto-hide
  const toast = store.toast;
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => store.clearToast(), 3500);
    return () => clearTimeout(t);
  }, [toast?.id]);

  if (!s) return <TitleScreen />;
  const tutUi: TutorialUi = { tab, overlay, view, office };

  const p = s.properties.find((x) => x.id === propId) ?? s.properties[0];
  const hole = p?.knowledge.holes.find((h) => h.id === holeId) ?? null;

  const onCellClick = (c: number) => {
    if (!p) return;
    const x = cx(c);
    const y = cy(c);
    switch (tool) {
      case 'inspect': {
        const h = p.knowledge.holes.find((hh) => hh.c === c);
        setHoleId(h ? h.id : null);
        break;
      }
      case 'walkover':
        store.dispatch({ type: 'walkover', propId: p.id, x, y });
        break;
      case 'pan':
        store.dispatch({ type: 'pan', propId: p.id, x, y });
        break;
      case 'soil':
        store.dispatch({ type: 'soil', propId: p.id, x, y });
        break;
      case 'trench':
        if (trenchStart === null) setTrenchStart(c);
        else {
          store.dispatch({ type: 'trench', propId: p.id, x0: cx(trenchStart), y0: cy(trenchStart), x1: x, y1: y });
          setTrenchStart(null);
        }
        break;
      case 'shaft':
        if (store.dispatch({ type: 'placeShaft', propId: p.id, x, y }).ok) setTool('inspect');
        break;
      case 'drill': {
        const r = store.dispatch({ type: 'drill', propId: p.id, x, y, depth: drillDepth, rush });
        if (r.ok) setHoleId(p.knowledge.holes[p.knowledge.holes.length - 1].id);
        break;
      }
    }
  };

  const selectTool = (t: Tool) => {
    setTool(t);
    setTrenchStart(null);
    if (t === 'pit') setOverlay('pit');
    if (t === 'stope') setOverlay('estimate');
  };

  const onNotice = (n: Notice) => {
    if (n.propId && s.properties.some((x) => x.id === n.propId)) setPropId(n.propId);
    if (n.holeId) {
      setHoleId(n.holeId);
      setTab('explore');
    }
  };

  return (
    <div className="app">
      <TopBar s={s} onQuit={() => store.quit()} />
      <div className="main">
        <aside className="left">
          <div className="panel">
            <h3>Your claims</h3>
            {s.properties.length === 0 && <div className="small muted">You don't own any land yet.</div>}
            {s.properties.map((x) => (
              <div key={x.id} className={`prop-card ${p?.id === x.id ? 'sel' : ''}`} onClick={() => setPropId(x.id)}>
                <b>{x.name}</b>
                <div className="small muted">{REGIONS[x.region].name}</div>
                <div className="small">
                  {x.permit !== 'granted'
                    ? `${x.knowledge.holes.length} holes · permit ${x.permit}`
                    : // an underground-only mine has no pit to report on
                      (!x.mine.shaft || x.mine.target.some((v) => v > 0)) && `Pit: ${x.mine.status}`}
                </div>
                {x.permit === 'granted' && pitBlocksRemaining(x.mine) > 0 && <div className="small muted">{pitBlocksRemaining(x.mine)} blocks left</div>}
                {x.mine.shaft && <div className="small">⛫ Underground: {x.mine.ugStatus}</div>}
              </div>
            ))}
            <button className="wide-btn" data-tut="land-office" onClick={() => setOffice(true)}>
              🏛 Land Office ({s.listings.length})
            </button>
          </div>
          <NewsFeed s={s} onSelect={onNotice} />
        </aside>

        <section className="center">
          {p ? (
            <>
              <div className="view-bar">
                <div className="seg">
                  <button data-tut="view-map" className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>
                    Map
                  </button>
                  <button data-tut="view-3d" className={view === '3d' ? 'active' : ''} onClick={() => setView('3d')}>
                    3D
                  </button>
                </div>
                {view === 'map' ? (
                  <div className="seg">
                    {OVERLAYS.map((o) => (
                      <button key={o.id} data-tut={`overlay-${o.id}`} className={overlay === o.id ? 'active' : ''} onClick={() => setOverlay(o.id)}>
                        {o.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="seg">
                    <label className="row small">
                      <input type="checkbox" checked={xray} onChange={(e) => setXray(e.target.checked)} /> X-ray ground
                    </label>
                    <label className="row small">
                      <input type="checkbox" checked={showShell} onChange={(e) => setShowShell(e.target.checked)} /> Estimated ore shell
                    </label>
                    {s.gameOver && (
                      <label className="row small">
                        <input type="checkbox" checked={showTruth} onChange={(e) => setShowTruth(e.target.checked)} /> Show the truth
                      </label>
                    )}
                  </div>
                )}
              </div>
              {view === 'map' && (overlay === 'estimate' || overlay === 'confidence') && (
                <label className="slice small">
                  Depth: <b>{slice < 0 ? 'best in column' : `${slice * LAYER_M}–${(slice + 1) * LAYER_M} m`}</b>
                  <input type="range" min={-1} max={GRID_D - 1} value={slice} onChange={(e) => setSlice(Number(e.target.value))} />
                </label>
              )}
              {view === 'map' ? (
                <MapCanvas
                  prop={p}
                  version={version}
                  overlay={overlay}
                  slice={slice}
                  tool={tool}
                  trenchStart={trenchStart}
                  selectedHole={holeId}
                  onCellClick={onCellClick}
                  onPaint={(c) =>
                    tool === 'stope'
                      ? store.dispatch({ type: 'setStopes', propId: p.id, cells: [c], zFrom: stopeRange[0], zTo: stopeRange[1] })
                      : store.dispatch({ type: 'setPit', propId: p.id, cells: [c], depth: pitDepth })
                  }
                  onHover={setHover}
                  marks={tutorialMarks(s, tutUi)}
                />
              ) : (
                <Reveal3D prop={p} version={version} cutoff={p.mine.cutoff} showShell={showShell} xray={xray} showTruth={showTruth && !!s.gameOver} />
              )}
              <Legend />
            </>
          ) : (
            <div className="welcome">
              <h2>Welcome, prospector.</h2>
              <p>
                You have <b>{money(s.cash, false)}</b> and five years. Somewhere under these hills is gold, sitting in veins, creek
                gravels, and bonanza pockets.
              </p>
              <ol>
                <li>Buy a claim at the Land Office.</li>
                <li>Read the ground: walk it, pan the creek, sample the soil.</li>
                <li>Drill where the clues point. Assays take time.</li>
                <li>Prove up a resource, get a permit, dig a pit, and pour gold.</li>
                <li>Sell proven claims or mine them, then buy bigger ones.</li>
              </ol>
              <button onClick={() => setOffice(true)}>🏛 Visit the Land Office</button>
            </div>
          )}
        </section>

        <aside className="right">
          {p && (
            <>
              <div className="seg tabs">
                {(['explore', 'mine', 'report', 'bank', 'awards'] as RightTab[]).map((t) => (
                  <button key={t} data-tut={`tab-${t}`} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              {tab === 'explore' && (
                <>
                  <ExplorePanel
                    s={s}
                    p={p}
                    tool={tool}
                    setTool={selectTool}
                    drillDepth={drillDepth}
                    setDrillDepth={setDrillDepth}
                    rush={rush}
                    setRush={setRush}
                    onGeophys={() => store.dispatch({ type: 'geophys', propId: p.id })}
                    onWalkAll={() => store.dispatch({ type: 'walkoverAll', propId: p.id })}
                  />
                  <CellInfo p={p} c={hover} slice={slice} />
                  {hole && (
                    <div className="panel">
                      <CoreLog p={p} hole={hole} />
                    </div>
                  )}
                </>
              )}
              {tab === 'mine' && <MinePanel s={s} p={p} tool={tool} setTool={selectTool} pitDepth={pitDepth} setPitDepth={setPitDepth} stopeRange={stopeRange} setStopeRange={setStopeRange} />}
              {tab === 'report' && <ReportPanel s={s} p={p} />}
              {tab === 'bank' && <BankPanel s={s} />}
              {tab === 'awards' && <Achievements s={s} />}
              {tab !== 'explore' && <CellInfo p={p} c={hover} slice={slice} />}
            </>
          )}
          {!p && <BankPanel s={s} />}
        </aside>
      </div>

      {office && <LandOffice s={s} onClose={() => setOffice(false)} />}
      <NoticeModal s={s} />
      {!s.notices.some((n) => n.popup) && (
        <GameOverModalGate
          key={s.gameOver ? 'over' : 'on'}
          render={(close) => (
            <GameOverModal
              s={s}
              onShowTruth={() => {
                setView('3d');
                setShowTruth(true);
                close();
              }}
            />
          )}
        />
      )}
      {s.tutorial && !s.tutorial.done && <TutorialCoach s={s} ui={tutUi} setTab={setTab} setOverlay={setOverlay} />}
      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}

function GameOverModalGate({ render }: { render: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return open ? <>{render(() => setOpen(false))}</> : null;
}

const LEGEND_CLUES: [Clue, string][] = [
  [Clue.Outcrop, 'outcrop'],
  [Clue.QuartzOutcrop, 'quartz'],
  [Clue.VisibleGold, 'visible gold'],
  [Clue.Gossan, 'gossan'],
  [Clue.VegStress, 'stressed veg'],
  [Clue.OldWorkings, 'old workings'],
];

function Legend() {
  return (
    <div className="legend small">
      {LEGEND_CLUES.map(([c, name]) => (
        <span key={c}>
          <ClueIcon clue={c} /> {name}
        </span>
      ))}
      <span>
        <i className="lg hole" /> drill hole (colour = best grade)
      </span>
      <span className="ramp">
        0.05 <i /> 20 g/t
      </span>
    </div>
  );
}
