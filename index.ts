/* eslint-disable no-dupe-class-members */
import 'reflect-metadata'

export const getStoreName = (store: typeof Store) => {
  const name = Reflect.getMetadata('idb:storeName', store)
  /* istanbul ignore next */ if (typeof name !== 'string') throw new Error('This store do not have a name: ' + store)
  return name
}

export interface OCE {
  oncomplete: Function | null
  onerror: Function | null
  error: any
}
export interface OSE <R> {
  onerror: Function | null
  error: any
  result: R
  onsuccess: Function | null
}
export const promisify = <T extends OCE | OSE<any> = any> (object: T) => new Promise<T extends OSE<infer V> ? V : void>((resolve, reject) => {
  if ('onsuccess' in object) (object as OSE<any>).onsuccess = () => resolve((object as any).result)
  else (object as OCE).oncomplete = () => resolve()
  object.onerror = function () { reject(this.error) }
})

export interface StoreOptions extends IDBObjectStoreParameters {
  indexes?: Record<string, {
    keyPath?: string | string[]
  } & IDBIndexParameters>
  onCreate? (store: IDBObjectStore, database: Database, name: string, options: this): any
}
export const store = (name: string, options?: StoreOptions) => {
  return (C: typeof Store) => {
    Reflect.defineMetadata('idb:storeName', name, C)
    Reflect.defineMetadata('idb:storeOptions', options, C)
    return C
  }
}

export interface IDBCursorWithType <V = any> {
  readonly direction: IDBCursorDirection
  readonly key: IDBValidKey
  readonly primaryKey: IDBValidKey
  readonly source: IDBObjectStore | IDBIndex
  advance (count: number): void
  continue (key?: IDBValidKey): void
  continuePrimaryKey (key: IDBValidKey, primaryKey: IDBValidKey): void
  delete (): Promise<void>
  update <T extends V> (value: T): Promise<IDBValidKey>
}
export interface IDBCursorWithTypeAndValue <V = any> extends IDBCursorWithType <V> {
  readonly value: V | undefined
}
export class IndexOrStore <V = any> {
  // eslint-disable-next-line no-useless-constructor
  constructor (
    public readonly instance: Pick<IDBObjectStore, 'openCursor' | 'openKeyCursor' | 'get' | 'getAll' | 'getAllKeys' | 'getKey' | 'count'>
  ) { }

  public get <T = V> (query: IDBValidKey | IDBKeyRange): Promise<T | undefined> { return promisify(this.instance.get(query)) }
  public getAll <T = V> (query?:IDBValidKey | IDBKeyRange, count?: number): Promise<T[]> { return promisify(this.instance.getAll(query, count)) }
  public getAllKeys (query?: IDBValidKey | IDBKeyRange, count?: number) { return promisify(this.instance.getAllKeys(query, count)) }
  public getKey (query: IDBValidKey | IDBKeyRange) { return promisify(this.instance.getKey(query)) }
  public count (query?: IDBValidKey | IDBKeyRange) { return promisify(this.instance.count(query)) }

  public async openCursor <T = V> (query?: IDBValidKey | IDBKeyRange, direction?: IDBCursorDirection) {
    const ret: IDBCursorWithTypeAndValue<T> | null = await promisify(this.instance.openCursor(query, direction)) as any
    if (ret) {
      const update: any = ret.update
      const del: any = ret.delete
      ret.update = (value: T) => promisify(update.call(ret, value)) as any
      ret.delete = () => promisify(del.call(ret)) as any
    }
    return ret
  }

  public async openKeyCursor <T = V> (query?: IDBValidKey | IDBKeyRange, direction?: IDBCursorDirection) {
    const ret: IDBCursorWithTypeAndValue<T> | null = await promisify(this.instance.openKeyCursor(query, direction)) as any
    if (ret) {
      const update: any = ret.update
      const del: any = ret.delete
      ret.update = (value: T) => promisify(update.call(ret, value)) as any
      ret.delete = () => promisify(del.call(ret)) as any
    }
    return ret
  }
}

export class Index <V = any> extends IndexOrStore <V> {
  public get keyPath () { return this.instance.keyPath }
  public get multiEntry () { return this.instance.multiEntry }
  public get name () { return this.instance.name }
  public get unique () { return this.instance.unique }
  constructor (public readonly instance: IDBIndex) { super(instance) }
}
export class Store <V = any> extends IndexOrStore <V> {
  constructor (public readonly database: Database, public readonly instance: IDBObjectStore) { super(instance) }

  public static createStore (database: Database) {
    return database.createStore(getStoreName(this), Reflect.getMetadata('idb:storeOptions', this))
  }

