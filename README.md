# idb-wrapped [![JavaScript Style Guide](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/) ![npm](https://img.shields.io/npm/v/idb-wrapped) [test](https://github.com/ShirasawaSama/idb-wrapped/workflows/Test/badge.svg) [![codecov](https://codecov.io/gh/ShirasawaSama/idb-wrapped/branch/master/graph/badge.svg)](https://codecov.io/gh/ShirasawaSama/idb-wrapped) [![GitHub stars](https://img.shields.io/github/stars/ShirasawaSama/idb-wrapped.svg?style=social&label=Stars)](https://github.com/ShirasawaSama/idb-wrapped)

A warp of IndexedDB.

## Install

```bash
npm install idb-wrapped
```

## Usage

```typescript
import openDatabase, { Store, store } from 'idb-wrapped'

// Define stores:
@store('storeName', { autoIncrement: true })
class Test extends Store <{ a: string }> { }

@store('storeName1', { keyPath: 'id', autoIncrement: true, indexes: { name: { unique: true } } })
class Test1 extends Store <{ b: string }> { }

@store('storeName3')
class Test3 extends Store <string> {
  public static createStore (db: Database) { /* db.createStore(...) */ }
}

// Open databse:
const fn = async () => {
  const db = await openDatabase('databaseName', [Test, Test1, Test2])
  const ret1 = await db.transaction([Test], async (it: Test) => {
    await it.put({ a: '123' })
    await it.add({ a: 'bc' })
    const obj = await it.get(1)
    obj.a = '233'
    await it.put(obj, 1)

    return obj.a
  }, true /* readwrite */)
  console.log(ret1) // '233'

  const [obj1, obj2] = await db.transaction([Test], (it: Test) => Promise.all([it.get(1), it.get(2)])) // readonly
  console.log(obj1, obj2)
}

fn().catch(console.error)
```

### Notice

Due to the limitations of IndexedDB, you cannot use other **Promise** in a **transaction**.

```typescript
await db.transaction([Test], async (it: Test) => {
  const obj = await it.get(1)
  const ret = await fetch('https://example.com').then(it => it.text()) // Note here, this is not allowed!
  obj.a = ret
  await it.put(ret, 1) // An exception will occur here
}, true)
```

So you should use it like this:

```typescript
const obj = await db.transaction([Test], it => it.get(1))
obj.a = await fetch('https://example.com').then(it => it.text())
await db.transaction([Test], async it => {
  await it.put(obj, 1)
}, true)
```

## Author

Shirasawa

## License

[MIT](./LICENSE)
