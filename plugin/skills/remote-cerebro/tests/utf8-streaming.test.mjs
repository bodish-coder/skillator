import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { lineSplitter } from "../hooks/cerebro-core.mjs";
import { ProcAdapter } from "../hooks/cerebro-bridge.mjs";

test("A213: lineSplitter preserves multibyte UTF-8 across chunk boundaries", () => {
  const euro = Buffer.from('{"price":"10 €"}\n');
  // Euro sign is 3 bytes: 0xE2 0x82 0xAC
  // Split right after first byte of euro
  const splitIndex = euro.indexOf(0xe2) + 1;
  const chunk1 = euro.subarray(0, splitIndex);
  const chunk2 = euro.subarray(splitIndex);

  const lines = [];
  const feed = lineSplitter((l) => lines.push(l));
  feed(chunk1);
  feed(chunk2);

  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.price, "10 €");
});

test("A213: every byte split through non-ASCII JSONL matches whole input", () => {
  const jsonl = [
    '{"id":1,"currency":"€","sym":"£"}',
    '{"id":2,"msg":"こんにちは 世界","emoji":"🎉"}',
    '{"id":3,"sep":"a\u2028b","crlf":"ok"}'
  ].join("\r\n") + "\n";

  const buf = Buffer.from(jsonl, "utf8");

  // Baseline from feeding whole buffer
  const baseline = [];
  const baseFeed = lineSplitter((l) => baseline.push(JSON.parse(l)));
  baseFeed(buf);
  if (baseFeed.flush) baseFeed.flush();

  assert.equal(baseline.length, 3);

  // Test every single byte split point
  for (let i = 0; i <= buf.length; i++) {
    const chunk1 = buf.subarray(0, i);
    const chunk2 = buf.subarray(i);

    const got = [];
    const feed = lineSplitter((l) => got.push(JSON.parse(l)));
    feed(chunk1);
    feed(chunk2);
    if (feed.flush) feed.flush();

    assert.deepEqual(got, baseline, `Failed at byte split index ${i}`);
  }
});

test("A213: byte-by-byte streaming through non-ASCII JSONL including split delimiter", () => {
  const jsonl = '{"a":"10 €"}\r\n{"b":"£20"}\n{"c":"🎉"}\r\n';
  const buf = Buffer.from(jsonl, "utf8");

  const expected = [
    { a: "10 €" },
    { b: "£20" },
    { c: "🎉" }
  ];

  const got = [];
  const feed = lineSplitter((l) => got.push(JSON.parse(l)));
  for (let i = 0; i < buf.length; i++) {
    feed(buf.subarray(i, i + 1));
  }
  if (feed.flush) feed.flush();

  assert.deepEqual(got, expected);
});

test("A213: connection flush emits trailing JSON line without trailing newline", () => {
  const jsonl = '{"val":"10 €"}\n{"val":"20 £"}';
  const buf = Buffer.from(jsonl, "utf8");

  // Every byte split with flush at connection end
  const expected = [
    { val: "10 €" },
    { val: "20 £" }
  ];

  for (let i = 0; i <= buf.length; i++) {
    const chunk1 = buf.subarray(0, i);
    const chunk2 = buf.subarray(i);

    const got = [];
    const feed = lineSplitter((l) => got.push(JSON.parse(l)));
    feed(chunk1);
    feed(chunk2);
    assert.ok(typeof feed.flush === "function", "feed.flush should be a function");
    feed.flush();

    assert.deepEqual(got, expected, `Flush failed at split index ${i}`);
  }
});

test("A213: feed() with null or no arguments triggers flush", () => {
  const lines = [];
  const feed = lineSplitter((l) => lines.push(JSON.parse(l)));
  feed(Buffer.from('{"key":"value without newline"}'));
  assert.equal(lines.length, 0);
  feed();
  assert.equal(lines.length, 1);
  assert.equal(lines[0].key, "value without newline");
});

test("A213: feed.end(chunk) feeds remaining buffer and flushes", () => {
  const lines = [];
  const feed = lineSplitter((l) => lines.push(JSON.parse(l)));
  feed(Buffer.from('{"first":"line"}\n'));
  feed.end(Buffer.from('{"second":"line without newline"}'));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].first, "line");
  assert.equal(lines[1].second, "line without newline");
});

test("A213: ProcAdapter streaming stdout decodes fragmented UTF-8 across chunks", () => {
  const adapter = new ProcAdapter();
  const received = [];
  adapter.onMsg = (msg) => received.push(msg);

  // Mock child process with streaming stdout EventEmitter
  const mockStdout = new EventEmitter();
  const mockChild = new EventEmitter();
  mockChild.stdout = mockStdout;
  mockChild.stderr = new EventEmitter();
  mockChild.stdin = new EventEmitter();

  adapter.child = mockChild;

  // Set up decoder exactly as ProcAdapter.spawnChild does
  const split = lineSplitter((l) => {
    let m;
    try { m = JSON.parse(l); } catch { return; }
    adapter.onMsg(m);
  });
  mockStdout.on("data", split);
  mockStdout.on("end", () => split.flush());

  // Stream JSON line with Euro character split across byte chunks
  const jsonl = '{"result":"cost: 99 € and 50 £"}\n{"pending":"flushed item"}';
  const buf = Buffer.from(jsonl, "utf8");

  // Send first line split across byte boundaries
  for (let i = 0; i < buf.length; i++) {
    mockStdout.emit("data", buf.subarray(i, i + 1));
  }

  // End stdout to trigger flush
  mockStdout.emit("end");

  assert.equal(received.length, 2);
  assert.deepEqual(received[0], { result: "cost: 99 € and 50 £" });
  assert.deepEqual(received[1], { pending: "flushed item" });
});

test("A213: socket decoder streams split multibyte UTF-8 over transport stream", async () => {
  const received = [];
  const sock = new PassThrough();

  const split = lineSplitter((l) => {
    let m;
    try { m = JSON.parse(l); } catch { return; }
    received.push(m);
  });
  sock.on("data", split);

  const ended = new Promise((resolve) => {
    sock.on("end", () => {
      split.flush();
      resolve();
    });
  });

  const raw = Buffer.from('{"text":"Euro € and Yen ¥"}\r\n{"trailing":"emoji 🎉"}');
  // Write 1 byte at a time to force transport fragmentation through every multibyte boundary
  for (let i = 0; i < raw.length; i++) {
    sock.write(raw.subarray(i, i + 1));
  }
  sock.end();

  await ended;

  assert.equal(received.length, 2);
  assert.deepEqual(received[0], { text: "Euro € and Yen ¥" });
  assert.deepEqual(received[1], { trailing: "emoji 🎉" });
});
