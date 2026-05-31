import { useState, useRef, useEffect, useCallback } from "react";

/* ════════════════════════════════════════════════════════════════════
   PERCEPTION ENGINE — Real-time GPU psychedelic simulator
   A WebGL2 reimagining of QRI's Oscilleditor:
   • Kuramoto coupled-oscillator field runs live on the GPU (ping-pong
     float textures), generating emergent geometry from the image's edges
   • Log-polar form constants (tunnels / spirals / webs / honeycombs)
   • Drifting, color enhancement, full-resolution real-time animation
   • Drug + dose presets grounded in r/replications phenomenology
   ════════════════════════════════════════════════════════════════════ */

// ─── SUBSTANCE PRESETS ────────────────────────────────────────────────
const SUBSTANCES = {
  lsd: {
    label: "LSD", sublabel: "Lysergic Acid", unit: "µg", emoji: "✦", color: "#46d6ff",
    doses: [
      { label: "Threshold", amount: "25µg", i: 0.12 },
      { label: "Low", amount: "75µg", i: 0.30 },
      { label: "Moderate", amount: "150µg", i: 0.55 },
      { label: "Strong", amount: "250µg", i: 0.78 },
      { label: "Extreme", amount: "400µg+", i: 1.0 },
    ],
  },
  psilocybin: {
    label: "Psilocybin", sublabel: "Magic Mushrooms", unit: "g", emoji: "🍄", color: "#b98aff",
    doses: [
      { label: "Threshold", amount: "0.5g", i: 0.10 },
      { label: "Low", amount: "1g", i: 0.22 },
      { label: "Moderate", amount: "2g", i: 0.45 },
      { label: "Strong", amount: "3.5g", i: 0.72 },
      { label: "Heroic", amount: "5g+", i: 1.0 },
    ],
  },
  dmt: {
    label: "DMT", sublabel: "Dimethyltryptamine", unit: "mg", emoji: "◈", color: "#ff8a3d",
    doses: [
      { label: "Threshold", amount: "5mg", i: 0.10 },
      { label: "Low", amount: "15mg", i: 0.25 },
      { label: "Moderate", amount: "25mg", i: 0.42 },
      { label: "Breakthrough", amount: "50mg", i: 0.78 },
      { label: "Extreme", amount: "75mg+", i: 1.0 },
    ],
  },
  mescaline: {
    label: "Mescaline", sublabel: "Peyote / San Pedro", unit: "mg", emoji: "🌵", color: "#5fd38a",
    doses: [
      { label: "Threshold", amount: "100mg", i: 0.12 },
      { label: "Low", amount: "200mg", i: 0.28 },
      { label: "Common", amount: "350mg", i: 0.5 },
      { label: "Strong", amount: "500mg", i: 0.76 },
      { label: "Heavy", amount: "700mg+", i: 1.0 },
    ],
  },
  mdma: {
    label: "MDMA", sublabel: "Ecstasy / Molly", unit: "mg", emoji: "♡", color: "#ff6fae",
    doses: [
      { label: "Threshold", amount: "40mg", i: 0.16 },
      { label: "Low", amount: "75mg", i: 0.32 },
      { label: "Common", amount: "120mg", i: 0.5 },
      { label: "Strong", amount: "180mg", i: 0.74 },
      { label: "Heavy", amount: "250mg+", i: 1.0 },
    ],
  },
};

// Map substance + intensity → full parameter set (the heart of the "accuracy")
function makeParams(substance, t) {
  // shared smoothing
  const e = (a, b) => a + (b - a) * t; // lerp threshold→max by intensity
  const base = {
    oscStrength: 0, coupling: 2.2, kCenter: 2.0, kSurround: 5.0,
    freqMin: 0.15, freqMax: 1.2, varyBy: 0 /*edges*/, colorMode: 0 /*rainbow*/, windings: 1,
    driftAmp: 0, driftScale: 3.0, driftSpeed: 0.5, logPolar: 0,
    formType: 0, formStrength: 0, formWindings: 6, formFreq: 2.0, formHue: 200,
    saturation: e(1.0, 1.3), contrast: e(1.0, 1.1), brightness: e(1.0, 1.05), hueRotate: 0,
    speed: 1.0, simRes: 360,
  };

  switch (substance) {
    case "lsd": return { ...base,
      oscStrength: e(0.05, 0.5), coupling: 2.6, kCenter: 2.0, kSurround: e(4.5, 7.0),
      freqMin: 0.2, freqMax: e(0.9, 1.8), varyBy: 0, colorMode: 0, windings: 2,
      driftAmp: e(0.001, 0.006), driftScale: 4.0, driftSpeed: 0.6, logPolar: t > 0.55 ? 1 : 0,
      formType: t > 0.55 ? 2 /*spiral*/ : 3 /*web*/, formStrength: e(0.0, 0.45), formWindings: 8, formFreq: 2.6, formHue: 180,
      saturation: e(1.1, 2.4), contrast: e(1.05, 1.6), brightness: e(1.0, 1.06), hueRotate: 0,
      speed: 1.0,
    };
    case "psilocybin": return { ...base,
      oscStrength: e(0.04, 0.46), coupling: 2.0, kCenter: 2.4, kSurround: e(5.0, 8.0),
      freqMin: 0.12, freqMax: e(0.8, 1.5), varyBy: 0, colorMode: 0, windings: 1,
      driftAmp: e(0.002, 0.012), driftScale: 2.4, driftSpeed: 0.4, logPolar: 0,
      formType: t > 0.6 ? 1 /*tunnel*/ : 0, formStrength: e(0.0, 0.3), formWindings: 6, formFreq: 2.0, formHue: 30,
      saturation: e(1.1, 2.2), contrast: e(1.0, 1.35), brightness: e(1.0, 1.08), hueRotate: 0,
      speed: 0.85,
    };
    case "dmt": return { ...base,
      oscStrength: e(0.08, 0.7), coupling: 3.0, kCenter: 2.0, kSurround: e(4.0, 6.0),
      freqMin: 0.3, freqMax: e(1.2, 2.6), varyBy: 0, colorMode: 0, windings: 3,
      driftAmp: e(0.003, 0.014), driftScale: 3.5, driftSpeed: 0.9, logPolar: 1,
      formType: t > 0.5 ? 4 /*honeycomb*/ : 2 /*spiral*/, formStrength: e(0.1, 0.7), formWindings: 8, formFreq: 3.0, formHue: 300,
      saturation: e(1.3, 3.0), contrast: e(1.1, 1.7), brightness: e(1.05, 1.2), hueRotate: e(20, 140),
      speed: 1.4,
    };
    case "mescaline": return { ...base,
      oscStrength: e(0.05, 0.44), coupling: 2.2, kCenter: 2.6, kSurround: e(5.5, 8.5),
      freqMin: 0.12, freqMax: e(0.7, 1.3), varyBy: 1 /*brightness*/, colorMode: 0, windings: 1,
      driftAmp: e(0.002, 0.009), driftScale: 2.0, driftSpeed: 0.35, logPolar: 0,
      formType: t > 0.55 ? 4 /*honeycomb*/ : 0, formStrength: e(0.0, 0.35), formWindings: 6, formFreq: 2.4, formHue: 110,
      saturation: e(1.2, 2.6), contrast: e(1.0, 1.3), brightness: e(1.0, 1.1), hueRotate: 0,
      speed: 0.8,
    };
    case "mdma": return { ...base,
      oscStrength: e(0.0, 0.12), coupling: 1.6, kCenter: 3.0, kSurround: 7.0,
      freqMin: 0.1, freqMax: 0.6, varyBy: 1, colorMode: 0, windings: 1,
      driftAmp: e(0.001, 0.005), driftScale: 1.8, driftSpeed: 0.3, logPolar: 0,
      formType: 0, formStrength: 0, formWindings: 6, formFreq: 2.0, formHue: 40,
      saturation: e(1.05, 1.7), contrast: e(1.0, 1.12), brightness: e(1.02, 1.18), hueRotate: e(0, 12),
      speed: 0.7,
    };
    default: return base;
  }
}

