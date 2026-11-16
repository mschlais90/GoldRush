import { useEffect, useState } from 'react';
import { GRID_D, LAYER_M, cx, cy } from '../sim/geology/types';
import { pitBlocksRemaining } from '../sim/mining';
import { REGIONS } from '../sim/regions';
import { money } from './format';
import { MapCanvas, type Overlay, type Tool } from './map/MapCanvas';
import { CellInfo, CoreLog, DrillHoleList, ExplorePanel, OVERLAYS } from './panels/ExplorePanel';
import { LandOffice } from './panels/LandOffice';
import { MinePanel } from './panels/MinePanel';
import { Achievements, GameOverModal, NoticeModal } from './panels/Modals';
import { BankPanel, ReportPanel } from './panels/ReportPanel';
import { TopBar } from './panels/TopBar';
import { TitleScreen } from './TitleScreen';
import { store, useGame, useVersion } from './store';
import { Reveal3D } from './view3d/Reveal3D';
import { TutorialCoach, tutorialMarks, type RightTab, type TutorialUi } from './Tutorial';
import { ConfirmBar, DrillOptions, describeTap } from './panels/ConfirmBar';
import { Sheet, TimeBar, ToolStrip } from './panels/MobileHud';
import { columnLabel } from '../sim/market';
import { COSTS, geophysDone, walkAllDone } from '../sim/prospecting';
import { useIsMobile } from './useIsMobile';

