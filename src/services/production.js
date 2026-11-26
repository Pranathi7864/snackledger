'use strict';
// BOM-driven production: start (issue materials) -> complete (record output, packaging, wastage) -> variance + cost.
const { D, round, pct, str } = require('../money');
const { nowTs, today, addDays, monthStart, monthEnd } = require('../clock');
const { bad, notFound, conflict } = require('../errors');
const { audit } = require('../audit');
const units = require('../units');
const stock = require('./stock');

async function tolerance(db) { const r = await db.one("select value from settings where key='variance_tolerance_pct'"); return D(r ? r.value : 3); }
const flag = (v, tol) => v !== null && D(v).abs().gt(tol);

async function productInfo(tx, productId) {
  const p = await tx.one(`select p.*, i.name, i.code, i.unit, b.batch_output_g, b.name as bom_name from products p join items i on i.id=p.item_id join boms b on b.id=p.bom_id where p.item_id=$1`, [productId]);
  if (!p) throw bad('Unknown product');
  p.packets_per_batch = D(p.batch_output_g).div(p.pack_size_g);
  return p;
}
// Effective BOM for a product: shared bulk recipe lines + product packaging, scaled to `batches`.
async function effectiveBom(tx, productId, batches = 1) {
  const p = await productInfo(tx, productId);
  const b = D(batches), expected = p.packets_per_batch.times(b);
  const mats = await tx.query('select bl.item_id, bl.qty, bl.unit, i.name, i.unit as item_unit from bom_lines bl join items i on i.id=bl.item_id where bl.bom_id=$1 order by bl.id', [p.bom_id]);
  const pack = await tx.query('select pp.item_id, pp.qty_per_packet, i.name, i.unit as item_unit from product_packaging pp join items i on i.id=pp.item_id where pp.product_id=$1 order by pp.item_id', [productId]);
  return {
    product: { id: p.item_id, name: p.name, packSizeG: p.pack_size_g, bomId: p.bom_id, bomName: p.bom_name, packetsPerBatch: p.packets_per_batch.toFixed(3) },
    expectedOutput: expected.toFixed(3),
    lines: [
      ...mats.map(m => ({ itemId: m.item_id, name: m.name, kind: 'MATERIAL', perBatch: D(m.qty).toFixed(4), unit: m.unit, planned: units.convert(D(m.qty).times(b), m.unit, m.item_unit).toFixed(4), stockUnit: m.item_unit })),
      ...pack.map(m => ({ itemId: m.item_id, name: m.name, kind: 'PACKAGING', perPacket: D(m.qty_per_packet).toFixed(6), perBatch: D(m.qty_per_packet).times(p.packets_per_batch).toFixed(4), unit: m.item_unit, planned: D(m.qty_per_packet).times(expected).toFixed(4), stockUnit: m.item_unit })),
    ],
  };
}

