// This function is serialized into a page by Playwright before any app modules run.
export function installLoadingShaderProgramTrace({ sourceHashes = true } = {}) {
  if (globalThis.__loadingShaderTrace) return;

  const now = performance.now.bind(performance);
  const contexts = new WeakMap();
  const shaders = new WeakMap();
  const programs = new WeakMap();
  const framebuffers = new WeakMap();
  const contextRows = [];
  const programRows = [];
  const sourceRows = new Map();
  const methods = new Map();
  const marks = [];
  const wrapped = [];
  const installErrors = [];
  let observationErrors = 0;
  let nextShader = 0;
  let nextFramebuffer = 0;

  const programParameters = new Map([
    [0x91b1, 'COMPLETION_STATUS_KHR'],
    [0x8b82, 'LINK_STATUS'],
    [0x8b83, 'VALIDATE_STATUS'],
    [0x8b86, 'ACTIVE_UNIFORMS'],
    [0x8b89, 'ACTIVE_ATTRIBUTES'],
  ]);
  const programQueries = new Set([
    'getProgramParameter', 'getProgramInfoLog', 'getActiveUniform', 'getUniformLocation',
    'getActiveAttrib', 'getAttribLocation', 'useProgram',
  ]);
  const shaderMethods = new Set(['shaderSource', 'compileShader', 'getShaderInfoLog', 'deleteShader']);
  const programMethods = new Set(['attachShader', 'detachShader', 'linkProgram', 'deleteProgram', ...programQueries]);

  function contextOf(gl) {
    if (!contexts.has(gl)) {
      const context = {
        id: contextRows.length + 1,
        api: typeof WebGL2RenderingContext === 'function' && gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl',
        canvas: gl.canvas,
        viewport: null,
        drawFramebuffer: null,
        parallelShaderCompile: null,
      };
      contexts.set(gl, context);
      contextRows.push(context);
    }
    return contexts.get(gl);
  }

  function shaderOf(shader, type) {
    if (!shaders.has(shader)) shaders.set(shader, { id: ++nextShader, type, source: null, programs: new Set() });
    return shaders.get(shader);
  }

  function programOf(program, context) {
    if (!programs.has(program)) {
      const row = {
        id: programRows.length + 1,
        context: context.id,
        attached: new Set(),
        links: [],
        queries: new Map(),
        firstCompletionAt: null,
        deletedAt: null,
      };
      programs.set(program, row);
      programRows.push(row);
    }
    return programs.get(program);
  }

  function currentDimensions(context) {
    return {
      canvas: context.canvas ? [context.canvas.width, context.canvas.height] : null,
      viewport: context.viewport,
      framebuffer: context.drawFramebuffer,
    };
  }

  function stat(map, key) {
    if (!map.has(key)) map.set(key, { calls: 0, nativeMs: 0, maxNativeMs: 0 });
    return map.get(key);
  }

  function addTiming(row, elapsed) {
    row.calls++;
    row.nativeMs += elapsed;
    row.maxNativeMs = Math.max(row.maxNativeMs, elapsed);
  }

  function recordQuery(program, key, start, elapsed, result) {
    const row = stat(program.queries, key);
    if (row.calls === 0) {
      row.first = { at: start, nativeMs: elapsed, link: program.links.length };
      if (typeof result === 'boolean' || typeof result === 'number') row.first.result = result;
      if (typeof result === 'string') row.first.logLength = result.length;
    }
    addTiming(row, elapsed);
    if (key === 'getProgramParameter.COMPLETION_STATUS_KHR' && result === true) {
      program.firstCompletionAt ??= start + elapsed;
      const link = program.links.at(-1);
      if (link) link.completionAt ??= start + elapsed;
    }
  }

  function record(method, gl, args, result, start, elapsed, succeeded) {
    const context = contextOf(gl);
    const key = method === 'getProgramParameter'
      ? `${method}.${programParameters.get(args[1]) ?? args[1]}`
      : method;
    const row = stat(methods, key);
    row.programs ??= new Set();
    row.shaders ??= new Set();
    addTiming(row, elapsed);
    if (!succeeded) {
      row.thrown = (row.thrown ?? 0) + 1;
      return;
    }

    const [first, second] = args;
    if (method === 'viewport') context.viewport = [...args];
    if (method === 'bindFramebuffer' && (first === 0x8d40 || first === 0x8ca9)) {
      if (second && !framebuffers.has(second)) framebuffers.set(second, ++nextFramebuffer);
      context.drawFramebuffer = second ? framebuffers.get(second) : null;
    }
    if (method === 'getExtension' && typeof first === 'string' && first.toLowerCase() === 'khr_parallel_shader_compile') {
      context.parallelShaderCompile = Boolean(result);
    }

    if (method === 'createShader' && result) row.shaders.add(shaderOf(result, first).id);
    if (first && shaderMethods.has(method)) {
      const shader = shaderOf(first);
      row.shaders.add(shader.id);
      if (method === 'shaderSource' && sourceHashes && typeof second === 'string') {
        if (!sourceRows.has(second)) sourceRows.set(second, { id: sourceRows.size + 1, text: second });
        shader.source = sourceRows.get(second).id;
      }
      if (method === 'getShaderInfoLog') {
        for (const program of shader.programs) {
          row.programs.add(program.id);
          recordQuery(program, key, start, elapsed, result);
        }
      }
    }

    if (!first || !programMethods.has(method)) return;
    const program = programOf(first, context);
    row.programs.add(program.id);
    if (second && (method === 'attachShader' || method === 'detachShader')) {
      const shader = shaderOf(second);
      row.shaders.add(shader.id);
      if (method === 'attachShader') {
        program.attached.add(shader);
        shader.programs.add(program);
      } else {
        program.attached.delete(shader);
        shader.programs.delete(program);
      }
    }
    if (method === 'linkProgram') {
      program.links.push({ at: start, nativeMs: elapsed, afterMark: marks.at(-1)?.name ?? null,
        ...currentDimensions(context),
        shaders: [...program.attached].map(({ id, type, source }) => ({ id, type, source })),
        completionAt: null });
    }
    if (method === 'deleteProgram') {
      program.deletedAt = start;
      for (const shader of program.attached) shader.programs.delete(program);
      program.attached.clear();
    }
    if (programQueries.has(method)) recordQuery(program, key, start, elapsed, result);
  }

  const observed = [
    'viewport', 'bindFramebuffer', 'getExtension', 'createShader', ...shaderMethods, ...programMethods,
  ];
  for (const api of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
    const prototype = globalThis[api]?.prototype;
    if (!prototype) continue;
    for (const method of observed) {
      // The same method can be inherited by both prototypes. Wrap the native
      // owner once and let inherited calls take that route.
      const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
      if (typeof descriptor?.value !== 'function') continue;
      const original = descriptor.value;
      try {
        Object.defineProperty(prototype, method, { ...descriptor, value: function (...args) {
          const start = now();
          let result;
          let succeeded = false;
          try {
            result = Reflect.apply(original, this, args);
            succeeded = true;
            return result;
          } finally {
            const elapsed = now() - start;
            try { record(method, this, args, result, start, elapsed, succeeded); }
            catch { observationErrors++; }
          }
        } });
        wrapped.push(`${api}.${method}`);
      } catch (error) {
        installErrors.push({ api, method, error: String(error) });
      }
    }
  }

  function methodSummary() {
    return Object.fromEntries([...methods].map(([key, row]) => [key, {
      calls: row.calls, nativeMs: row.nativeMs, maxNativeMs: row.maxNativeMs,
      uniquePrograms: row.programs.size, uniqueShaders: row.shaders.size, thrown: row.thrown ?? 0,
    }]));
  }

  function mark(name, detail = null) {
    const at = now();
    const event = { name, at, detail, linkedPrograms: methods.get('linkProgram')?.programs.size ?? 0, methods: methodSummary() };
    marks.push(event);
    return event;
  }

  function summarizeSource(row) {
    if (row.summary) return row.summary;
    // Two independent 32-bit fingerprints, computed on demand outside the
    // wrapped native calls. Store sizes alongside hashes to aid key comparisons.
    let fnv = 0x811c9dc5;
    let djb = 5381;
    let lines = 1;
    for (let i = 0; i < row.text.length; i++) {
      const code = row.text.charCodeAt(i);
      fnv = Math.imul(fnv ^ code, 0x01000193);
      djb = Math.imul(djb, 33) ^ code;
      if (code === 10) lines++;
    }
    const hex = value => (value >>> 0).toString(16).padStart(8, '0');
    return row.summary = { id: row.id, hash: hex(fnv) + hex(djb), codeUnits: row.text.length, lines };
  }

  globalThis.__loadingShaderTrace = {
    mark,
    programId: program => programs.get(program)?.id ?? null,
    snapshot() {
      return {
        schema: 1,
        timeOrigin: performance.timeOrigin,
        at: now(),
        sourceHashes,
        wrapped: [...wrapped], installErrors: [...installErrors], observationErrors,
        marks: [...marks],
        performanceMarks: performance.getEntriesByType('mark').map(({ name, startTime }) => ({ name, at: startTime })),
        methods: methodSummary(),
        contexts: contextRows.map(context => ({ id: context.id, api: context.api,
          parallelShaderCompile: context.parallelShaderCompile, ...currentDimensions(context) })),
        programs: programRows.map(({ id, context, links, queries, firstCompletionAt, deletedAt }) => ({
          id, context, links, queries: Object.fromEntries(queries), firstCompletionAt, deletedAt,
        })),
        sources: [...sourceRows.values()].map(summarizeSource),
      };
    },
  };
}
