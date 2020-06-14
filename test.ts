import 'fake-indexeddb/auto'
import * as E from './index'
import test from 'ava'

test('base', async t => {
  @E.store('test', { keyPath: 'id', autoIncrement: true, indexes: { name: { unique: true } } })
  class Test extends E.Store <{ a: string }> { }
  @E.store('notExists')
  class NotExists extends E.Store { }
  const db = await E.default('test', [Test])
  t.deepEqual(
    (await db.transaction([Test], async it => {
      await it.put({ a: '123', name: 'abc' })
      await it.add({ a: 'bc', name: 'bbb' })
      return it.get(1)
    }, true))?.a,
    '123'
  )
  await t.notThrowsAsync(() => db.transaction([Test], async it => {
    t.is(await it.count(), 2)
    await it.delete(1)
    await it.getAll()
    await it.getAllKeys()
    t.truthy(await it.getKey(2))
    await (await it.openCursor(2))!.update({ a: 'bbb', name: 'jah', id: 2 })
    ;(await it.openKeyCursor(2))!.continue()
    t.falsy(await it.openKeyCursor(4))
    t.falsy(await it.openCursor(4))
    await it.clear()
    t.is(await it.count(), 0)

    t.true(it.index('name').unique)
    t.is(it.index('name').name, 'name')
    t.false(it.index('name').multiEntry)
    t.is(it.index('name').keyPath, 'name')
  }, true))
  await t.throwsAsync(() => db.transaction([NotExists], () => {}))
  await t.throwsAsync(() => db.transaction([Test], it => it.add({ a: 'hah', name: 'aa' })))
  t.is(db.name, 'test')
  t.is(db.storeNames.length, 1)
  t.is(db.version, 1)
  t.true(db.close())
  t.false(db.close())
  t.throws(() => db.deleteStore(Test))
  t.throws(() => db.deleteStore('test'))
  t.throws(() => db.deleteStore([NotExists, 'test']))
  await t.throwsAsync(() => E.default('aa', [NotExists, NotExists]))
})
