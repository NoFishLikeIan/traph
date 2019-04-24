const DATA_ATTRIBUTE = Symbol('TRAPH_DATA_ATTRIBUTE')
let didWarn: string[] = []

// TODO: multiple generic arity
type Object<V extends unknown> = {
  [key: string]: V
}

function mapValues<I, O> (
  obj: Object<I>,
  fn: (key: string, v: I) => O
): Object<O> {
    return Object.entries(obj).reduce<Object<O>>(
      (acc, [key, value]) => ({...acc, [key]: fn(key, value)}),
      {})
  }

function warnOnce (message: string, ...args: unknown[]) {
  if (didWarn.includes(message)) return
  console.warn(message, ...args)
  didWarn.push(message)
}

/**
 * A proxy for an Object that checks for existence of the keys,
 * and throws an error in case.
 */
function checkerProxy <V>(data: Object<V>): Object<V> {
  if (typeof Proxy === 'undefined') {
    warnOnce("traph: can't validate input data Object, because Proxy global is not defined.")
    return data
  }

  return new Proxy(data, {
    get (target, key) {
      const keyString = key.toString()
      if (key in target) {
        return target[keyString]
      } else {
        throw new Error(`Data object is missing key '${keyString}':`)
      }
    },
  })
}

type ParseInputOutput = <I, O>(input: Object<I>, output: Object<O>) => unknown

type Proto = Object<{
  enumerable: boolean
  get(): unknown[]
}>

function buildGettifizeProto <V extends ParseInputOutput>(outputTemplate: Object<V>) {
  const protoDefinitions = mapValues(outputTemplate, (k, fn) => ({
    enumerable: true,
    get () {
      const input = this[DATA_ATTRIBUTE]
      const output = this
      const value = fn(input, output)
      Object.defineProperty(this, k, { value, enumerable: true })
      return value
    },
  }))
  const proto = Object.defineProperties({}, protoDefinitions)
  return proto
}

function buildGettifizeDataBinder (proto: Proto) {
  return function bindData (input: Object<unknown>) {
    // Use a Proxy to check for unexistant keys, only in development
    const inputProxy = process.env.NODE_ENV === 'development' ? checkerProxy(input) : input
    const output = Object.create(proto)
    Object.defineProperty(output, DATA_ATTRIBUTE, { value: inputProxy })
    return output
  }
}

/**
 * Gettifize: getter + memoize
 * Transforms an Object of functions of the form (input,output) => outputValue
 * in an Object of auto-memoizing getters deriving from input && output.
 */
function gettifize <V extends ParseInputOutput>(outputTemplate: Object<V>) {
  const proto = buildGettifizeProto(outputTemplate)
  const binder = buildGettifizeDataBinder(proto)
  return binder
}

function materialize <V extends ParseInputOutput>(t: Object<V>) {
  for (let k in t) {
    void t[k]
  }
  return t
}

export default function traph <V extends ParseInputOutput>(o: Object<V>) {
  const gettifizeDataBinder = gettifize(o)
  const transform = (i: Object<unknown>) => materialize(gettifizeDataBinder(i))
  transform.lazy = (i: Object<unknown>) => gettifizeDataBinder(i)
  return transform
}
