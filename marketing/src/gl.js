// Real-time 3D Sahel night for sahelflow.com — one fragment shader, no
// libraries. A raymarched dune field under a starry sky, with a glowing route
// on the sand that carries pulses of light (orders) toward the horizon.
//
// Loaded on demand by site.js for every <canvas data-gl>. It renders at a
// reduced internal resolution, pauses when the canvas is off screen or the tab
// is hidden, draws a single still frame under reduced motion, and leaves the
// CSS night sky in place whenever WebGL is unavailable.

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPointer;
uniform float uSeed;
uniform float uHorizon;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

// Barchan-like dunes: a warped ridge profile with a soft windward slope and a
// steeper slip face, plus fine wind ripples.
float dune(vec2 p) {
  float w = p.x * 0.23 + 1.1 * sin(p.y * 0.13 + uSeed) + 0.55 * sin(p.y * 0.31 + p.x * 0.07);
  float f = fract(w);
  float profile = f < 0.72 ? smoothstep(0.0, 0.72, f) : 1.0 - smoothstep(0.72, 1.0, f);
  float big = 0.5 + 0.5 * sin(p.y * 0.045 + p.x * 0.03 + uSeed * 2.0);
  return profile * (0.9 + 0.9 * big) + noise(p * 0.35) * 0.35;
}
float ripples(vec2 p) { return sin(p.x * 6.0 + sin(p.y * 1.7) * 2.0) * 0.012; }
// The route the orders travel along, in the ground plane.
float routeX(float z) { return 1.6 * sin(z * 0.11 + uSeed) + 0.8 * sin(z * 0.043); }
// The route runs through a shallow valley so the camera can follow it.
float height(vec2 p) {
  float valley = mix(0.25, 1.0, smoothstep(0.6, 4.5, abs(p.x - routeX(p.y))));
  return dune(p) * valley + ripples(p);
}

vec3 sky(vec3 rd) {
  float y = max(rd.y, 0.0);
  vec3 top = vec3(0.012, 0.02, 0.045);
  vec3 mid = vec3(0.02, 0.055, 0.11);
  vec3 glow = vec3(0.55, 0.32, 0.12);
  vec3 col = mix(mid, top, pow(y, 0.45));
  col += glow * pow(1.0 - y, 14.0) * 0.55;
  col += vec3(0.05, 0.25, 0.45) * pow(1.0 - y, 5.0) * 0.25;
  // stars
  vec2 sp = rd.xy / max(rd.z, 0.2) * 220.0;
  vec2 cell = floor(sp);
  float h = hash(cell + uSeed);
  if (h > 0.985) {
    vec2 c = fract(sp) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6;
    float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
    col += vec3(0.85, 0.92, 1.0) * smoothstep(0.08, 0.0, length(c)) * tw * smoothstep(0.02, 0.25, y);
  }
  // moon with halo
  vec3 md = normalize(vec3(-0.42, 0.32, 1.0));
  float m = max(dot(rd, md), 0.0);
  col += vec3(0.9, 0.95, 1.0) * smoothstep(0.9993, 0.99965, m);
  col += vec3(0.25, 0.45, 0.7) * pow(m, 180.0) * 0.6;
  col += vec3(0.1, 0.2, 0.35) * pow(m, 18.0) * 0.25;
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float travel = uTime * 0.9;
  vec3 ro = vec3(routeX(travel) + uPointer.x * 0.5, 1.75 + uPointer.y * 0.18, travel);
  vec3 target = vec3(routeX(travel + 14.0), 1.35 + uHorizon, travel + 14.0);
  vec3 fw = normalize(target - ro);
  vec3 rt = normalize(cross(vec3(0, 1, 0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw * 1.55 + rt * uv.x + up * uv.y);

  vec3 col = sky(rd);
  float t = 0.0;
  bool hit = false;
  if (rd.y < 0.08) {
    t = 0.1;
    float lo = t;
    for (int i = 0; i < 150; i++) {
      vec3 pos = ro + rd * t;
      float d = pos.y - height(pos.xz);
      if (d < 0.002 * t) { hit = true; break; }
      lo = t;
      t += max(0.015, d * 0.38);
      if (t > 70.0) break;
    }
    // Bisect the last step so steep slip faces have clean silhouettes.
    if (hit) {
      float hi = t;
      for (int j = 0; j < 6; j++) {
        float mid = 0.5 * (lo + hi);
        vec3 p = ro + rd * mid;
        if (p.y - height(p.xz) < 0.0) hi = mid; else lo = mid;
      }
      t = hi;
    }
  }
  if (hit) {
    vec3 pos = ro + rd * t;
    vec2 e = vec2(0.03, 0.0);
    vec3 n = normalize(vec3(height(pos.xz - e.xy) - height(pos.xz + e.xy), 2.0 * e.x, height(pos.xz - e.yx) - height(pos.xz + e.yx)));
    vec3 moon = normalize(vec3(-0.42, 0.32, 1.0));
    float dif = clamp(dot(n, moon), 0.0, 1.0);
    float rim = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
    vec3 sand = mix(vec3(0.018, 0.022, 0.04), vec3(0.1, 0.095, 0.12), dif);
    sand += vec3(0.42, 0.28, 0.12) * pow(dif, 9.0) * 0.45;
    sand += vec3(0.08, 0.26, 0.5) * rim * 0.3;
    // the route: a soft glowing band with pulses of light moving away
    float dx = abs(pos.x - routeX(pos.z));
    float core = exp(-dx * 14.0);
    float halo = exp(-dx * 2.2) * 0.18;
    float pulse = pow(0.5 + 0.5 * sin(pos.z * 0.75 - uTime * 3.2), 18.0);
    vec3 routeCol = mix(vec3(0.22, 0.74, 0.97), vec3(0.98, 0.74, 0.38), pulse);
    sand += routeCol * (core * (0.55 + 2.4 * pulse) + halo) * exp(-t * 0.03);
    // distant haze toward the horizon
    float fog = 1.0 - exp(-t * 0.05);
    vec3 haze = vec3(0.03, 0.05, 0.09) + vec3(0.35, 0.2, 0.08) * 0.12;
    col = mix(sand, haze, fog);
  }
  // vignette + gentle film grain
  col *= 1.0 - 0.35 * dot(uv * 0.8, uv * 0.8);
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.012;
  col = pow(col, vec3(0.92));
  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || "shader compile failed");
  }
  return shader;
}

