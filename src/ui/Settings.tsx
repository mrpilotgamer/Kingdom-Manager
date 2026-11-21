import { useState } from 'react';
import { fmt } from '../engine/stats';
import { ALIGNMENTS } from '../rules/kingdom';
import { GOVERNMENTS, STAT_LABEL, type Government, type SettlementStat } from '../rules/settlement';
import { deleteKingdom, exportKingdom, importKingdom, update } from '../state/store';
import type { Kingdom } from '../state/types';
import { Panel, useId } from './common';

export function Settings({ k, onNew }: { k: Kingdom; onNew: () => void }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const ids = { n: useId('set'), a: useId('set'), imp: useId('set'), file: useId('set'), gov: useId('set') };
  const json = exportKingdom(k);
  const alignIdx = ALIGNMENTS.findIndex((a) => a.value.law === k.alignment.law && a.value.moral === k.alignment.moral);

  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${k.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-turn-${k.turn}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setMsg('Download is blocked here. Use Copy instead.');
    }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(json); setMsg('Copied the kingdom to your clipboard.'); }
    catch { setText(json); setMsg('Copy is blocked here. The data is in the box below: select it all and copy.'); }
  };
  const doImport = (src: string) => {
    try { const imported = importKingdom(src); setMsg(`Imported ${imported.name}.`); setText(''); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Could not read that file.'); }
  };

  return (
    <div className="grid-2">
      <Panel title="Kingdom">
        <label className="field" htmlFor={ids.n}>Name
          <input id={ids.n} type="text" value={k.name} onChange={(e) => update('Rename kingdom', (d) => { d.name = e.target.value; })} />
        </label>
        <label className="field" htmlFor={ids.a}>Alignment
          <select id={ids.a} value={alignIdx} onChange={(e) => update('Change alignment', (d) => { d.alignment = ALIGNMENTS[Number(e.target.value)].value; })}>
            {ALIGNMENTS.map((a, i) => <option key={a.abbr} value={i}>{a.label}</option>)}
          </select>
        </label>
        <label className="field" htmlFor={ids.gov}>Government
          <select id={ids.gov} value={k.government ?? 'autocracy'} onChange={(e) => update('Change government', (d) => { d.government = e.target.value as Government; })}>
            {Object.entries(GOVERNMENTS).map(([id, g]) => (
              <option key={id} value={id}>{g.label}{Object.keys(g.mods).length ? ` — ${Object.entries(g.mods).map(([st, v]) => `${STAT_LABEL[st as SettlementStat]} ${fmt(v!)}`).join(', ')}` : ''}</option>
            ))}
          </select>
        </label>
        <p className="small muted">{GOVERNMENTS[k.government ?? 'autocracy'].text} Its modifiers apply to every settlement.</p>
        <h3>Rules options</h3>
        <label className="check">
          <input type="checkbox" checked={k.settings.setupMode} onChange={(e) => update('Toggle setup mode', (d) => { d.settings.setupMode = e.target.checked; })} />
          <span><strong>Setup mode</strong> <span className="small muted">— building, claiming, and founding cost nothing and skip turn limits. Use it to copy in a kingdom you're already running.</span></span>
        </label>
        <label className="check">
          <input type="checkbox" checked={k.settings.districtsAddConsumption} onChange={(e) => update('Toggle district Consumption', (d) => { d.settings.districtsAddConsumption = e.target.checked; })} />
          <span><strong>Each district adds 1 Consumption</strong> <span className="small muted">— as on the Ultimate Campaign kingdom sheet. Turn off if your table doesn't use it.</span></span>
        </label>
        <label className="check">
          <input type="checkbox" checked={k.settings.settlementSizeMods !== false} onChange={(e) => update('Toggle settlement size modifiers', (d) => { d.settings.settlementSizeMods = e.target.checked; })} />
          <span><strong>Settlement size modifiers</strong> <span className="small muted">— Table 4–14: a 1-lot village gets −4 to all settlement modifiers, a small town −2, and cities +1 or more.</span></span>
        </label>
        <label className="check">
          <input type="checkbox" checked={!!k.settings.permanentEventEffects} onChange={(e) => update('Toggle permanent event effects', (d) => { d.settings.permanentEventEffects = e.target.checked; })} />
          <span><strong>Event changes are permanent</strong> <span className="small muted">— the rules don't say how long changes like "Stability decreases by 2" last. Off: they last while a continuous event does, or until the next Event phase. On: they stay until you remove them.</span></span>
        </label>
        <label className="check">
          <input type="checkbox" checked={k.settings.itemSources === 'all'} onChange={(e) => update('Change item sources', (d) => { d.settings.itemSources = e.target.checked ? 'all' : 'core'; })} />
          <span><strong>Magic items from every Pathfinder book</strong> <span className="small muted">— off: wondrous items, rings, and staves come from the Core Rulebook. Potions, scrolls, and wands use spells from all books either way.</span></span>
        </label>
        <h3>Optional rules</h3>
        <label className="check">
          <input type="checkbox" checked={!!k.settings.roleSkills} onChange={(e) => update('Toggle role skills', (d) => { d.settings.roleSkills = e.target.checked; })} />
          <span><strong>Leadership role skills</strong> <span className="small muted">— each leader adds +1 per 5 ranks in their role’s skill (e.g. General: Profession (soldier)).</span></span>
        </label>
        <label className="check">
          <input type="checkbox" checked={!!k.settings.deities} onChange={(e) => update('Toggle deities', (d) => { d.settings.deities = e.target.checked; })} />
          <span><strong>Deities and holy sites</strong> <span className="small muted">— Shrines, Temples, and Cathedrals give bonuses based on their god’s alignment. Set the god on each building.</span></span>
        </label>
        <label className="check">
          <input type="checkbox" checked={k.settings.diagonalAdjacency} onChange={(e) => update('Toggle diagonal adjacency', (d) => { d.settings.diagonalAdjacency = e.target.checked; })} />
          <span><strong>Diagonal lots count as adjacent</strong> <span className="small muted">— the rules don't say; many GMs allow it.</span></span>
        </label>
      </Panel>
      <Panel title="Save and share">
        <p className="small muted">Kingdoms are saved in this browser automatically. Export a copy to back it up or move it to another device.</p>
        <div className="row">
          <button className="btn" onClick={download}>Download file</button>
          <button className="btn" onClick={copy}>Copy</button>
          <label className="btn" htmlFor={ids.file}>Import file</label>
          <input id={ids.file} type="file" accept="application/json,.json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) doImport(await f.text());
            e.target.value = '';
          }} />
        </div>
        <label className="field" htmlFor={ids.imp}>Or paste kingdom data
          <textarea id={ids.imp} rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <div className="row">
          <button className="btn" disabled={!text.trim()} onClick={() => doImport(text)}>Import pasted data</button>
        </div>
        {msg && <p className="callout info">{msg}</p>}
        <h3>Kingdoms</h3>
        <div className="row">
          <button className="btn primary" onClick={onNew}>Found a new kingdom</button>
          {confirm ? (
            <span className="row small">Delete {k.name} from this browser?
              <button className="btn sm danger" onClick={() => deleteKingdom(k.id)}>Delete</button>
              <button className="btn sm ghost" onClick={() => setConfirm(false)}>Keep</button>
            </span>
          ) : <button className="btn danger" onClick={() => setConfirm(true)}>Delete this kingdom</button>}
        </div>
      </Panel>
    </div>
  );
}