  public static async upgradeStore (database: Database) { }

  public delete (query: IDBValidKey | IDBKeyRange): Promise<void> { return promisify(this.instance.delete(query)) }
  public clear (): Promise<void> { return promisify(this.instance.clear()) }
  public add <T extends V, K extends IDBValidKey> (value: T, key?: K): Promise<K> { return promisify(this.instance.add(value, key)) as any }
  public put <T extends V, K extends IDBValidKey> (value: T, key?: K): Promise<K> { return promisify(this.instance.put(value, key)) as any }
  public index (name: string) { return new Index<V>(this.instance.index(name)) }
}

export class Database {
  public isClosed = false

  public get name () { return this.db.name }
  public get version () { return this.db.version }
  public get storeNames () { return this.db.objectStoreNames }

  constructor (public readonly db: IDBDatabase, private readonly stores: Set<typeof Store>) {
    db.onclose = () => (this.isClosed = true)
  }

  public async ensureStores () {
    /* istanbul ignore next */ for (const it of this.stores) if (!this.isStoreExists(it)) await it.createStore(this)
    return this
  }

  public close () {
    if (this.isClosed) return false
    this.db.close()
    this.isClosed = true
    return true
  }

  public deleteStore (store: string | typeof Store | Array<string | typeof Store>) {
    ;(Array.isArray(store) ? store : [store]).forEach(it => {
      if (typeof it !== 'string') {
        if (!this.stores.has(it)) throw new Error('This store is not exists: ' + store)
        this.stores.delete(it)
        it = getStoreName(it)
      }
      this.db.deleteObjectStore(it)
    })
  }

  public createStore (name: string, options?: StoreOptions) {
    const store = this.db.createObjectStore(name, options)
    if (options?.indexes) {
      for (const id in options.indexes) {
        const index = options.indexes[id]
        store.createIndex(id, index.keyPath ?? id, index)
      }
    }
    // eslint-disable-next-line no-unused-expressions
    options?.onCreate?.(store, this, name, options)
    return promisify(store.transaction)
  }

  // eslint-disable-next-line no-use-before-define
  public isStoreExists <S extends typeof Store> (store: S) {
    return this.db.objectStoreNames.contains(getStoreName(store))
  }

  public async upgradeDatabase () {
    for (const store of this.stores) {
      /* istanbul ignore next */ if (this.isStoreExists(store)) await store.upgradeStore(this)
      else await store.createStore(this)
    }
    return this
  }

  // eslint-disable-next-line no-use-before-define
  public transaction <R, T0 extends typeof Store = any> (stores: readonly [T0], fn: (store0: InstanceType<T0>) => R, writeable?: boolean): Promise<R>
  public transaction <R, T0 extends typeof Store = any, T1 extends typeof Store = any> (stores: readonly [T0, T1], fn: (store0: InstanceType<T0>,
    store1: InstanceType<T1>) => R, writeable?: boolean): Promise<R>

  public transaction <R, T0 extends typeof Store = any, T1 extends typeof Store = any, T2 extends typeof Store = any> (stores: readonly [T0, T1, T2],
    fn: (store0: InstanceType<T0>, store1: InstanceType<T1>, store2: InstanceType<T2>) => R, writeable?: boolean): Promise<R>

  public transaction <R, T0 extends typeof Store = any, T1 extends typeof Store = any, T2 extends typeof Store = any, T3 extends typeof Store = any>
    (stores: readonly [T0, T1, T2, T3], fn: (store0: InstanceType<T0>, store1: InstanceType<T1>, store2: InstanceType<T2>, store3: InstanceType<T3>) => R,
    writeable?: boolean): Promise<R>

  public transaction <R, T0 extends typeof Store = any, T1 extends typeof Store = any, T2 extends typeof Store = any, T3 extends typeof Store = any,
    T4 extends typeof Store = any> (stores: readonly [T0, T1, T2, T3, T4], fn: (store0: InstanceType<T0>, store1: InstanceType<T1>, store2: InstanceType<T2>,
      store3: InstanceType<T3>, store4: InstanceType<T4>) => R, writeable?: boolean): Promise<R>

  public transaction <R, T0 extends typeof Store = any, T1 extends typeof Store = any, T2 extends typeof Store = any, T3 extends typeof Store = any,
    T4 extends typeof Store = any, T5 extends typeof Store = any> (stores: readonly [T0, T1, T2, T3, T4, T5], fn: (store0: InstanceType<T0>,
      store1: InstanceType<T1>, store2: InstanceType<T2>, store3: InstanceType<T3>, store4: InstanceType<T4>, store5: InstanceType<T5>) => R,
      writeable?: boolean): Promise<R>

