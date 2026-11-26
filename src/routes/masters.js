'use strict';
const V = require('../validate');
const express = require('express');
const { D } = require('../money');
const { wrap, int, req$ } = require('../http');
const { allow, hashPassword } = require('../auth');
const { bad, notFound, conflict } = require('../errors');
const { audit } = require('../audit');
const { validateGstin, stateOfGstin } = require('../gst');
const { nowTs } = require('../clock');
const units = require('../units');
const stock = require('../services/stock');
const prod = require('../services/production');

module.exports = db => {
  const r = express.Router();
  const ALL = ['ADMIN', 'PRODUCTION', 'SALES', 'AUDITOR', 'OWNER'], BACK = ['ADMIN', 'PRODUCTION', 'AUDITOR', 'OWNER'];

  // Everything a salesman's phone needs to work offline.
  r.get('/bootstrap', allow(...ALL), wrap(async (req, res) => {
    const customers = await db.query('select c.id, c.name, c.type, c.state_code, c.address, c.phone, c.gstin, s.name as state from customers c join states s on s.code=c.state_code where c.active order by c.name');
    const prices = await db.query('select customer_id, product_id, price from customer_prices');
    const products = await db.query(`select p.item_id as id, i.name, i.code, p.pack_size_g, p.price, p.gst_rate, p.hsn, p.carton_capacity from products p join items i on i.id=p.item_id where i.active order by i.name`);
    const biz = await db.one('select name, state_code from business where id=1');
    res.json({ customers, customerPrices: prices, products, units: units.list(), business: biz, serverTime: nowTs() });
  }));

  // ----- items (raw / packaging / finished) with live balances -----
  r.get('/items', allow(...BACK), wrap(async (req, res) => res.json(await stock.balances(db, { asOn: req.query.asOn, type: req.query.type }))));
  r.post('/items', allow('ADMIN', 'PRODUCTION'), wrap(async (req, res) => {
    const b = req.body; req$(b, 'code', 'name', 'type', 'unit');
    if (!['RAW', 'PACKAGING'].includes(b.type)) throw bad('Use the product screen to create finished goods');
    const id = await db.tx(async tx => {
      const row = await tx.one('insert into items(code,name,type,unit,reorder_level) values($1,$2,$3,$4,$5) returning id', [b.code.trim().toUpperCase(), b.name.trim(), b.type, b.unit, D(b.reorderLevel || 0).toFixed(4)]);
      await audit(tx, req.session.user.username, 'CREATE', 'ITEM', row.id, `${b.name} created`); return row.id;
    });
    res.status(201).json({ id });
  }));
  r.put('/items/:id', allow('ADMIN', 'PRODUCTION'), wrap(async (req, res) => {
    const id = int(req.params.id), b = req.body;
    await db.tx(async tx => {
      const it = await tx.one('select * from items where id=$1', [id]); if (!it) throw notFound();
      await tx.query('update items set name=$1, reorder_level=$2, active=$3 where id=$4', [b.name ?? it.name, D(b.reorderLevel ?? it.reorder_level).toFixed(4), b.active ?? it.active, id]);
      await audit(tx, req.session.user.username, 'EDIT', 'ITEM', id, `${it.name} edited`, { before: { name: it.name, reorder: it.reorder_level, active: it.active }, after: b });
    });
    res.json({ ok: true });
  }));
  r.get('/items/:id/batches', allow(...BACK), wrap(async (req, res) => res.json(await stock.batchBalances(db, int(req.params.id)))));

  // ----- BOMs (bulk recipe shared by pack sizes) -----
  r.get('/boms', allow(...BACK), wrap(async (req, res) => {
    const boms = await db.query('select * from boms order by id');
    for (const b of boms) b.lines = await db.query('select bl.*, i.name, i.unit as stock_unit from bom_lines bl join items i on i.id=bl.item_id where bl.bom_id=$1 order by bl.id', [b.id]);
    res.json(boms);
  }));
  const saveBom = async (tx, user, id, b) => {
    req$(b, 'name', 'batchOutputG');
    if (!Array.isArray(b.lines) || !b.lines.length) throw bad('A BOM needs at least one material line');
    if (!D(b.batchOutputG).gt(0)) throw bad('Batch output must be positive');
    for (const l of b.lines) { const it = await tx.one("select unit from items where id=$1 and type='RAW'", [l.itemId]); if (!it) throw bad('BOM lines must be raw materials (packaging belongs to the product)'); units.convert(1, l.unit || it.unit, it.unit); if (!D(l.qty).gt(0)) throw bad('Quantities must be positive'); }
    let bomId = id;
    if (!id) bomId = (await tx.one('insert into boms(name,batch_output_g,notes) values($1,$2,$3) returning id', [b.name, D(b.batchOutputG).toFixed(3), b.notes || null])).id;
    else { const old = await tx.one('select * from boms where id=$1', [id]); if (!old) throw notFound(); await tx.query('update boms set name=$1,batch_output_g=$2,notes=$3,version=version+1 where id=$4', [b.name, D(b.batchOutputG).toFixed(3), b.notes || null, id]); await tx.query('delete from bom_lines where bom_id=$1', [id]); }
    for (const l of b.lines) { const it = await tx.one('select unit from items where id=$1', [l.itemId]); await tx.query('insert into bom_lines(bom_id,item_id,qty,unit) values($1,$2,$3,$4)', [bomId, l.itemId, D(l.qty).toFixed(4), l.unit || it.unit]); }
    await audit(tx, user.username, id ? 'EDIT' : 'CREATE', 'BOM', bomId, `${b.name} ${id ? 'revised' : 'created'}`, { after: b });
    return bomId;
  };
  r.post('/boms', allow('ADMIN', 'PRODUCTION'), wrap(async (req, res) => res.status(201).json({ id: await db.tx(tx => saveBom(tx, req.session.user, null, req.body)) })));
  r.put('/boms/:id', allow('ADMIN', 'PRODUCTION'), wrap(async (req, res) => { await db.tx(tx => saveBom(tx, req.session.user, int(req.params.id), req.body)); res.json({ ok: true }); }));

  // ----- products -----
  r.get('/products', allow(...ALL), wrap(async (req, res) => {
    const rows = await db.query(`select p.*, i.name, i.code, i.active, b.name as bom_name, b.batch_output_g from products p join items i on i.id=p.item_id join boms b on b.id=p.bom_id order by i.id`);
    for (const p of rows) {
      p.packets_per_batch = D(p.batch_output_g).div(p.pack_size_g).toFixed(3);
      p.packaging = await db.query('select pp.item_id, pp.qty_per_packet, i.name, i.unit from product_packaging pp join items i on i.id=pp.item_id where pp.product_id=$1', [p.item_id]);
    }
    res.json(rows);
  }));
  r.get('/products/:id/bom', allow(...BACK), wrap(async (req, res) => res.json(await prod.effectiveBom(db, int(req.params.id), req.query.batches || 1))));
  const saveProduct = async (tx, user, id, b) => {
    req$(b, 'name', 'bomId', 'packSizeG', 'hsn', 'gstRate', 'price');
    if (!D(b.packSizeG).gt(0) || D(b.price).lt(0) || D(b.gstRate).lt(0)) throw bad('Invalid pack size / price / GST rate');
    if (!(await tx.one('select 1 x from boms where id=$1', [b.bomId]))) throw bad('Unknown BOM');
    let pid = id;
    if (!id) {
      req$(b, 'code');
      pid = (await tx.one("insert into items(code,name,type,unit,reorder_level) values($1,$2,'FINISHED','packet',$3) returning id", [b.code.trim().toUpperCase(), b.name.trim(), D(b.reorderLevel || 0).toFixed(4)])).id;
      await tx.query('insert into products(item_id,bom_id,pack_size_g,hsn,gst_rate,price,carton_capacity,shelf_life_days) values($1,$2,$3,$4,$5,$6,$7,$8)', [pid, b.bomId, D(b.packSizeG).toFixed(3), b.hsn, D(b.gstRate).toFixed(2), D(b.price).toFixed(2), b.cartonCapacity || 1, b.shelfLifeDays || 90]);
    } else {
      const old = await tx.one('select p.*, i.name from products p join items i on i.id=p.item_id where p.item_id=$1', [id]); if (!old) throw notFound();
      await tx.query('update products set bom_id=$1,pack_size_g=$2,hsn=$3,gst_rate=$4,price=$5,carton_capacity=$6,shelf_life_days=$7 where item_id=$8', [b.bomId, D(b.packSizeG).toFixed(3), b.hsn, D(b.gstRate).toFixed(2), D(b.price).toFixed(2), b.cartonCapacity || old.carton_capacity, b.shelfLifeDays || old.shelf_life_days, id]);
      await tx.query('update items set name=$1, active=$2 where id=$3', [b.name, b.active ?? true, id]);
      await audit(tx, user.username, 'EDIT', 'PRODUCT', id, `${old.name} edited`, { before: { price: old.price, gst: old.gst_rate, hsn: old.hsn, pack: old.pack_size_g }, after: b });
    }
    if (Array.isArray(b.packaging)) {
      await tx.query('delete from product_packaging where product_id=$1', [pid]);
      for (const p of b.packaging) { if (!(await tx.one("select 1 x from items where id=$1 and type='PACKAGING'", [p.itemId]))) throw bad('Packaging must be a packaging item'); await tx.query('insert into product_packaging values($1,$2,$3)', [pid, p.itemId, D(p.qtyPerPacket).toFixed(6)]); }
    }
    if (!id) await audit(tx, user.username, 'CREATE', 'PRODUCT', pid, `${b.name} created`);
    return pid;
  };
  r.post('/products', allow('ADMIN'), wrap(async (req, res) => res.status(201).json({ id: await db.tx(tx => saveProduct(tx, req.session.user, null, req.body)) })));
  r.put('/products/:id', allow('ADMIN'), wrap(async (req, res) => { await db.tx(tx => saveProduct(tx, req.session.user, int(req.params.id), req.body)); res.json({ ok: true }); }));

  // ----- customers / suppliers -----
  const party = async (tx, user, kind, id, b) => {
    req$(b, 'name', 'stateCode');
    if (!(await tx.one('select 1 x from states where code=$1', [b.stateCode]))) throw bad('Unknown state code');
    b.phone = V.phone(b.phone); b.email = V.email(b.email);
    const g = b.gstin ? b.gstin.trim().toUpperCase() : null;
    if (g && !validateGstin(g)) throw bad('Invalid GSTIN (format or checksum)');
    if (g && stateOfGstin(g) !== b.stateCode) throw bad('GSTIN state code does not match the selected state');
    if (kind === 'customers') {
      if (!['RETAILER', 'DISTRIBUTOR'].includes(b.type)) throw bad('Type must be RETAILER or DISTRIBUTOR');
      if (!id) { const nid = (await tx.one('insert into customers(name,type,address,state_code,gstin,phone,email,credit_days) values($1,$2,$3,$4,$5,$6,$7,$8) returning id', [b.name, b.type, b.address || null, b.stateCode, g, b.phone || null, b.email || null, b.creditDays ?? 30])).id; await audit(tx, user.username, 'CREATE', 'CUSTOMER', nid, `${b.name} created`); return nid; }
      await tx.query('update customers set name=$1,type=$2,address=$3,state_code=$4,gstin=$5,phone=$6,email=$7,credit_days=$8,active=$9 where id=$10', [b.name, b.type, b.address || null, b.stateCode, g, b.phone || null, b.email || null, b.creditDays ?? 30, b.active ?? true, id]);
    } else {
      if (!id) { const nid = (await tx.one('insert into suppliers(name,gstin,state_code,address,phone,email) values($1,$2,$3,$4,$5,$6) returning id', [b.name, g, b.stateCode, b.address || null, b.phone || null, b.email || null])).id; await audit(tx, user.username, 'CREATE', 'SUPPLIER', nid, `${b.name} created`); return nid; }
      await tx.query('update suppliers set name=$1,gstin=$2,state_code=$3,address=$4,phone=$5,email=$6,active=$7 where id=$8', [b.name, g, b.stateCode, b.address || null, b.phone || null, b.email || null, b.active ?? true, id]);
    }
    await audit(tx, user.username, 'EDIT', kind === 'customers' ? 'CUSTOMER' : 'SUPPLIER', id, `${b.name} edited`, { after: b });
    return id;
  };
  for (const kind of ['customers', 'suppliers']) {
    r.get('/' + kind, allow(...BACK, 'SALES'), wrap(async (req, res) => res.json(await db.query(`select t.*, s.name as state from ${kind} t join states s on s.code=t.state_code order by t.name`))));
    r.post('/' + kind, allow('ADMIN'), wrap(async (req, res) => res.status(201).json({ id: await db.tx(tx => party(tx, req.session.user, kind, null, req.body)) })));
    r.put('/' + kind + '/:id', allow('ADMIN'), wrap(async (req, res) => { await db.tx(tx => party(tx, req.session.user, kind, int(req.params.id), req.body)); res.json({ ok: true }); }));
  }
  r.get('/customers/:id/prices', allow('ADMIN', 'AUDITOR', 'OWNER'), wrap(async (req, res) => res.json(await db.query('select cp.*, i.name from customer_prices cp join items i on i.id=cp.product_id where customer_id=$1', [int(req.params.id)]))));
  r.put('/customers/:id/prices', allow('ADMIN'), wrap(async (req, res) => {          // body: {prices:[{productId, price}]} ; price null removes
    const id = int(req.params.id);
    await db.tx(async tx => {
      for (const p of req.body.prices || []) {
        if (p.price === null || p.price === '') await tx.query('delete from customer_prices where customer_id=$1 and product_id=$2', [id, p.productId]);
        else { if (D(p.price).lt(0)) throw bad('Price cannot be negative'); await tx.query('insert into customer_prices values($1,$2,$3) on conflict (customer_id,product_id) do update set price=excluded.price', [id, p.productId, D(p.price).toFixed(2)]); }
      }
      await audit(tx, req.session.user.username, 'EDIT', 'CUSTOMER', id, 'Customer price list changed', { after: req.body.prices });
    });
    res.json({ ok: true });
  }));

  // ----- users, settings, business -----
  r.get('/users', allow('ADMIN'), wrap(async (req, res) => res.json(await db.query('select id, username, full_name, role, active, created_at from users order by id'))));
  r.post('/users', allow('ADMIN'), wrap(async (req, res) => {
    const b = req.body; req$(b, 'username', 'fullName', 'role', 'password');
    if (String(b.password).length < 8) throw bad('Password must be at least 8 characters');
    const id = await db.tx(async tx => {
      if (await tx.one('select 1 x from users where lower(username)=lower($1)', [b.username])) throw conflict('Username already exists');
      const u = await tx.one('insert into users(username,full_name,password_hash,role,active,created_at) values($1,$2,$3,$4,true,$5) returning id', [b.username.trim(), b.fullName, hashPassword(b.password), b.role, nowTs()]);
      await audit(tx, req.session.user.username, 'CREATE', 'USER', u.id, `${b.username} (${b.role}) created`); return u.id;
    });
    res.status(201).json({ id });
  }));
  r.put('/users/:id', allow('ADMIN'), wrap(async (req, res) => {
    const id = int(req.params.id), b = req.body;
    await db.tx(async tx => {
      const u = await tx.one('select * from users where id=$1', [id]); if (!u) throw notFound();
      if (b.password) { if (String(b.password).length < 8) throw bad('Password must be at least 8 characters'); await tx.query('update users set password_hash=$1 where id=$2', [hashPassword(b.password), id]); }
      if (b.active !== undefined) { if (id === req.session.user.id && !b.active) throw bad('You cannot deactivate yourself'); await tx.query('update users set active=$1 where id=$2', [!!b.active, id]); }
      if (b.fullName) await tx.query('update users set full_name=$1 where id=$2', [b.fullName, id]);
      await audit(tx, req.session.user.username, 'EDIT', 'USER', id, `${u.username} updated${b.password ? ' (password reset)' : ''}`);
    });
    res.json({ ok: true });
  }));
  r.get('/settings', allow(...BACK), wrap(async (req, res) => res.json({ varianceTolerancePct: (await prod.tolerance(db)).toString(), business: await db.one('select * from business where id=1') })));
  r.put('/settings', allow('ADMIN'), wrap(async (req, res) => {
    await db.tx(async tx => {
      if (req.body.varianceTolerancePct !== undefined) {
        const t = D(req.body.varianceTolerancePct); if (t.lt(0) || t.gt(100)) throw bad('Tolerance must be 0-100');
        const old = await prod.tolerance(tx);
        await tx.query("update settings set value=$1 where key='variance_tolerance_pct'", [t.toString()]);
        await audit(tx, req.session.user.username, 'EDIT', 'SETTINGS', null, 'Variance tolerance changed', { before: old.toString(), after: t.toString() });
      }
      const bz = req.body.business;
      if (bz) {
        if (bz.gstin && !validateGstin(bz.gstin)) throw bad('Invalid GSTIN');
        await tx.query('update business set name=coalesce($1,name), gstin=coalesce($2,gstin), address=coalesce($3,address), phone=coalesce($4,phone), email=coalesce($5,email), bank_details=coalesce($6,bank_details), terms=coalesce($7,terms) where id=1', [bz.name, bz.gstin, bz.address, bz.phone, bz.email, bz.bankDetails, bz.terms]);
        await audit(tx, req.session.user.username, 'EDIT', 'SETTINGS', null, 'Business details changed', { after: bz });
      }
    });
    res.json({ ok: true });
  }));
  r.get('/states', allow(...ALL), wrap(async (req, res) => res.json(await db.query('select * from states order by name'))));
  r.get('/audit', allow('ADMIN', 'AUDITOR', 'OWNER'), wrap(async (req, res) => {
    const w = [], p = [];
    if (req.query.entity) { p.push(req.query.entity.toUpperCase()); w.push(`entity=$${p.length}`); }
    if (req.query.entityId) { p.push(int(req.query.entityId)); w.push(`entity_id=$${p.length}`); }
    if (req.query.actor) { p.push(req.query.actor); w.push(`actor=$${p.length}`); }
    res.json(await db.query(`select * from audit_log ${w.length ? 'where ' + w.join(' and ') : ''} order by id desc limit 500`, p));
  }));
  return r;
};
