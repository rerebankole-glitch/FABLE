// esbuild stub for `?worker&inline` imports in the headless playtest bundle (no real workers in node).
// Must satisfy `new GenWorker()` — playtest.mts drives world generation synchronously instead.
export default class WorkerStub {
  postMessage() {}
  terminate() {}
  addEventListener(_t, _cb) {}
  removeEventListener(_t, _cb) {}
  set onmessage(_cb) {}
  set onerror(_cb) {}
}
