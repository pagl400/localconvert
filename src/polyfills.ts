/**
 * Minimal browser-ish globals that some pure-JS libs (pdfjs-dist, …) assume
 * exist. Hermes doesn't ship them by default, so we install thin stubs at the
 * app entry — early enough that any later dynamic `import('pdfjs-dist/…')` can
 * load cleanly. The stubs cover *referencing* the globals, not full behaviour:
 * we never render PDFs to a canvas, we only extract text, so no real geometry
 * or DOM is involved.
 */

type Mutable = Record<string, unknown>;
const g = globalThis as unknown as Mutable;

if (typeof g.DOMException === 'undefined') {
  class DOMExceptionPolyfill extends Error {
    code: number;
    constructor(message?: string, name?: string) {
      super(message ?? '');
      this.name = name ?? 'Error';
      this.code = 0;
    }
  }
  g.DOMException = DOMExceptionPolyfill;
}

if (typeof g.DOMMatrix === 'undefined') {
  class DOMMatrixPolyfill {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    constructor(init?: number[]) {
      if (Array.isArray(init) && init.length === 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      }
    }
    translateSelf(tx: number, ty = 0) {
      this.e = this.a * tx + this.c * ty + this.e;
      this.f = this.b * tx + this.d * ty + this.f;
      return this;
    }
    scaleSelf(sx: number, sy = sx) {
      this.a *= sx;
      this.b *= sx;
      this.c *= sy;
      this.d *= sy;
      return this;
    }
  }
  g.DOMMatrix = DOMMatrixPolyfill;
}

if (typeof g.Path2D === 'undefined') g.Path2D = class {};
if (typeof g.ImageData === 'undefined') g.ImageData = class {};

if (typeof g.FinalizationRegistry === 'undefined') {
  g.FinalizationRegistry = class {
    register(): void {}
    unregister(): void {}
  };
}

const P = Promise as unknown as Record<string, unknown>;
if (typeof P.withResolvers === 'undefined') {
  P.withResolvers = function () {
    let resolve: (v?: unknown) => void = () => {};
    let reject: (e?: unknown) => void = () => {};
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
if (typeof P.try === 'undefined') {
  P.try = function (fn: (...args: unknown[]) => unknown, ...args: unknown[]) {
    return new Promise((resolve) => resolve(fn(...args)));
  };
}

const MapProto = Map.prototype as unknown as Record<string, unknown>;
if (typeof MapProto.getOrInsertComputed === 'undefined') {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
    value(this: Map<unknown, unknown>, key: unknown, compute: (k: unknown) => unknown) {
      if (this.has(key)) return this.get(key);
      const value = compute(key);
      this.set(key, value);
      return value;
    },
    writable: true,
    configurable: true,
  });
}

const U8Proto = Uint8Array.prototype as unknown as Record<string, unknown>;
if (typeof U8Proto.toHex === 'undefined') {
  // eslint-disable-next-line no-extend-native
  Object.defineProperty(Uint8Array.prototype, 'toHex', {
    value(this: Uint8Array) {
      let s = '';
      for (let i = 0; i < this.length; i++) {
        s += this[i]!.toString(16).padStart(2, '0');
      }
      return s;
    },
    writable: true,
    configurable: true,
  });
}

g.navigator ??= {} as Mutable;
const nav = g.navigator as Mutable;
nav.platform ??= '';
nav.userAgent ??= '';

export {};
