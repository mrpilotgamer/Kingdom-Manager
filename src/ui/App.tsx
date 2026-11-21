import { useEffect, useState } from 'react';
import { computeStats, fmt } from '../engine/stats';
import { PHASES } from '../engine/turn';
import { selectKingdom, undo, update, useApp, useUndo } from '../state/store';
import { Crest } from './common';
import { Armies } from './Armies';
import { Diplomacy } from './Diplomacy';
import { Leaders } from './Leaders';
import { Log } from './Log';
import { NewKingdom } from './NewKingdom';
import { Overview } from './Overview';
import { Settings } from './Settings';
import { Settlements } from './Settlements';
import { Territory } from './Territory';
import { Turn, type Tab } from './Turn';

const TABS: { id: Tab; label: string; hash: string }[] = [
  { id: 'overview', label: 'Kingdom', hash: 'kingdom' },
  { id: 'turn', label: 'Turn', hash: 'turn' },
  { id: 'settlements', label: 'Settlements', hash: 'settlements' },
  { id: 'territory', label: 'Territory', hash: 'territory' },
  { id: 'armies', label: 'Armies', hash: 'armies' },
  { id: 'diplomacy', label: 'Diplomacy', hash: 'diplomacy' },
  { id: 'leaders', label: 'Leaders', hash: 'leaders' },
  { id: 'log', label: 'Chronicle', hash: 'chronicle' },
  { id: 'settings', label: 'Options', hash: 'options' },
];

function tabFromHash(): Tab {
  const h = typeof location !== 'undefined' ? location.hash.slice(1) : '';
  return TABS.find((t) => t.hash === h)?.id ?? 'overview';
}

export function App() {
  const { kingdoms, activeId } = useApp();
  const k = kingdoms.find((x) => x.id === activeId) ?? null;
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [creating, setCreating] = useState(false);
  const undoLabel = useUndo();

  useEffect(() => {
    const on = () => setTab(tabFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    try { history.replaceState(null, '', `#${TABS.find((x) => x.id === t)!.hash}`); } catch { /* sandboxed */ }
    window.scrollTo({ top: 0 });
  };

  if (!k || creating) {
    return (
      <main><div className="wrap welcome">
        <div className="row" style={{ marginBottom: 16 }}><Crest /><h1>Kingdom Manager</h1></div>
        <NewKingdom onDone={() => { setCreating(false); go('settlements'); }} onCancel={k ? () => setCreating(false) : undefined} />
      </div></main>
    );
  }

  const st = computeStats(k);
  const phase = PHASES.find((p) => p.id === k.turnState.phase)!;
  const vitals: [string, string, string?][] = [
    ['Turn', `${k.turn} · ${phase.label}`],
    ['Treasury', `${k.treasury} BP`, k.treasury < 0 ? 'neg' : ''],
    ['Unrest', String(k.unrest), k.unrest >= 11 ? 'neg' : ''],
    ['Eco', fmt(st.economy)], ['Loy', fmt(st.loyalty)], ['Stab', fmt(st.stability)],
    ['Size', String(k.size)], ['DC', String(st.controlDC)], ['Cons', String(st.consumption)],
  ];

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="titlebar">
            <Crest />
            <h1>{k.name}</h1>
            {kingdoms.length > 1 && (
              <select aria-label="Switch kingdom" value={k.id} onChange={(e) => selectKingdom(e.target.value)}>
                {kingdoms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            )}
            {k.settings.setupMode && (
              <button className="chip warn" style={{ border: 0, cursor: 'pointer' }} title="Turn off setup mode"
                onClick={() => update('Leave setup mode', (d) => { d.settings.setupMode = false; })}>Setup mode on · turn off</button>
            )}
            <button className="btn sm" disabled={!undoLabel} onClick={undo} title={undoLabel ? `Undo: ${undoLabel}` : 'Nothing to undo'}>
              Undo{undoLabel ? `: ${undoLabel}` : ''}
            </button>
          </div>
          <div className="vitals">
            {vitals.map(([key, v, cls]) => (
              <span key={key} className="vital"><span className="k">{key}</span><span className={`v ${cls ?? ''}`}>{v}</span></span>
            ))}
          </div>
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)}>{t.label}</button>
            ))}
          </nav>
        </div>
      </header>
      <main>
        <div className="wrap">
          {tab === 'overview' && <Overview k={k} openEvents={() => { update('Go to Event phase', (d) => { d.turnState.phase = 'event'; }); go('turn'); }} />}
          {tab === 'turn' && <Turn k={k} go={go} />}
          {tab === 'settlements' && <Settlements k={k} />}
          {tab === 'territory' && <Territory k={k} go={go} />}
          {tab === 'leaders' && <Leaders k={k} />}
          {tab === 'armies' && <Armies k={k} />}
          {tab === 'diplomacy' && <Diplomacy k={k} />}
          {tab === 'log' && <Log k={k} />}
          {tab === 'settings' && <Settings k={k} onNew={() => setCreating(true)} />}
        </div>
        <div className="wrap footer">
          Rules from the Pathfinder Roleplaying Game: Ultimate Campaign, used under the Open Game License, via Archives of Nethys.
          Not published, endorsed, or approved by Paizo.
        </div>
      </main>
    </>
  );
}