// ─── GLSL SHADERS ─────────────────────────────────────────────────────
const VERT = `#version 300 es
out vec2 v_uv;
void main(){
  // Fullscreen triangle from gl_VertexID (no buffers needed)
  float x = (gl_VertexID==1) ? 3.0 : -1.0;
  float y = (gl_VertexID==2) ? 3.0 : -1.0;
  v_uv = vec2((x+1.0)*0.5, (y+1.0)*0.5);
  gl_Position = vec4(x, y, 0.0, 1.0);
}`;

// Initialize phase field (plane waves → cleanest emergent geometry)
const INIT_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform vec2 u_res;
void main(){
  vec2 g = v_uv * u_res;
  float ph = mod((g.x + g.y) * 0.5, 6.2831853);
  o = vec4(ph, 0.0, 0.0, 1.0);
}`;

// Kuramoto update pass — center/surround ring coupling (Difference-of-Gaussians)
const SIM_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_phase;   // R = phase
uniform sampler2D u_params;  // R=brightness, G=edge
uniform vec2 u_texel;
uniform float u_dt, u_coupling, u_kCenter, u_kSurround, u_freqMin, u_freqMax;
uniform int u_varyBy;
const float TAU = 6.2831853;
void main(){
  float ph = texture(u_phase, v_uv).r;
  vec2 pm = texture(u_params, v_uv).rg;
  float t = (u_varyBy==0) ? pm.g : (u_varyBy==1) ? pm.r
          : (sin(v_uv.x/u_texel.x*0.4)*sin(v_uv.y/u_texel.y*0.4)*0.5+0.5);
  float freq = mix(u_freqMin, u_freqMax, t);

  float c = 0.0;
  const int TAPS = 10;
  for(int k=0;k<TAPS;k++){
    float a = float(k)/float(TAPS)*TAU;
    vec2 dir = vec2(cos(a), sin(a));
    float near = texture(u_phase, v_uv + dir*u_kCenter*u_texel).r;
    float far  = texture(u_phase, v_uv + dir*u_kSurround*u_texel).r;
    c += sin(near - ph);          // synchronize with near neighbors (+)
    c -= 0.7 * sin(far - ph);     // anti-synchronize with far (−) → Turing patterns
  }
  c /= float(TAPS);
  float np = ph + u_dt*(freq + u_coupling*c);
  o = vec4(np, 0.0, 0.0, 1.0);
}`;

// Display pass — drift warp, color map, form constants, photo blend, enhancement
const DISP_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_phase;
uniform sampler2D u_image;
uniform float u_time, u_aspect;
uniform float u_oscStrength, u_windings;
uniform int u_colorMode, u_logPolar;
uniform float u_driftAmp, u_driftScale, u_driftSpeed;
uniform int u_formType;
uniform float u_formStrength, u_formWindings, u_formFreq, u_formHue;
uniform float u_saturation, u_contrast, u_brightness, u_hueRotate;
const float TAU = 6.2831853;
const float PI = 3.14159265;

vec3 hsl2rgb(float h, float s, float l){
  vec3 rgb = clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
  return l + s*(rgb-0.5)*(1.0-abs(2.0*l-1.0));
}
vec3 applyHue(vec3 c, float deg){
  float a = radians(deg);
  float co=cos(a), si=sin(a);
  mat3 m = mat3(
    0.299+0.701*co+0.168*si, 0.587-0.587*co+0.330*si, 0.114-0.114*co-0.497*si,
    0.299-0.299*co-0.328*si, 0.587+0.413*co+0.035*si, 0.114-0.114*co+0.292*si,
    0.299-0.300*co+1.250*si, 0.587-0.588*co-1.050*si, 0.114+0.886*co-0.203*si);
  return clamp(m*c, 0.0, 1.0);
}
vec3 colorFromPhase(float ph){
  if(u_colorMode==1){ float v=0.5+0.5*sin(ph*u_windings); return vec3(v); }
  if(u_colorMode==2){ float v=0.5+0.5*sin(ph*u_windings); return mix(vec3(0.1,0.2,1.0),vec3(1.0,0.9,0.1),v); }
  float hue = fract(ph*u_windings/TAU);
  return hsl2rgb(hue, 1.0, 0.55);
}
float formWave(vec2 uv){
  vec2 d = uv-0.5; d.x*=u_aspect;
  float ang = atan(d.y,d.x);
  float rad = length(d);
  float lr = log(0.2 + rad*23.0)/PI;
  float w;
  if(u_formType==1) w = sin(lr*u_formFreq*6.0);                       // tunnel
  else if(u_formType==2) w = sin(lr*u_formFreq*6.0 + ang*u_formWindings); // spiral
  else if(u_formType==3) w = sin(ang*u_formWindings*2.0);             // web
  else if(u_formType==4) w = sin(lr*u_formFreq*6.0)*sin(ang*u_formWindings*2.0); // honeycomb
  else w = 0.0;
  return pow(abs(w), 8.0);
}