  public transaction <R, T0 extends typeof Store = any, T1 extends typeof Store = any, T2 extends typeof Store = any, T3 extends typeof Store = any,
    T4 extends typeof Store = any, T5 extends typeof Store = any, T6 extends typeof Store = any> (stores: readonly [T0, T1, T2, T3, T4, T5, T6],
      fn: (store0: InstanceType<T0>, store1: InstanceType<T1>, store2: InstanceType<T2>, store3: InstanceType<T3>, store4: InstanceType<T4>,
        store5: InstanceType<T5>, store6: InstanceType<T6>) => R, writeable?: boolean): Promise<R>

  public transaction <R, T0 extends typeof Store = any, T1 extends typeof Store = any, T2 extends typeof Store = any, T3 extends typeof Store = any,
    T4 extends typeof Store = any, T5 extends typeof Store = any, T6 extends typeof Store = any, T7 extends typeof Store = any>
    (stores: readonly [T0, T1, T2, T3, T4, T5, T6, T7], fn: (store0: InstanceType<T0>, store1: InstanceType<T1>, store2: InstanceType<T2>,
      store3: InstanceType<T3>, store4: InstanceType<T4>, store5: InstanceType<T5>, store6: InstanceType<T6>, store7: InstanceType<T7>) => R,
      writeable?: boolean): Promise<R>

  public transaction <R, T0 extends typeof Store = any, T1 extends typeof Store = any, T2 extends typeof Store = any, T3 extends typeof Store = any,
    T4 extends typeof Store = any, T5 extends typeof Store = any, T6 extends typeof Store = any, T7 extends typeof Store = any,
    T8 extends typeof Store = any> (stores: readonly [T0, T1, T2, T3, T4, T5, T6, T7, T8], fn: (store0: InstanceType<T0>, store1: InstanceType<T1>,
      store2: InstanceType<T2>, store3: InstanceType<T3>, store4: InstanceType<T4>, store5: InstanceType<T5>, store6: InstanceType<T6>,
      store7: InstanceType<T7>, store8: InstanceType<T8>) => R, writeable?: boolean): Promise<R>

  public transaction <R, T0 extends typeof Store = any, T1 extends typeof Store = any, T2 extends typeof Store = any, T3 extends typeof Store = any,
    T4 extends typeof Store = any, T5 extends typeof Store = any, T6 extends typeof Store = any, T7 extends typeof Store = any,
    T8 extends typeof Store = any, T9 extends typeof Store = any> (stores: readonly [T0, T1, T2, T3, T4, T5, T6, T7, T8, T9], fn: (store0: InstanceType<T0>,
      store1: InstanceType<T1>, store2: InstanceType<T2>, store3: InstanceType<T3>, store4: InstanceType<T4>, store5: InstanceType<T5>,
      store6: InstanceType<T6>, store7: InstanceType<T7>, store8: InstanceType<T8>, store9: InstanceType<T9>) => R, writeable?: boolean): Promise<R>

  public async transaction <R> (stores: readonly (typeof Store)[], fn: (...stores: Store[]) => R, writeable = false) {
    const names = stores.map(it => {
      const name = getStoreName(it)
      if (!this.stores.has(it)) throw new Error('This store name is not exists: ' + name)
      return name
    })
    const tr = this.db.transaction(names, writeable ? 'readwrite' : 'readonly')
    const objects = names.map(it => tr.objectStore(it))
    const ret = await fn.apply(null, objects.map((it, i) => new (stores[i])(this, it)))
    await Promise.all(objects.map(it => promisify(it.transaction)))
    return ret
  }
}

export default (name: string, stores: Array<typeof Store>, options: {
  version?: number,
  onUpgrade?: (db: Database) => void,
  indexedDB?: IDBFactory
} = { }) => new Promise<Database>((resolve, reject) => {
  const names = new Set<string>()
  stores.forEach(it => {
    const name = getStoreName(it)
    if (names.has(name)) reject(new Error('This store name is exists: ' + name))
    names.add(name)
  })
  let dbInstance: Database
  const db = (options?.indexedDB || indexedDB).open(name, options?.version)
  /* istanbul ignore next */ db.onsuccess = () => resolve(dbInstance || (dbInstance = new Database(db.result, new Set(stores))))
  /* istanbul ignore next */ db.onerror = () => reject(db.error)
  db.onupgradeneeded = () => {
    /* istanbul ignore next */ if (!dbInstance) dbInstance = new Database(db.result, new Set(stores))
    dbInstance.upgradeDatabase()
    // eslint-disable-next-line no-unused-expressions
    options?.onUpgrade?.(dbInstance)
  }
}).then(it => it.ensureStores())