/** Phone HUD sheets that slide up over the map. */
type SheetId = 'claims' | 'layers' | 'more' | 'hole' | 'cell' | null;
const MORE_TABS: [RightTab, string][] = [
  ['mine', 'Mine'],
  ['report', 'Report'],
  ['bank', 'Bank'],
  ['awards', 'Awards'],
];

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
  const mobile = useIsMobile();
  const [pending, setPending] = useState<number | null>(null);
  const [sheet, setSheet] = useState<SheetId>(null);
  /** Phone: a whole-claim action (walk-all, IP survey) awaiting confirmation. */
  const [pendingAction, setPendingAction] = useState<{ text: string; run: () => void } | null>(null);

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

  // once the game is over, sold claims come back so the player can see what was really under them
  const sold = s.gameOver ? (s.soldProperties ?? []) : [];
  const p = s.properties.find((x) => x.id === propId) ?? sold.find((x) => x.id === propId) ?? s.properties[0] ?? sold[0];
  const hole = p?.knowledge.holes.find((h) => h.id === holeId) ?? null;

  const pickClaim = (id: number) => {
    setPropId(id);
    setPending(null);
    if (mobile) setSheet(null);
  };

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
    setPending(null);
    setPendingAction(null);
    // picking a map tool from the Mine sheet: get the sheet out of the way so the map can be used
    if (mobile && t !== 'inspect') setSheet(null);
    if (t === 'pit') setOverlay('pit');
    if (t === 'stope') setOverlay('estimate');
  };


  // ---- pieces shared by the desktop layout and the phone HUD ----

  const claimsPanel = (
    <div className="panel">
      <h3>Your claims</h3>
      {s.properties.length === 0 && <div className="small muted">You don't own any land yet.</div>}
      {s.properties.map((x) => (
        <div key={x.id} className={`prop-card ${p?.id === x.id ? 'sel' : ''}`} onClick={() => pickClaim(x.id)}>
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
      {sold.length > 0 && (
        <>
          <h4>Sold claims</h4>
          {sold.map((x) => (
            <div key={x.id} className={`prop-card sold ${p?.id === x.id ? 'sel' : ''}`} onClick={() => pickClaim(x.id)}>
              <b>{x.name}</b>
              <div className="small muted">
                {REGIONS[x.region].name} · sold day {x.soldDay}
              </div>
              <div className="small">{x.knowledge.holes.length} holes drilled</div>
            </div>
          ))}
        </>
      )}
      {s.gameOver && (s.properties.length > 0 || sold.length > 0) && (
        <div className="small muted">Pick any claim, open the 3D view and tick "Show the truth" to see what was really down there.</div>
      )}
      {!s.gameOver && (
        <button
          className="wide-btn"
          data-tut="land-office"
          onClick={() => {
            setSheet(null);
            setOffice(true);
          }}
        >
          🏛 Land Office ({s.listings.length})
        </button>
      )}
    </div>
  );

  const welcome = (
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
      {/* on phones the claim list is tucked in a sheet, so the tutorial points here instead */}
      <button data-tut={mobile ? 'land-office' : undefined} onClick={() => setOffice(true)}>
        🏛 Visit the Land Office
      </button>
    </div>
  );

  const threeDOptions = (
    <>
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
    </>
  );

  const sliceControl = (overlay === 'estimate' || overlay === 'confidence') && (
    <label className="slice small">
      Depth: <b>{slice < 0 ? 'best in column' : `${slice * LAYER_M}–${(slice + 1) * LAYER_M} m`}</b>
      <input type="range" min={-1} max={GRID_D - 1} value={slice} onChange={(e) => setSlice(Number(e.target.value))} />
    </label>
  );

  const mapOrModel = () =>
    p &&
    (view === 'map' ? (
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
        onSelect={mobile ? setPending : undefined}
        pending={pending}
        marks={tutorialMarks(s, tutUi)}
      />
    ) : (
      <Reveal3D prop={p} version={version} cutoff={p.mine.cutoff} showShell={showShell} xray={xray} showTruth={showTruth && !!s.gameOver} />
    ));

  const tabPanel = (t: RightTab) =>
    p && (
      <>
        {t === 'mine' && <MinePanel s={s} p={p} tool={tool} setTool={selectTool} pitDepth={pitDepth} setPitDepth={setPitDepth} stopeRange={stopeRange} setStopeRange={setStopeRange} />}
        {t === 'report' && <ReportPanel s={s} p={p} />}
        {t === 'bank' && <BankPanel s={s} />}
        {t === 'awards' && <Achievements s={s} />}
      </>
    );

  const onWalkAll = () => p && store.dispatch({ type: 'walkoverAll', propId: p.id });
  const onGeophys = () => p && store.dispatch({ type: 'geophys', propId: p.id });

  // ---- desktop: three columns (unchanged) ----

  const desktop = (
    <div className="main">
      <aside className="left">
        {claimsPanel}
        {p && (
          <DrillHoleList
            p={p}
            selected={hole?.id ?? null}
            onSelect={(id) => {
              setHoleId(id);
              setTab('explore');
            }}
          />
        )}
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
                <div className="seg">{threeDOptions}</div>
              )}
            </div>
            {view === 'map' && sliceControl}
            {mapOrModel()}
          </>
        ) : (
          welcome
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
                  onGeophys={onGeophys}
                  onWalkAll={onWalkAll}
                />
                <CellInfo p={p} c={hover} slice={slice} />
                {hole && (
                  <div className="panel">
                    <CoreLog p={p} hole={hole} />
                  </div>
                )}
              </>
            )}
            {tab !== 'explore' && tabPanel(tab)}
            {tab !== 'explore' && <CellInfo p={p} c={hover} slice={slice} />}
          </>
        )}
        {!p && <BankPanel s={s} />}
      </aside>
    </div>
  );

  // ---- phone: one screen, no scrolling (status bar, chips, map, tool strip, time bar) ----

  const layerName = view === '3d' ? '3D options' : (OVERLAYS.find((o) => o.id === overlay)?.name ?? 'Surface');
  const moreTab: RightTab = tab === 'explore' ? 'mine' : tab;
  const tapText = p && pending !== null ? describeTap(tool, pending, trenchStart, drillDepth, rush) : null;

  const phone = (
    <div className="hud">
      <div className="hud-chips">
        <button className="chip claim-chip" data-tut-host="land-office" onClick={() => setSheet('claims')}>
          {p ? p.name : 'No claim yet'} ▾
        </button>
        {p && (
          <>
            <button className="chip" data-tut-host="overlay-" onClick={() => setSheet('layers')}>
              {layerName} ▾
            </button>
            <button className="chip" data-tut={view === 'map' ? 'view-3d' : 'view-map'} onClick={() => setView(view === 'map' ? '3d' : 'map')}>
              {view === 'map' ? '3D' : 'Map'}
            </button>
          </>
        )}
      </div>
      <div className="hud-map">
        {p ? mapOrModel() : welcome}
        {/* cell info sits under the map rather than over it, at a fixed height so the map never resizes */}
        {p && view === 'map' && (
          <CellInfo
            p={p}
            c={hover}
            slice={slice}
            compact
            onExpand={hover !== null ? () => setSheet('cell') : undefined}
            onOpenHole={(id) => {
              setHoleId(id);
              setSheet('hole');
            }}
          />
        )}
      </div>
      {p && view === 'map' && (
        <ToolStrip
          tool={tool}
          setTool={selectTool}
          walkDone={walkAllDone(p)}
          geoDone={geophysDone(p)}
          onWalkAll={() => setPendingAction({ text: `🗺 Full walk-over · ${money(COSTS.walkoverAll.cost)} · ${COSTS.walkoverAll.days}d`, run: onWalkAll })}
          onGeophys={() => setPendingAction({ text: `📡 IP geophysics · ${money(COSTS.geophys.cost)} · ${COSTS.geophys.days}d`, run: onGeophys })}
        />
      )}
      <TimeBar moreOpen={sheet === 'more'} onMore={() => setSheet(sheet === 'more' ? null : 'more')} />

      {sheet === 'claims' && (
        <Sheet title="Claims" onClose={() => setSheet(null)}>
          {claimsPanel}
        </Sheet>
      )}
      {sheet === 'layers' && p && (
        <Sheet title={view === '3d' ? '3D view' : 'Map layer'} onClose={() => setSheet(null)}>
          {view === '3d' ? (
            <div className="sheet-list">{threeDOptions}</div>
          ) : (
            <>
              <div className="sheet-list">
                {OVERLAYS.map((o) => (
                  <button key={o.id} data-tut={`overlay-${o.id}`} className={`seg-item ${overlay === o.id ? 'active' : ''}`} onClick={() => setOverlay(o.id)}>
                    {o.name}
                  </button>
                ))}
              </div>
              {sliceControl}
            </>
          )}
        </Sheet>
      )}
      {sheet === 'more' && p && (
        <Sheet
          title={
            <div className="seg tabs">
              {MORE_TABS.map(([t, name]) => (
                <button key={t} data-tut={`tab-${t}`} className={moreTab === t ? 'active' : ''} onClick={() => setTab(t)}>
                  {name}
                </button>
              ))}
            </div>
          }
          onClose={() => setSheet(null)}
        >
          {tabPanel(moreTab)}
          {moreTab === 'mine' && (
            <DrillHoleList
              p={p}
              selected={hole?.id ?? null}
              onSelect={(id) => {
                setHoleId(id);
                setSheet('hole');
              }}
            />
          )}
        </Sheet>
      )}
      {sheet === 'cell' && p && hover !== null && (
        <Sheet title={`Cell ${columnLabel(hover)}`} onClose={() => setSheet(null)}>
          <CellInfo p={p} c={hover} slice={slice} />
          {(() => {
            const h = p.knowledge.holes.find((hh) => hh.c === hover);
            return (
              h && (
                <div className="panel">
                  <CoreLog p={p} hole={h} />
                </div>
              )
            );
          })()}
        </Sheet>
      )}
      {sheet === 'hole' && p && hole && (
        <Sheet title="Core log" onClose={() => setSheet(null)}>
          <CoreLog p={p} hole={hole} />
        </Sheet>
      )}

      {tapText && pending !== null && (
        <ConfirmBar
          label={columnLabel(pending)}
          text={tapText}
          onConfirm={() => {
            onCellClick(pending);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        >
          {tool === 'drill' && <DrillOptions depth={drillDepth} setDepth={setDrillDepth} rush={rush} setRush={setRush} />}
        </ConfirmBar>
      )}
      {pendingAction && !tapText && (
        <ConfirmBar
          text={pendingAction.text}
          onConfirm={() => {
            pendingAction.run();
            setPendingAction(null);
          }}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );

  // The tutorial opens the matching sheet on phones (explore steps use the tool strip, so close it).
  const coachSetTab = mobile
    ? (t: RightTab) => {
        setTab(t);
        setSheet(t === 'explore' ? null : 'more');
      }
    : setTab;

  return (
    <div className={mobile ? 'app mobile-hud' : 'app'}>
      <TopBar s={s} onQuit={() => store.quit()} />
      {mobile ? phone : desktop}

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
      {s.tutorial && !s.tutorial.done && <TutorialCoach s={s} ui={tutUi} setTab={coachSetTab} setOverlay={setOverlay} />}
      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}

function GameOverModalGate({ render }: { render: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return open ? <>{render(() => setOpen(false))}</> : null;
}
