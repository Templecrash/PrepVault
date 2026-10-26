import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('every handbook shipped matches its verified offline catalog and has provenance', async () => {
  const books = JSON.parse(await readFile(new URL('../public/handbooks/sources.json', import.meta.url), 'utf8'));
  assert.ok(books.length > 0);
  assert.equal(new Set(books.map(book => book.id)).size, books.length);
  assert.equal(new Set(books.map(book => book.path)).size, books.length);
  for (const book of books) {
    assert.match(book.path, /^\/handbooks\/[a-z0-9-]+\.pdf$/);
    assert.equal(new URL(book.sourceUrl).protocol, 'https:');
    for (const field of ['title', 'publisher', 'edition', 'category', 'description', 'license', 'citation']) assert.ok(book[field], `${book.id}: ${field}`);
    assert.ok(['everyone', 'professional'].includes(book.audience));
    const bytes = await readFile(new URL(`../public${book.path}`, import.meta.url));
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.equal(bytes.length, book.bytes, `${book.id}: byte count`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), book.sha256, `${book.id}: content hash`);
  }
});
