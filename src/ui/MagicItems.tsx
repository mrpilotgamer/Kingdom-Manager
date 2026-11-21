import { useState } from 'react';
import { emptySlot, itemsForSale, openSlots, sellToNpc, setSlotItem, settlementSlots, slotKey, slotLabel, type SlotRef } from '../engine/magicItems';
import { settlementStats } from '../engine/stats';
import { die } from '../engine/dice';
import { update } from '../state/store';
import type { Kingdom, Settlement } from '../state/types';
import { Panel, useId } from './common';

const gp = (n: number) => `${n.toLocaleString()} gp`;

export function MagicItemsPanel({ k, s }: { k: Kingdom; s: Settlement }) {
  const slots = settlementSlots(s);
  const st = settlementStats(s);
  if (!slots.length) {
    return (
      <Panel title="Magic items">
        <p className="small muted">No building here sells magic items yet. Shrines, Herbalists, Alchemists, Temples, Caster’s Towers, Magic Shops, and similar buildings add item slots.</p>
      </Panel>
    );
  }
  const forSale = itemsForSale(s).length;
  return (
    <Panel title="Magic items">
      <p className="small muted">
        {forSale} for sale, {openSlots(s).length} open slot{openSlots(s).length === 1 ? '' : 's'}. Items can’t cost more than the base value
        ({gp(st.baseValue)}, the most a {st.sizeLabel.toLowerCase()} allows is {gp(st.baseValueCap)}). Open slots roll to fill in each Upkeep phase.
      </p>
      <div className="stack">
        {slots.map((r) => <SlotRow key={slotKey(r)} k={k} s={s} r={r} />)}
      </div>
    </Panel>
  );
}

function SlotRow({ k, s, r }: { k: Kingdom; s: Settlement; r: SlotRef }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState(50);
  const ids = { n: useId('mi'), p: useId('mi') };
  const key = slotKey(r);
  const bp = r.item ? Math.ceil(r.item.price / 2000) : 0;
  const sales = Number(k.turnState.done['items.npcSales'] ?? 0);
  return (
    <div className="item-row">
      <button className="item-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="small muted item-slot">{r.label}: {slotLabel(r.spec)}</span>
        {r.item ? (
          <span className="item-name"><strong>{r.item.name}</strong> <span className="num">{gp(r.item.price)}</span></span>
        ) : <span className="item-name muted">Open slot</span>}
      </button>
      {open && (r.item ? (
        <div className="row small">
          <button className="btn sm" onClick={() => { update('Item bought by a PC', (d) => emptySlot(d, s.id, key, 'pc')); setOpen(false); }}>A PC bought it</button>
          <button className="btn sm" onClick={() => { update('Kingdom buys item', (d) => emptySlot(d, s.id, key, 'kingdom')); setOpen(false); }} title="For the kingdom's use, e.g. gifted to an army or displayed in a Museum">Kingdom buys it ({bp} BP)</button>
          <button className="btn sm" onClick={() => { update('Leader buys item with BP', (d) => emptySlot(d, s.id, key, 'personal')); setOpen(false); }} title="Counts as withdrawing BP from the Treasury">For a leader ({bp} BP, Unrest +{bp})</button>
          <button className="btn sm" onClick={() => { update('Sell item to a traveler', (d) => { sellToNpc(d, s.id, key, die(20)); }); setOpen(false); }}
            title="Economy check; each one after the first this turn lowers Economy by 1">Sell to a traveler (Economy check{sales ? ', Economy −1' : ''})</button>
          <button className="btn sm ghost danger" onClick={() => { update('Remove item', (d) => emptySlot(d, s.id, key, 'clear')); setOpen(false); }}>Remove</button>
        </div>
      ) : (
        <div className="stack">
          <div className="row small">
            <button className="btn sm" onClick={() => { update('Roll an item', (d) => { setSlotItem(d, s.id, key, 'roll'); }); setOpen(false); }}>Roll an item now</button>
            <span className="muted">or add one by hand:</span>
          </div>
          <div className="row">
            <label className="field" htmlFor={ids.n} style={{ flex: 1, minWidth: 140 }}>Item<input id={ids.n} type="text" value={name} placeholder="Cloak of resistance +1" onChange={(e) => setName(e.target.value)} /></label>
            <label className="field" htmlFor={ids.p}>Price (gp)<input id={ids.p} type="number" min={0} value={price} onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))} /></label>
            <button className="btn sm" style={{ alignSelf: 'flex-end' }} disabled={!name.trim()} onClick={() => {
              update('Add item', (d) => { setSlotItem(d, s.id, key, { name: name.trim(), price, kind: r.spec.kinds[0], grade: r.spec.grade }); });
              setName(''); setOpen(false);
            }}>Add</button>
          </div>
        </div>
      ))}
    </div>
  );
}