async function startRun(tx, user, body) {
  const batches = D(body.batches);
  if (!batches.gt(0)) throw bad('Number of batches must be positive');
  const bom = await effectiveBom(tx, body.productId, batches);
  const p = await productInfo(tx, body.productId);
  const tol = await tolerance(tx);
  const date = body.runDate || today();
  const issues = new Map((body.issues || []).map(i => [Number(i.itemId), i]));
  const mats = bom.lines.filter(l => l.kind === 'MATERIAL');
  await stock.lockItems(tx, [...mats.map(m => m.itemId), ...bom.lines.filter(l => l.kind === 'PACKAGING').map(l => l.itemId)]);
  const run = await tx.one(`insert into production_runs(product_id,bom_id,batches,status,run_date,expected_output,tolerance_pct,notes,started_by,started_at)
     values($1,$2,$3,'STARTED',$4,$5,$6,$7,$8,$9) returning id`, [p.item_id, p.bom_id, batches.toFixed(3), date, bom.expectedOutput, tol.toFixed(2), body.notes || null, user.username, nowTs()]);
  const ref = 'BATCH-' + String(run.id).padStart(5, '0');
  for (const l of bom.lines) {
    if (l.kind === 'PACKAGING') { await tx.query('insert into production_run_lines(run_id,item_id,kind,planned_qty) values($1,$2,$3,$4)', [run.id, l.itemId, 'PACKAGING', l.planned]); continue; }
    const given = issues.get(l.itemId);
    const item = await tx.one('select unit from items where id=$1', [l.itemId]);
    const actual = given ? units.convert(given.qty, given.unit || item.unit, item.unit) : D(l.planned);
    if (actual.lt(0)) throw bad('Issued quantity cannot be negative');
    let value = D(0), unitCost = D(0);
    if (actual.gt(0)) ({ value, unitCost } = await stock.issue(tx, { itemId: l.itemId, qty: actual, type: 'PRODUCTION_ISSUE', sourceType: 'PRODUCTION_RUN', sourceId: run.id, sourceRef: ref, user: user.username, note: 'Issued to production per BOM' }));
    const v = pct(actual, l.planned);
    await tx.query('insert into production_run_lines(run_id,item_id,kind,planned_qty,actual_qty,unit_cost,cost,variance_pct,flagged) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [run.id, l.itemId, 'MATERIAL', l.planned, actual.toFixed(4), unitCost.toFixed(6), value.toFixed(4), v === null ? null : v.toFixed(3), flag(v, tol)]);
  }
  await audit(tx, user.username, 'START', 'PRODUCTION_RUN', run.id, `${ref} started: ${p.name} x ${batches} batch(es)`, { after: { issues: body.issues || 'per BOM' } });
  return run.id;
}

async function completeRun(tx, user, runId, body) {
  const run = await tx.one('select * from production_runs where id=$1 for update', [runId]);
  if (!run) throw notFound('Run not found');
  if (run.status !== 'STARTED') throw conflict(`Run is ${run.status}; only a STARTED run can be completed`);
  const good = D(body.goodOutput), damaged = D(body.damagedPackaging || 0);
  if (good.lt(0) || damaged.lt(0)) throw bad('Quantities cannot be negative');
  const p = await productInfo(tx, run.product_id);
  const tol = D(run.tolerance_pct);
  const lines = await tx.query(`select l.*, i.name, i.unit, pp.qty_per_packet from production_run_lines l join items i on i.id=l.item_id
      left join product_packaging pp on pp.product_id=$2 and pp.item_id=l.item_id where l.run_id=$1 and l.kind='PACKAGING' order by l.item_id`, [runId, run.product_id]);
  await stock.lockItems(tx, [...lines.map(l => l.item_id), run.product_id]);
  const overrides = new Map((body.packaging || []).map(o => [Number(o.itemId), o]));
  const ref = 'BATCH-' + String(runId).padStart(5, '0');
  for (const l of lines) {
    let actual;
    const o = overrides.get(l.item_id);
    if (o) actual = units.convert(o.qty, o.unit || l.unit, l.unit);
    else if (body.cartonsUsed !== undefined && body.cartonsUsed !== null && D(l.qty_per_packet).lt(1)) actual = D(body.cartonsUsed);
    else if (D(l.qty_per_packet).gte(1)) actual = good.plus(damaged).times(l.qty_per_packet);     // per-pack items (pouch): good + damaged
    else actual = good.times(l.qty_per_packet).toDecimalPlaces(0, D.ROUND_UP);                     // grouped items (carton): ceil
    if (actual.lt(0)) throw bad('Packaging quantity cannot be negative');
    let value = D(0), unitCost = D(0);
    if (actual.gt(0)) ({ value, unitCost } = await stock.issue(tx, { itemId: l.item_id, qty: actual, type: 'PRODUCTION_ISSUE', sourceType: 'PRODUCTION_RUN', sourceId: runId, sourceRef: ref, user: user.username, note: 'Packaging consumed' }));
    const v = pct(actual, l.planned_qty);
    await tx.query('update production_run_lines set actual_qty=$1, unit_cost=$2, cost=$3, variance_pct=$4, flagged=$5 where id=$6',
      [actual.toFixed(4), unitCost.toFixed(6), value.toFixed(4), v === null ? null : v.toFixed(3), flag(v, tol), l.id]);
  }
  // finished goods in, as a new batch with expiry
  const mats = await tx.one("select coalesce(sum(cost),0) c from production_run_lines where run_id=$1", [runId]);
  const date = run.run_date;
  const batchNo = `${p.code}-${date.replace(/-/g, '')}-${String(runId).padStart(3, '0')}`;
  const batchId = await stock.getBatch(tx, run.product_id, batchNo, date, addDays(date, p.shelf_life_days));
  const unitCost = good.gt(0) ? round(D(mats.c).div(good), 6) : D(0);
  if (good.gt(0)) await stock.post(tx, { itemId: run.product_id, batchId, type: 'PRODUCTION_OUTPUT', qty: good, unitCost, sourceType: 'PRODUCTION_RUN', sourceId: runId, sourceRef: ref, user: user.username, note: `Output of ${ref}` });
  const yv = pct(good, run.expected_output);
  await tx.query(`update production_runs set status='COMPLETED', good_output=$1, damaged_packaging=$2, scrap_note=$3, yield_variance_pct=$4, yield_flag=$5,
     fg_batch_id=$6, completed_by=$7, completed_at=$8, notes=coalesce($9,notes) where id=$10`,
    [good.toFixed(3), damaged.toFixed(3), body.scrapNote || null, yv === null ? null : yv.toFixed(3), flag(yv, tol), batchId, user.username, nowTs(), body.notes || null, runId]);
  for (const c of ['labour', 'powerGas', 'other']) {
    const amt = body[c]; if (amt === undefined || amt === null || amt === '' || D(amt).isZero()) continue;
    await addCost(tx, user, runId, { costType: c === 'labour' ? 'LABOUR' : c === 'powerGas' ? 'POWER_GAS' : 'OTHER', amount: amt }, true);
  }
  await audit(tx, user.username, 'COMPLETE', 'PRODUCTION_RUN', runId, `${ref} completed: good ${good}, damaged ${damaged}, yield variance ${yv}%`);
  return runId;
}

async function addCost(tx, user, runId, { costType, amount, notes }, silent) {
  const run = await tx.one('select status from production_runs where id=$1', [runId]);
  if (!run) throw notFound('Run not found');
  if (run.status === 'VOIDED') throw conflict('Run is voided');
  if (!['LABOUR', 'POWER_GAS', 'OTHER'].includes(costType)) throw bad('Cost type must be LABOUR, POWER_GAS or OTHER');
  const a = D(amount); if (!a.gte(0)) throw bad('Amount must be zero or positive');
  const r = await tx.one('insert into run_costs(run_id,cost_type,amount,notes,created_by,created_at) values($1,$2,$3,$4,$5,$6) returning id', [runId, costType, a.toFixed(2), notes || null, user.username, nowTs()]);
  if (!silent) await audit(tx, user.username, 'ADD_COST', 'PRODUCTION_RUN', runId, `${costType} ₹${a.toFixed(2)} added`, { after: { id: r.id, costType, amount: a.toFixed(2), notes } });
  return r.id;
}
async function removeCost(tx, user, runId, costId, reason) {
  const c = await tx.one('select * from run_costs where id=$1 and run_id=$2', [costId, runId]);
  if (!c) throw notFound('Cost line not found');
  if (!reason) throw bad('Reason required to remove a cost line');
  await tx.query('delete from run_costs where id=$1', [costId]);
  await audit(tx, user.username, 'REMOVE_COST', 'PRODUCTION_RUN', runId, `${c.cost_type} ₹${c.amount} removed`, { before: c, reason });
}
// Void = post reversal entries for every ledger row of the run. Nothing is deleted.
async function voidRun(tx, user, runId, reason) {
  if (!reason || !reason.trim()) throw bad('A reason is required to void a run');
  const run = await tx.one('select * from production_runs where id=$1 for update', [runId]);
  if (!run) throw notFound('Run not found');
  if (run.status === 'VOIDED') throw conflict('Run already voided');
  const moves = await tx.query("select * from stock_moves where source_type='PRODUCTION_RUN' and source_id=$1 order by id", [runId]);
  await stock.lockItems(tx, moves.map(m => m.item_id));
  const ref = 'BATCH-' + String(runId).padStart(5, '0');
  for (const m of moves) {
    if (D(m.qty).lt(0)) await stock.post(tx, { itemId: m.item_id, batchId: m.batch_id, type: 'PRODUCTION_REVERSAL', qty: D(m.qty).negated(), unitCost: m.unit_cost, sourceType: 'PRODUCTION_RUN', sourceId: runId, sourceRef: ref, note: 'Reversal: ' + reason, user: user.username });
  }
  for (const m of moves.filter(x => D(x.qty).gt(0))) {            // outputs reversed last; fails if already dispatched
    const bal = await tx.one('select coalesce(sum(qty),0) b from stock_moves where batch_id=$1', [m.batch_id]);
    if (D(bal.b).lt(m.qty)) throw conflict(`Cannot void: finished goods from this run were already dispatched (batch balance ${bal.b}, output ${m.qty})`);
    await stock.post(tx, { itemId: m.item_id, batchId: m.batch_id, type: 'PRODUCTION_REVERSAL', qty: D(m.qty).negated(), unitCost: m.unit_cost, sourceType: 'PRODUCTION_RUN', sourceId: runId, sourceRef: ref, note: 'Reversal: ' + reason, user: user.username });
  }
  await tx.query("update production_runs set status='VOIDED', voided_by=$1, voided_at=$2, void_reason=$3 where id=$4", [user.username, nowTs(), reason, runId]);
  await audit(tx, user.username, 'VOID', 'PRODUCTION_RUN', runId, `${ref} voided`, { before: { status: run.status }, after: { status: 'VOIDED' }, reason });
}

// ---- costing ----
// Monthly overhead pool is allocated to the month's completed runs in proportion to output weight (good packets x pack size).
async function runCosting(db, runId) {
  const run = await db.one('select r.*, p.pack_size_g, p.price, i.name from production_runs r join products p on p.item_id=r.product_id join items i on i.id=r.product_id where r.id=$1', [runId]);
  if (!run) throw notFound('Run not found');
  const lines = await db.query('select * from production_run_lines where run_id=$1', [runId]);
  const mat = lines.filter(l => l.kind === 'MATERIAL').reduce((a, l) => a.plus(l.cost), D(0));
  const pack = lines.filter(l => l.kind === 'PACKAGING').reduce((a, l) => a.plus(l.cost), D(0));
  const direct = await db.query('select cost_type, sum(amount) a from run_costs where run_id=$1 group by cost_type', [runId]);
  const directBy = Object.fromEntries(direct.map(d => [d.cost_type, D(d.a)]));
  const directTotal = direct.reduce((a, d) => a.plus(d.a), D(0));
  let allocated = D(0);
  if (run.status === 'COMPLETED') {
    const ms = monthStart(run.run_date), me = monthEnd(run.run_date);
    const pool = await db.one('select coalesce(sum(amount),0) a from monthly_overheads where month between $1 and $2', [ms, me]);
    if (D(pool.a).gt(0)) {
      const w = await db.one("select coalesce(sum(r.good_output * p.pack_size_g),0) w from production_runs r join products p on p.item_id=r.product_id where r.status='COMPLETED' and r.run_date between $1 and $2", [ms, me]);
      if (D(w.w).gt(0)) allocated = round(D(pool.a).times(D(run.good_output).times(run.pack_size_g)).div(w.w), 2);
    }
  }
  const total = mat.plus(pack).plus(directTotal).plus(allocated);
  const good = D(run.good_output || 0);
  const cpp = good.gt(0) ? round(total.div(good), 4) : null;
  const price = D(run.price);
  return {
    runId, runNo: 'BATCH-' + String(runId).padStart(5, '0'), product: run.name, status: run.status, goodOutput: good.toFixed(3),
    materialCost: mat.toFixed(2), packagingCost: pack.toFixed(2), labour: (directBy.LABOUR || D(0)).toFixed(2), powerGas: (directBy.POWER_GAS || D(0)).toFixed(2), otherDirect: (directBy.OTHER || D(0)).toFixed(2),
    allocatedOverhead: allocated.toFixed(2), totalCost: total.toFixed(2),
    costPerPacket: cpp ? cpp.toFixed(4) : null, costPerPacketRounded: cpp ? round(cpp, 2).toFixed(2) : null,
    sellingPrice: price.toFixed(2), marginPerPacket: cpp ? round(price.minus(cpp), 2).toFixed(2) : null, marginPct: cpp ? round(price.minus(cpp).div(price).times(100), 2).toFixed(2) : null,
  };
}

async function listRuns(db, { status } = {}) {
  const rows = await db.query(`select r.*, i.name as product from production_runs r join items i on i.id=r.product_id ${status ? 'where r.status=$1' : ''} order by r.id desc`, status ? [status] : []);
  const out = [];
  for (const r of rows) { const c = await runCosting(db, r.id); out.push({ ...r, costPerPacket: c.costPerPacket, totalCost: c.totalCost }); }
  return out;
}
async function runDetail(db, runId) {
  const run = await db.one('select r.*, i.name as product from production_runs r join items i on i.id=r.product_id where r.id=$1', [runId]);
  if (!run) throw notFound('Run not found');
  const lines = await db.query(`select l.*, i.name, i.unit from production_run_lines l join items i on i.id=l.item_id where l.run_id=$1 order by l.kind desc, l.id`, [runId]);
  const costs = await db.query('select * from run_costs where run_id=$1 order by id', [runId]);
  const moves = await db.query('select m.*, i.name, i.unit, b.batch_no from stock_moves m join items i on i.id=m.item_id join batches b on b.id=m.batch_id where m.source_type=$1 and m.source_id=$2 order by m.id', ['PRODUCTION_RUN', runId]);
  const audits = await db.query("select * from audit_log where entity='PRODUCTION_RUN' and entity_id=$1 order by id", [runId]);
  const good = run.good_output === null ? null : D(run.good_output);
  const shortfall = good ? D(run.expected_output).minus(good) : null;
  return {
    run: { ...run, runNo: 'BATCH-' + String(runId).padStart(5, '0') },
    lines, costs, moves, audits, costing: await runCosting(db, runId),
    wastage: good ? { expected: D(run.expected_output).toFixed(3), good: good.toFixed(3), shortfall: shortfall.toFixed(3), damagedPackaging: D(run.damaged_packaging || 0).toFixed(3), unexplained: shortfall.minus(run.damaged_packaging || 0).toFixed(3) } : null,
  };
}
// Product-wise costing over a period (weighted by output), with margin against current price.
async function productCosting(db, from, to) {
  const runs = await db.query("select r.id, r.product_id from production_runs r where r.status='COMPLETED' and r.run_date between $1 and $2 order by r.id", [from, to]);
  const by = new Map();
  for (const r of runs) {
    const c = await runCosting(db, r.id);
    const e = by.get(r.product_id) || { productId: r.product_id, product: c.product, runs: 0, good: D(0), mat: D(0), pack: D(0), direct: D(0), alloc: D(0), price: c.sellingPrice };
    e.runs++; e.good = e.good.plus(c.goodOutput); e.mat = e.mat.plus(c.materialCost); e.pack = e.pack.plus(c.packagingCost);
    e.direct = e.direct.plus(c.labour).plus(c.powerGas).plus(c.otherDirect); e.alloc = e.alloc.plus(c.allocatedOverhead); by.set(r.product_id, e);
  }
  return [...by.values()].map(e => {
    const total = e.mat.plus(e.pack).plus(e.direct).plus(e.alloc), cpp = e.good.gt(0) ? round(total.div(e.good), 4) : D(0), price = D(e.price);
    return { productId: e.productId, product: e.product, runs: e.runs, goodPackets: e.good.toFixed(0), materialCost: e.mat.toFixed(2), packagingCost: e.pack.toFixed(2), directOverhead: e.direct.toFixed(2), allocatedOverhead: e.alloc.toFixed(2), totalCost: total.toFixed(2),
      costPerPacket: round(cpp, 2).toFixed(2), sellingPrice: price.toFixed(2), margin: round(price.minus(cpp), 2).toFixed(2), marginPct: price.gt(0) ? round(price.minus(cpp).div(price).times(100), 2).toFixed(2) : '0.00' };
  });
}
module.exports = { tolerance, effectiveBom, productInfo, startRun, completeRun, addCost, removeCost, voidRun, runCosting, listRuns, runDetail, productCosting };