void main(){
  // Drift warp (the "underwater" wobble)
  vec2 drift = vec2(
    sin(v_uv.y*u_driftScale*6.0 + u_time*u_driftSpeed),
    cos(v_uv.x*u_driftScale*6.0 + u_time*u_driftSpeed*0.9)
  ) * u_driftAmp;
  vec2 uv = v_uv + drift;

  // Oscillator sample coordinate (optionally log-polar for radial form constants)
  vec2 uvOsc = uv;
  if(u_logPolar==1){
    vec2 d = uv-0.5; d.x*=u_aspect;
    float ang = atan(d.y,d.x);
    float rad = length(d);
    float lr = log(0.2 + rad*23.0)/PI;
    uvOsc = vec2(fract(ang/TAU+0.5), clamp(lr,0.0,1.0));
  }

  float ph = texture(u_phase, uvOsc).r;
  vec3 osc = colorFromPhase(ph);

  // Photo + color enhancement
  vec3 photo = texture(u_image, uv).rgb;
  photo = applyHue(photo, u_hueRotate);
  float lum = dot(photo, vec3(0.299,0.587,0.114));
  photo = mix(vec3(lum), photo, u_saturation);          // saturation
  photo = (photo-0.5)*u_contrast + 0.5;                 // contrast
  photo *= u_brightness;                                 // brightness
  photo = clamp(photo, 0.0, 1.0);

  // Screen-blend oscillator geometry over the photo
  vec3 col = 1.0 - (1.0-photo)*(1.0-osc*u_oscStrength);

  // Form constants (Klüver geometry) screen-blended
  if(u_formType>0 && u_formStrength>0.001){
    float line = formWave(uv);
    vec3 fc = hsl2rgb(fract(u_formHue/360.0 + ph*0.1), 1.0, 0.6) * line * u_formStrength;
    col = 1.0 - (1.0-col)*(1.0-fc);
  }

  o = vec4(clamp(col,0.0,1.0), 1.0);
}`;

// ─── WEBGL ENGINE ─────────────────────────────────────────────────────
class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false });
    if (!this.gl) throw new Error("WebGL2 is not supported on this device/browser.");
    const gl = this.gl;
    this.floatExt = gl.getExtension("EXT_color_buffer_float");
    if (!this.floatExt) throw new Error("This device lacks float-texture rendering (EXT_color_buffer_float), required for the oscillator simulation.");

    this.progInit = this._program(VERT, INIT_FS);
    this.progSim  = this._program(VERT, SIM_FS);
    this.progDisp = this._program(VERT, DISP_FS);
    this.vao = gl.createVertexArray(); // empty VAO for attribute-less draw

    this.params = makeParams("psilocybin", 0.45);
    this.time = 0;
    this.simRes = { w: 2, h: 2 };
    this.ready = false;
  }

  _shader(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error("Shader compile error: " + gl.getShaderInfoLog(s));
    return s;
  }
  _program(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    gl.attachShader(p, this._shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, this._shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error("Program link error: " + gl.getProgramInfoLog(p));
    return p;
  }
  _floatTex(w, h, data = null) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return t;
  }
  _fbo(tex) {
    const gl = this.gl, f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return f;
  }

  // Build the brightness/edge param texture + the photo texture from an image
  setImage(img) {
    const gl = this.gl;
    const aspect = img.width / img.height;
    // sim resolution (cap long side)
    const cap = this.params.simRes;
    let sw, sh;
    if (aspect >= 1) { sw = cap; sh = Math.max(2, Math.round(cap / aspect)); }
    else { sh = cap; sw = Math.max(2, Math.round(cap * aspect)); }
    this.simRes = { w: sw, h: sh };
    this.aspect = aspect;

    // draw image to a 2D canvas at sim res for brightness/edge maps
    const c = document.createElement("canvas"); c.width = sw; c.height = sh;
    const cx = c.getContext("2d");
    cx.translate(0, sh); cx.scale(1, -1);           // flip Y so GL matches
    cx.drawImage(img, 0, 0, sw, sh);
    const px = cx.getImageData(0, 0, sw, sh).data;
    const bright = new Float32Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) bright[i] = (px[i*4]+px[i*4+1]+px[i*4+2]) / 765;
    // Sobel edges
    const param = new Float32Array(sw * sh * 4);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const i = y*sw+x;
      let edge = 0;
      if (x>0&&x<sw-1&&y>0&&y<sh-1) {
        const gx = -bright[i-sw-1]-2*bright[i-1]-bright[i+sw-1]+bright[i-sw+1]+2*bright[i+1]+bright[i+sw+1];
        const gy = -bright[i-sw-1]-2*bright[i-sw]-bright[i-sw+1]+bright[i+sw-1]+2*bright[i+sw]+bright[i+sw+1];
        edge = Math.min(1, Math.sqrt(gx*gx+gy*gy)/4);
      }
      param[i*4]=bright[i]; param[i*4+1]=edge; param[i*4+2]=0; param[i*4+3]=1;
    }
    if (this.paramTex) gl.deleteTexture(this.paramTex);
    this.paramTex = this._floatTex(sw, sh, param);

    // photo texture (full res, flipped)
    if (this.imageTex) gl.deleteTexture(this.imageTex);
    this.imageTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    // ping-pong phase textures
    [this.texA, this.texB].forEach(t => t && gl.deleteTexture(t));
    [this.fboA, this.fboB].forEach(f => f && gl.deleteFramebuffer(f));
    this.texA = this._floatTex(sw, sh); this.fboA = this._fbo(this.texA);
    this.texB = this._floatTex(sw, sh); this.fboB = this._fbo(this.texB);

    this._initPhase();
    this.ready = true;
  }

  _initPhase() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.progInit);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboA);
    gl.viewport(0, 0, this.simRes.w, this.simRes.h);
    gl.uniform2f(gl.getUniformLocation(this.progInit, "u_res"), this.simRes.w, this.simRes.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.cur = "A";
  }

  setParams(p) {
    const prevRes = this.params ? this.params.simRes : 360;
    this.params = p;
    // if sim resolution changed and we have an image, rebuild maps
    if (this._lastImg && p.simRes !== prevRes) this.setImage(this._lastImg);
  }

  step() {
    if (!this.ready) return;
    const gl = this.gl, P = this.params;
    const src = this.cur === "A" ? this.texA : this.texB;
    const dstF = this.cur === "A" ? this.fboB : this.fboA;
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.progSim);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dstF);
    gl.viewport(0, 0, this.simRes.w, this.simRes.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(gl.getUniformLocation(this.progSim, "u_phase"), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.paramTex);
    gl.uniform1i(gl.getUniformLocation(this.progSim, "u_params"), 1);
    const u = n => gl.getUniformLocation(this.progSim, n);
    gl.uniform2f(u("u_texel"), 1/this.simRes.w, 1/this.simRes.h);
    gl.uniform1f(u("u_dt"), 0.12 * P.speed);
    gl.uniform1f(u("u_coupling"), P.coupling);
    gl.uniform1f(u("u_kCenter"), P.kCenter);
    gl.uniform1f(u("u_kSurround"), P.kSurround);
    gl.uniform1f(u("u_freqMin"), P.freqMin);
    gl.uniform1f(u("u_freqMax"), P.freqMax);
    gl.uniform1i(u("u_varyBy"), P.varyBy);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.cur = this.cur === "A" ? "B" : "A";
  }

  render() {
    if (!this.ready) return;
    const gl = this.gl, P = this.params;
    const phase = this.cur === "A" ? this.texA : this.texB;
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.progDisp);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, phase);
    gl.uniform1i(gl.getUniformLocation(this.progDisp, "u_phase"), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
    gl.uniform1i(gl.getUniformLocation(this.progDisp, "u_image"), 1);
    const u = n => gl.getUniformLocation(this.progDisp, n);
    gl.uniform1f(u("u_time"), this.time);
    gl.uniform1f(u("u_aspect"), this.aspect || 1);
    gl.uniform1f(u("u_oscStrength"), P.oscStrength);
    gl.uniform1f(u("u_windings"), P.windings);
    gl.uniform1i(u("u_colorMode"), P.colorMode);
    gl.uniform1i(u("u_logPolar"), P.logPolar);
    gl.uniform1f(u("u_driftAmp"), P.driftAmp);
    gl.uniform1f(u("u_driftScale"), P.driftScale);
    gl.uniform1f(u("u_driftSpeed"), P.driftSpeed);
    gl.uniform1i(u("u_formType"), P.formType);
    gl.uniform1f(u("u_formStrength"), P.formStrength);
    gl.uniform1f(u("u_formWindings"), P.formWindings);
    gl.uniform1f(u("u_formFreq"), P.formFreq);
    gl.uniform1f(u("u_formHue"), P.formHue);
    gl.uniform1f(u("u_saturation"), P.saturation);
    gl.uniform1f(u("u_contrast"), P.contrast);
    gl.uniform1f(u("u_brightness"), P.brightness);
    gl.uniform1f(u("u_hueRotate"), P.hueRotate);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  frame(stepsPerFrame = 2) {
    for (let i = 0; i < stepsPerFrame; i++) this.step();
    this.time += 0.016 * this.params.speed;
    this.render();
  }

  resize(w, h) {
    this.canvas.width = w; this.canvas.height = h;
  }
  destroy() {
    const gl = this.gl;
    [this.texA,this.texB,this.paramTex,this.imageTex].forEach(t=>t&&gl.deleteTexture(t));
    [this.fboA,this.fboB].forEach(f=>f&&gl.deleteFramebuffer(f));
  }
}

// ─── UI ───────────────────────────────────────────────────────────────
const TABS = ["substance", "dose", "tune"];

function Slider({ label, value, min, max, step, onChange, color, fmt }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline",
        fontSize:11, letterSpacing:"0.12em", color:"#8b8ba7", marginBottom:8 }}>
        <span>{label}</span>
        <span style={{ color, fontWeight:700, fontSize:12 }}>
          {fmt ? fmt(value) : value.toFixed(2)}
        </span>
      </div>
      {/* Wrapper div carries the accent color so the CSS thumb rule picks it up */}
      <div style={{ color }}>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ width:"100%", accentColor: color }} />
      </div>
    </div>
  );
}

export default function App() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const rafRef = useRef(null);
  const imgRef = useRef(null);

  const [substance, setSubstance] = useState("psilocybin");
  const [doseIdx, setDoseIdx] = useState(2);
  const [playing, setPlaying] = useState(true);
  const [hasImage, setHasImage] = useState(false);
  const [tab, setTab] = useState("substance");
  const [sheetOpen, setSheetOpen] = useState(true);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [overrides, setOverrides] = useState({}); // manual slider tweaks
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState(null);

  const sub = SUBSTANCES[substance];
  const dose = sub.doses[doseIdx];

  // Compose params: preset + manual overrides
  const composed = useCallback(() => {
    const base = makeParams(substance, dose.i);
    return { ...base, ...overrides };
  }, [substance, dose.i, overrides]);

  // Init engine once
  useEffect(() => {
    try {
      const eng = new Engine(canvasRef.current);
      engineRef.current = eng;
      eng.setParams(composed());
    } catch (e) {
      setError(e.message);
    }
    return () => { engineRef.current?.destroy(); };
    // eslint-disable-next-line
  }, []);

  // Push params on change
  useEffect(() => {
    const eng = engineRef.current; if (!eng) return;
    eng._lastImg = imgRef.current;
    eng.setParams(composed());
  }, [composed]);

  // Animation loop
  useEffect(() => {
    const eng = engineRef.current; if (!eng || error) return;
    const loop = () => {
      if (playing) eng.frame(2);
      else eng.render();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, error, hasImage]);

  // Resize canvas to container
  useEffect(() => {
    const onResize = () => {
      const eng = engineRef.current; if (!eng) return;
      const el = canvasRef.current.parentElement;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      eng.resize(Math.round(el.clientWidth*dpr), Math.round(el.clientHeight*dpr));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [hasImage]);

  const loadImage = (file) => {
    if (!file) return;
    setFileName(file.name);
    setAiNote(null);
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        const eng = engineRef.current;
        if (eng) {
          eng._lastImg = img;
          eng.setImage(img);
          eng.setParams(composed());
          const el = canvasRef.current.parentElement;
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          eng.resize(Math.round(el.clientWidth*dpr), Math.round(el.clientHeight*dpr));
        }
        setHasImage(true);
        setSheetOpen(false);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const saveSnapshot = () => {
    const eng = engineRef.current; if (!eng) return;
    eng.render(); // ensure current frame is in buffer
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url; a.download = `perception-${substance}-${dose.amount}.png`; a.click();
  };

  const setOv = (k, v) => setOverrides(o => ({ ...o, [k]: v }));
  const resetOverrides = () => setOverrides({});

  // AI auto-tune: ask Claude to read the image and return parameter overrides
  const aiTune = async () => {
    if (!imgRef.current) return;
    setAiBusy(true); setAiNote(null);
    try {
      const img = imgRef.current;
      const cap = 768, aspect = img.width/img.height;
      const w = aspect>=1?cap:Math.round(cap*aspect);
      const h = aspect>=1?Math.round(cap/aspect):cap;
      const c = document.createElement("canvas"); c.width=w; c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      const b64 = c.toDataURL("image/jpeg",0.85).split(",")[1];

      const prompt = `You are tuning a real-time Kuramoto-oscillator psychedelic visual simulator to replicate ${dose.amount} of ${sub.label} on THIS specific image. Look at its colors, edges, lighting and composition. Return parameter overrides as JSON (no markdown). Ranges: oscStrength 0-0.8 (geometry intensity), coupling 1.5-3.2, kCenter 1.5-3, kSurround 4-9 (pattern scale), freqMax 0.6-2.6, colorMode 0=rainbow 1=bw 2=complementary, windings 1-4, driftAmp 0-0.015, driftSpeed 0.2-1.2, logPolar 0 or 1, formType 0=none 1=tunnel 2=spiral 3=web 4=honeycomb, formStrength 0-0.8, formWindings 2-12, formFreq 1-4, formHue 0-360, saturation 1-3, contrast 1-1.8, brightness 1-1.25, hueRotate -180..180, speed 0.6-1.6. Base it on documented ${sub.label} phenomenology. Respond ONLY: {"params":{...}, "note":"<one sentence>"}`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-6", max_tokens:600,
          messages:[{ role:"user", content:[
            { type:"image", source:{ type:"base64", media_type:"image/jpeg", data:b64 } },
            { type:"text", text: prompt },
          ]}],
        }),
      });
      if (!res.ok) throw new Error("API "+res.status);
      const data = await res.json();
      const txt = data.content.map(x=>x.text||"").join("").replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(txt);
      setOverrides(o => ({ ...o, ...parsed.params }));
      setAiNote(parsed.note || "Tuned to your image.");
    } catch(e) {
      setAiNote("Auto-tune failed: " + e.message);
    }
    setAiBusy(false);
  };

  const P = composed();
  // FAB bottom clears the iOS home indicator (34px) + breathing room
  const FAB_BOTTOM = "calc(env(safe-area-inset-bottom, 0px) + 20px)";

  return (
    <div style={{ height:"100dvh", background:"#060608", color:"#e8e8f0",
      fontFamily:"'DM Mono', ui-monospace, monospace", display:"flex", flexDirection:"column",
      overflow:"hidden", position:"relative", overscrollBehavior:"none",
      // Prevent accidental text-selection on long-press
      userSelect:"none", WebkitUserSelect:"none" }}>

      {/* ── TOP BAR — pushes down below notch ── */}
      <div style={{
        display:"flex", alignItems:"center", gap:12,
        // paddingTop absorbs the Dynamic Island / notch (47 px on iPhone 13 Pro)
        paddingTop:"env(safe-area-inset-top, 12px)",
        paddingBottom:10, paddingLeft:16, paddingRight:16,
        background:"rgba(8,8,12,0.94)", borderBottom:`1px solid ${sub.color}28`,
        flexShrink:0, zIndex:10, backdropFilter:"blur(16px)",
        WebkitBackdropFilter:"blur(16px)",
      }}>
        {/* Spinning orb */}
        <div style={{ width:30, height:30, borderRadius:"50%", flexShrink:0,
          background:`conic-gradient(from 0deg, ${sub.color}, #ff8a3d, #46d6ff, #b98aff, ${sub.color})`,
          animation: playing&&hasImage ? "spin 4s linear infinite" : "none",
          boxShadow: playing&&hasImage ? `0 0 14px ${sub.color}66` : "none",
          transition:"box-shadow .6s" }} />

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700, letterSpacing:"0.16em", color:"#f0f0fa" }}>
            PERCEPTION ENGINE
          </div>
          <div style={{ fontSize:11, color:"#6b6b85", letterSpacing:"0.06em",
            whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginTop:1 }}>
            {sub.emoji} {sub.label} · {dose.label} ({dose.amount})
            {fileName ? ` · ${fileName}` : " · GPU real-time"}
          </div>
        </div>

        {/* Dose pip indicator */}
        <div style={{ display:"flex", gap:4, alignItems:"center", flexShrink:0 }}>
          {sub.doses.map((_,i)=>(
            <div key={i} style={{ width:7, height:7, borderRadius:"50%",
              background: i<=doseIdx ? sub.color : "#23233a",
              boxShadow: i===doseIdx ? `0 0 6px ${sub.color}` : "none",
              transition:"all .3s" }} />
          ))}
        </div>
      </div>

      {/* ── CANVAS STAGE ── */}
      <div style={{ flex:1, position:"relative", overflow:"hidden", background:"#000",
        display:"flex", alignItems:"center", justifyContent:"center" }}>

        <canvas ref={canvasRef}
          style={{ width:"100%", height:"100%", display: hasImage&&!error ? "block" : "none" }} />

        {/* WebGL error */}
        {error && (
          <div style={{ padding:"32px 24px", textAlign:"center", maxWidth:320 }}>
            <div style={{ fontSize:44, marginBottom:16 }}>⚠</div>
            <div style={{ fontSize:14, color:"#ff8a8a", lineHeight:1.65, marginBottom:10 }}>{error}</div>
            <div style={{ fontSize:12, color:"#6b6b85", lineHeight:1.65 }}>
              Real-time mode needs WebGL2 with float textures. Try Safari on iOS 15+ or a desktop browser.
            </div>
          </div>
        )}

        {/* Empty state */}
        {!hasImage && !error && (
          <div onClick={()=>{ setTab("tune"); setSheetOpen(true); }}
            style={{ textAlign:"center", color:"#252540", cursor:"pointer" }}>
            <div style={{ fontSize:64, marginBottom:16, lineHeight:1 }}>◎</div>
            <div style={{ fontSize:12, letterSpacing:"0.28em", color:"#35354f" }}>
              TAP TO UPLOAD IMAGE
            </div>
          </div>
        )}

        {/* AI note chip */}
        {aiNote && hasImage && (
          <div style={{ position:"absolute", top:12, left:12, right:12,
            fontSize:11, lineHeight:1.55, color:"#aab",
            background:"rgba(6,6,10,0.85)", border:`1px solid ${sub.color}38`,
            borderRadius:10, padding:"9px 13px",
            backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)" }}>
            🧠 {aiNote}
          </div>
        )}

        {/* ── FLOATING ACTION BUTTONS ── */}
        {/* Play / Pause — primary FAB, bottom-right */}
        {hasImage && !error && (
          <button
            onClick={()=>setPlaying(p=>!p)}
            style={{
              position:"absolute", right:18, bottom:FAB_BOTTOM,
              width:56, height:56, borderRadius:"50%",
              background: playing ? sub.color : "rgba(11,11,20,0.92)",
              border:`2px solid ${sub.color}`,
              color: playing ? "#060608" : sub.color,
              fontSize:19, fontWeight:700,
              display:"flex", alignItems:"center", justifyContent:"center",
              cursor:"pointer", zIndex:5, touchAction:"manipulation",
              boxShadow: playing ? `0 4px 20px ${sub.color}55` : "none",
              transition:"all .3s",
            }}>
            {playing ? "❚❚" : "▶"}
          </button>
        )}

        {/* Save snapshot */}
        {hasImage && !error && (
          <button
            onClick={saveSnapshot}
            style={{
              position:"absolute", right:84, bottom:FAB_BOTTOM,
              width:48, height:48, borderRadius:"50%",
              background:"rgba(11,11,20,0.88)",
              border:`1px solid ${sub.color}66`,
              color: sub.color, fontSize:18,
              display:"flex", alignItems:"center", justifyContent:"center",
              cursor:"pointer", zIndex:5, touchAction:"manipulation",
              backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)",
            }}>
            ↓
          </button>
        )}

        {/* Settings toggle — bottom-left */}
        <button
          onClick={()=>setSheetOpen(s=>!s)}
          style={{
            position:"absolute", left:18, bottom:FAB_BOTTOM,
            width:48, height:48, borderRadius:"50%",
            background:"rgba(11,11,20,0.88)",
            border:`1.5px solid ${sheetOpen ? sub.color : "#2a2a40"}`,
            color: sheetOpen ? sub.color : "#55556f",
            fontSize:20,
            display:"flex", alignItems:"center", justifyContent:"center",
            cursor:"pointer", zIndex:5, touchAction:"manipulation",
            backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)",
            transition:"border-color .25s, color .25s",
          }}>
          ⚙
        </button>
      </div>

      {/* ── BOTTOM SHEET ── */}
      <div style={{
        position:"absolute", left:0, right:0, bottom:0,
        background:"#0c0c14",
        borderTop:`1px solid ${sub.color}38`,
        borderRadius:"20px 20px 0 0",
        // 68vh leaves ~270px for the canvas — enough to see the simulation
        maxHeight:"68vh",
        transform: sheetOpen ? "translateY(0)" : "translateY(100%)",
        transition:"transform .36s cubic-bezier(.32,.72,0,1)",
        zIndex:20, display:"flex", flexDirection:"column",
        boxShadow:"0 -8px 40px rgba(0,0,0,0.6)",
      }}>

        {/* Drag handle — tall touch target */}
        <div onClick={()=>setSheetOpen(false)}
          style={{ padding:"14px 0 10px", display:"flex", justifyContent:"center",
            cursor:"pointer", flexShrink:0, touchAction:"manipulation" }}>
          <div style={{ width:40, height:4, borderRadius:2, background:"#28283e" }} />
        </div>

        {/* Tab bar */}
        <div style={{ display:"flex", paddingLeft:14, paddingRight:14,
          borderBottom:"1px solid #18182a", flexShrink:0 }}>
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{
              flex:1,
              // 46px total height = comfortable iOS tap target
              padding:"12px 4px",
              background:"none", border:"none",
              borderBottom:`2.5px solid ${tab===t ? sub.color : "transparent"}`,
              color: tab===t ? sub.color : "#55556f",
              fontSize:11, letterSpacing:"0.18em", cursor:"pointer",
              textTransform:"uppercase", touchAction:"manipulation",
              transition:"color .2s, border-color .2s",
            }}>
              {t==="substance" ? "◈ DRUG" : t==="dose" ? "⚖ DOSE" : "✦ TUNE"}
            </button>
          ))}
        </div>

        {/* Scrollable content — momentum scroll + home indicator clearance */}
        <div style={{
          overflowY:"auto", flex:1,
          padding:"16px 16px 0",
          // bottom padding clears the home indicator (34px) inside the sheet
          paddingBottom:"max(20px, env(safe-area-inset-bottom, 20px))",
          WebkitOverflowScrolling:"touch",
        }}>

          {/* ── SUBSTANCE TAB ── */}
          {tab==="substance" && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {Object.entries(SUBSTANCES).map(([k,s])=>(
                <button key={k}
                  onClick={()=>{ setSubstance(k); setDoseIdx(2); resetOverrides(); setTab("dose"); }}
                  style={{
                    display:"flex", alignItems:"center", gap:13,
                    // 58px height = well above Apple's 44pt minimum
                    padding:"15px 15px", borderRadius:13, cursor:"pointer", textAlign:"left",
                    background: substance===k ? `${s.color}1c` : "#101019",
                    border:`1px solid ${substance===k ? s.color : "#1e1e2e"}`,
                    color: substance===k ? s.color : "#7a7a96",
                    touchAction:"manipulation", transition:"all .2s",
                  }}>
                  <span style={{ fontSize:24, lineHeight:1 }}>{s.emoji}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:15 }}>{s.label}</div>
                    <div style={{ fontSize:12, color:"#55556f", marginTop:3 }}>{s.sublabel}</div>
                  </div>
                  {substance===k && <span style={{ fontSize:16 }}>✓</span>}
                </button>
              ))}

              {/* Upload nudge */}
              <label style={{ display:"block", marginTop:4 }}>
                <div style={{ padding:"15px", borderRadius:13, textAlign:"center", cursor:"pointer",
                  border:`2px dashed ${hasImage ? sub.color+"55" : "#1e1e2e"}`,
                  background: hasImage ? `${sub.color}09` : "#101019",
                  fontSize:13, color: hasImage ? sub.color : "#55556f",
                  touchAction:"manipulation" }}>
                  {hasImage ? `📷 ${fileName} — tap to change` : "📷 Upload an image to begin"}
                </div>
                <input ref={el=>{ if(el) fileTriggerRef.current = ()=>el.click(); }}
                  type="file" accept="image/*" style={{ display:"none" }}
                  onChange={e=>loadImage(e.target.files[0])} />
              </label>
            </div>
          )}

          {/* ── DOSE TAB ── */}
          {tab==="dose" && (
            <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
              <div style={{ fontSize:11, color:"#55556f", letterSpacing:"0.18em", marginBottom:2 }}>
                {sub.emoji} {sub.label.toUpperCase()} — SELECT DOSE
              </div>
              {sub.doses.map((d,i)=>(
                <button key={i}
                  onClick={()=>{ setDoseIdx(i); resetOverrides(); }}
                  style={{
                    display:"flex", alignItems:"center",
                    padding:"15px 15px", borderRadius:13,
                    cursor:"pointer", position:"relative", overflow:"hidden",
                    background: doseIdx===i ? `${sub.color}1c` : "#101019",
                    border:`1px solid ${doseIdx===i ? sub.color : "#1e1e2e"}`,
                    color: doseIdx===i ? sub.color : "#7a7a96",
                    touchAction:"manipulation", transition:"all .2s",
                  }}>
                  {/* Intensity fill bar */}
                  <div style={{ position:"absolute", inset:0, width:`${d.i*100}%`,
                    background:`${sub.color}0b`, borderRadius:13 }} />
                  <div style={{ position:"relative", flex:1, fontSize:14 }}>
                    <b>{d.label}</b>
                    <span style={{ fontSize:12, color:"#55556f", marginLeft:9 }}>{d.amount}</span>
                  </div>
                  {doseIdx===i && <span style={{ position:"relative", fontSize:15 }}>✓</span>}
                </button>
              ))}

              {/* Intensity readout */}
              <div style={{ marginTop:6, padding:"12px 14px",
                background:"#101019", borderRadius:11, border:"1px solid #1e1e2e" }}>
                <div style={{ display:"flex", justifyContent:"space-between",
                  fontSize:11, color:"#55556f", letterSpacing:"0.14em", marginBottom:8 }}>
                  <span>INTENSITY</span>
                  <span style={{ color: sub.color }}>{Math.round(dose.i*100)}%</span>
                </div>
                <div style={{ height:5, background:"#1e1e2e", borderRadius:3, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${dose.i*100}%`, borderRadius:3,
                    background:`linear-gradient(90deg, ${sub.color}66, ${sub.color})`,
                    transition:"width .4s" }} />
                </div>
              </div>

              {/* Upload nudge */}
              <label style={{ display:"block", marginTop:4 }}>
                <div style={{ padding:"15px", borderRadius:13, textAlign:"center", cursor:"pointer",
                  border:`2px dashed ${hasImage ? sub.color+"55" : "#1e1e2e"}`,
                  background: hasImage ? `${sub.color}09` : "#101019",
                  fontSize:13, color: hasImage ? sub.color : "#55556f",
                  touchAction:"manipulation" }}>
                  {hasImage ? `📷 ${fileName} — tap to change` : "📷 Upload an image to begin"}
                </div>
                <input type="file" accept="image/*" style={{ display:"none" }}
                  onChange={e=>loadImage(e.target.files[0])} />
              </label>
            </div>
          )}

          {/* ── TUNE TAB ── */}
          {tab==="tune" && (
            <div>
              {/* Upload */}
              <label style={{ display:"block", marginBottom:14 }}>
                <div style={{ padding:"15px", borderRadius:13, textAlign:"center", cursor:"pointer",
                  border:`2px dashed ${hasImage ? sub.color+"55" : "#1e1e2e"}`,
                  background: hasImage ? `${sub.color}09` : "#101019",
                  fontSize:13, color: hasImage ? sub.color : "#55556f",
                  touchAction:"manipulation" }}>
                  {hasImage ? `📷 ${fileName} — tap to change` : "📷 Upload an image"}
                </div>
                <input type="file" accept="image/*" style={{ display:"none" }}
                  onChange={e=>loadImage(e.target.files[0])} />
              </label>

              {/* AI auto-tune */}
              <button onClick={aiTune} disabled={!hasImage||aiBusy}
                style={{
                  width:"100%", padding:"15px", marginBottom:18, borderRadius:13,
                  cursor: hasImage&&!aiBusy ? "pointer" : "default", touchAction:"manipulation",
                  background: aiBusy ? "#101019" : `linear-gradient(135deg, ${sub.color}30, ${sub.color}16)`,
                  border:`1.5px solid ${sub.color}`,
                  color: sub.color, fontWeight:700, fontSize:13, letterSpacing:"0.12em",
                }}>
                {aiBusy ? "🧠 ANALYZING IMAGE…" : "🧠 AI AUTO-TUNE TO IMAGE"}
              </button>

              {/* Sliders — bump track height + thumb for finger */}
              <Slider label="GEOMETRY STRENGTH" value={P.oscStrength} min={0} max={0.8} step={0.01}
                color={sub.color} onChange={v=>setOv("oscStrength",v)} fmt={v=>`${Math.round(v*125)}%`} />
              <Slider label="PATTERN SCALE" value={P.kSurround} min={3} max={9} step={0.1}
                color={sub.color} onChange={v=>setOv("kSurround",v)} fmt={v=>v.toFixed(1)} />
              <Slider label="FLOW / DRIFT" value={P.driftAmp} min={0} max={0.015} step={0.0005}
                color={sub.color} onChange={v=>setOv("driftAmp",v)} fmt={v=>`${Math.round(v*6667)}%`} />
              <Slider label="SPEED" value={P.speed} min={0.3} max={1.8} step={0.05}
                color={sub.color} onChange={v=>setOv("speed",v)} fmt={v=>`${v.toFixed(2)}×`} />
              <Slider label="COLOR INTENSITY" value={P.saturation} min={1} max={3} step={0.05}
                color={sub.color} onChange={v=>setOv("saturation",v)} fmt={v=>`${v.toFixed(2)}×`} />
              <Slider label="FORM CONSTANT" value={P.formStrength} min={0} max={0.8} step={0.01}
                color={sub.color} onChange={v=>setOv("formStrength",v)} fmt={v=>`${Math.round(v*125)}%`} />

              {/* Form constant type pills — 44pt touch height */}
              <div style={{ display:"flex", gap:7, marginTop:6, marginBottom:16 }}>
                {[["NONE",0],["TUNNEL",1],["SPIRAL",2],["WEB",3],["HONEY",4]].map(([nm,val])=>(
                  <button key={val} onClick={()=>setOv("formType",val)}
                    style={{
                      flex:1, padding:"11px 2px", borderRadius:9, cursor:"pointer",
                      fontSize:9, letterSpacing:"0.04em", touchAction:"manipulation",
                      background: P.formType===val ? `${sub.color}22` : "#101019",
                      border:`1px solid ${P.formType===val ? sub.color : "#1e1e2e"}`,
                      color: P.formType===val ? sub.color : "#55556f",
                      transition:"all .2s",
                    }}>{nm}</button>
                ))}
              </div>

              {/* Toggle buttons row */}
              <div style={{ display:"flex", gap:9, marginBottom:4 }}>
                <button onClick={()=>setOv("logPolar", P.logPolar?0:1)}
                  style={{
                    flex:1, padding:"13px 10px", borderRadius:11, cursor:"pointer",
                    fontSize:11, letterSpacing:"0.1em", touchAction:"manipulation",
                    background: P.logPolar ? `${sub.color}22` : "#101019",
                    border:`1px solid ${P.logPolar ? sub.color : "#1e1e2e"}`,
                    color: P.logPolar ? sub.color : "#55556f",
                    transition:"all .2s",
                  }}>
                  LOG-POLAR {P.logPolar?"ON":"OFF"}
                </button>
                <button onClick={resetOverrides}
                  style={{
                    flex:1, padding:"13px 10px", borderRadius:11, cursor:"pointer",
                    fontSize:11, letterSpacing:"0.1em", touchAction:"manipulation",
                    background:"#101019", border:"1px solid #1e1e2e", color:"#7a7a96",
                  }}>
                  RESET PRESET
                </button>
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div style={{ marginTop:18, marginBottom:4, padding:"12px 13px",
            background:"#090910", border:"1px solid #16162a",
            borderRadius:10, fontSize:11, color:"#45455f", lineHeight:1.65 }}>
            ⚠ Real-time replication inspired by QRI's Oscilleditor &amp; r/replications.
            For harm-reduction &amp; education only. Images never leave your device
            (except during AI auto-tune).
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform:rotate(0) } to { transform:rotate(360deg) } }
        * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
        ::-webkit-scrollbar { display:none; }

        /* Slider track */
        input[type=range] {
          -webkit-appearance:none; appearance:none;
          width:100%; height:6px;
          background:#1e1e2e; border-radius:4px;
          outline:none; cursor:pointer;
        }
        /* Slider thumb — 26px for comfortable finger touch */
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance:none; appearance:none;
          width:26px; height:26px; border-radius:50%;
          background:currentColor;
          box-shadow:0 0 8px currentColor;
          cursor:pointer; margin-top:-10px;
        }
        input[type=range]::-moz-range-thumb {
          width:26px; height:26px; border-radius:50%;
          background:currentColor; border:none;
          box-shadow:0 0 8px currentColor; cursor:pointer;
        }
        /* Fill colour on track (WebKit) */
        input[type=range]::-webkit-slider-runnable-track {
          height:6px; border-radius:4px;
        }
        /* Prevent iOS from zooming on input focus */
        input, button, select, textarea { font-size:16px; }
        input[type=range] { font-size:inherit; }
      `}</style>
    </div>
  );
}

// Module-level ref so the empty-state tap can trigger the file picker
const fileTriggerRef = { current: null };
