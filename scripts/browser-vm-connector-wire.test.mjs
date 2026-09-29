import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeClientFrame, encodeContinue, encodeData, encodeClose, createWireBudget } from '../tools/browser-vm/connector/wire.mjs';

// Literal protocol fixtures, independent of the production encoders.
const connect = Buffer.from('010100000001bb016769746875622e636f6d', 'hex');
test('WISP v1 TCP CONNECT, DATA and CLOSE decode exact little-endian fixtures', () => {
  assert.deepEqual(decodeClientFrame(connect), { type: 'connect', id: 1, target: { hostname: 'github.com', port: 443 } });
  const data = decodeClientFrame(Buffer.from('020403020168656c6c6f', 'hex'));
  assert.equal(data.type, 'data'); assert.equal(data.id, 0x01020304); assert.equal(data.data.toString(), 'hello');
  assert.deepEqual(decodeClientFrame(Buffer.from('040100000002', 'hex')), { type: 'close', id: 1 });
});
test('invalid direction, ID zero, malformed lengths, UDP and non-ASCII hostname fail closed', () => {
  const invalid = ['', '0001000000', '020000000001', '0201000000', '030100000010000000',
    '0401000000', '04010000000200', '040100000000', '010100000001bb01',
    '010100000002bb016769746875622e636f6d', '010100000001bb01ff', '010100000001bb01610062'];
  for (const hex of invalid) assert.throws(() => decodeClientFrame(Buffer.from(hex, 'hex')), /Invalid connector frame/);
  assert.throws(() => decodeClientFrame(new Uint8Array(connect)));
  assert.throws(() => decodeClientFrame(Buffer.concat([Buffer.from('0201000000','hex'), Buffer.alloc(16385)])));
  assert.throws(() => decodeClientFrame(Buffer.concat([connect.subarray(0,8), Buffer.alloc(254, 97)])));
  assert.equal(decodeClientFrame(Buffer.concat([Buffer.from('0201000000','hex'), Buffer.alloc(16384)])).data.length, 16384);
});
test('server frames match independent WISP literals and reject invalid sizes/windows/IDs', () => {
  assert.equal(encodeContinue(0,16).toString('hex'), '030000000010000000');
  assert.equal(encodeContinue(0x01020304,16).toString('hex'), '030403020110000000');
  assert.equal(encodeData(1,Buffer.from('hi')).toString('hex'), '02010000006869');
  assert.equal(encodeClose(1).toString('hex'), '040100000002');
  for (const id of [-1,0x100000000,1.5]) assert.throws(() => encodeContinue(id,16));
  assert.throws(() => encodeContinue(1,17)); assert.throws(() => encodeContinue(1,0));
  assert.throws(() => encodeData(0,Buffer.from('x'))); assert.throws(() => encodeClose(0));
  assert.throws(() => encodeData(1,Buffer.alloc(0))); assert.throws(() => encodeData(1,Buffer.alloc(16385)));
});
test('wire budget counts actual empty fragments, control frames and outbound frames', () => {
  const budget = createWireBudget(), emptyMasked = Buffer.from('008000000000','hex');
  for (let i=0;i<99998;i++) assert.equal(budget.inbound(emptyMasked),true);
  assert.equal(budget.outbound(1),true);
  assert.equal(budget.inbound(emptyMasked),false); assert.equal(budget.outbound(0),false);
});
test('wire budget counts real bytes and reserved termination overhead together', () => {
  const max = 64*1024*1024, mixed = createWireBudget();
  assert.equal(mixed.inbound(Buffer.from('82840000000001020304','hex')),true);
  assert.equal(mixed.outbound(max-139-10-10),true); assert.equal(mixed.outbound(0),false);
  for (const size of [-1,NaN,Infinity,1.5]) assert.equal(createWireBudget().outbound(size),false);
});
test('raw meter handles every header split, ignores payload resembling headers, and meters 64-bit lengths', () => {
  for (let split=0;split<=10;split++) {
    const budget = createWireBudget(), packet=Buffer.from('82840000000000800000','hex');
    assert.equal(budget.inbound(packet.subarray(0,split)),true);
    assert.equal(budget.inbound(packet.subarray(split)),true);
    for(let i=0;i<99998;i++) assert.equal(budget.outbound(0),true);
    assert.equal(budget.outbound(0),false);
  }
  for(const header of ['82fe010000000000','82ff000000000000010000000000']) {
    const b=createWireBudget(); for(const byte of Buffer.from(header,'hex')) assert.equal(b.inbound(Buffer.from([byte])),true);
    assert.equal(b.inbound(Buffer.alloc(256)),true); assert.equal(b.inbound(Buffer.from('898000000000','hex')),true);
    for(let i=0;i<99997;i++) assert.equal(b.outbound(0),true);
    assert.equal(b.outbound(0),false);
  }
  assert.equal(createWireBudget().inbound(Buffer.from('82ff800000000000000000000000','hex')),false);
});