export function mount(canvas, { reduced = false } = {}) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, depth: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
  if (!gl) return false;
  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "link failed");
  } catch {
    return false;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (name) => gl.getUniformLocation(program, name);
  const uRes = u("uRes"), uTime = u("uTime"), uPointer = u("uPointer"), uSeed = u("uSeed"), uHorizon = u("uHorizon");
  gl.uniform1f(uSeed, Number(canvas.dataset.glSeed || 0));
  gl.uniform1f(uHorizon, Number(canvas.dataset.glHorizon || 0));

  // Adaptive internal resolution: start modest, drop further if frames are slow.
  let scale = Math.min(window.devicePixelRatio || 1, 1.5) * 0.75;
  const resize = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth * scale));
    const h = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    }
  };
  resize();
  new ResizeObserver(resize).observe(canvas);

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener("pointermove", (e) => {
    pointer.tx = (e.clientX / innerWidth - 0.5) * 2;
    pointer.ty = (e.clientY / innerHeight - 0.5) * -2;
  }, { passive: true });

  const start = performance.now() - Number(canvas.dataset.glOffset || 0) * 1000;
  let visible = true;
  let raf = 0;
  let slow = 0;
  let last = performance.now();
  const draw = (now) => {
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    gl.uniform1f(uTime, (now - start) / 1000);
    gl.uniform2f(uPointer, pointer.x, pointer.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const frame = (now) => {
    raf = 0;
    if (!visible || document.hidden) return;
    const dt = now - last;
    last = now;
    if (dt > 34) slow += 1; else slow = Math.max(0, slow - 1);
    if (slow > 40 && scale > 0.35) { scale *= 0.8; slow = 0; resize(); }
    draw(now);
    raf = requestAnimationFrame(frame);
  };
  const play = () => { if (!raf && !reduced) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) play();
  }).observe(canvas);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) play(); });
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); cancelAnimationFrame(raf); canvas.closest("[data-gl-host]")?.classList.remove("has-gl"); });

  draw(performance.now());
  canvas.closest("[data-gl-host]")?.classList.add("has-gl");
  play();
  return true;
}
