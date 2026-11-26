import {
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
  type Texture,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FXAAPass } from "three/addons/postprocessing/FXAAPass.js";
import type { Quality } from "../../shared/config";

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as Texture | null },
    uTime: { value: 0 },
    uSaturation: { value: 1.08 },
    uContrast: { value: 1.025 },
    uVignette: { value: 0.34 },
    uGrain: { value: 0.024 },
    uWarmth: { value: 0.03 },
    uAberration: { value: 0.0008 },
    uSpeed: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uWarmth;
    uniform float uAberration;
    uniform float uSpeed;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float r2 = dot(centered, centered);
      vec2 offset = centered * uAberration * r2 * 4.0;
      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      vec3 col = vec3(r, g, b);

      // Saturation + gentle contrast in display space.
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      // Warm highlights, cool shadows.
      col.r += uWarmth * smoothstep(0.42, 1.0, luma);
      col.b += uWarmth * 0.55 * (1.0 - smoothstep(0.0, 0.48, luma));

      // Soft cinematic vignette.
      float vig = smoothstep(0.92, 0.24, length(centered) * 1.26);
      col *= mix(1.0, vig, uVignette);

      // A whisper of animated film grain keeps flat areas alive.
      float grain = hash(vUv * uResolution + fract(uTime) * 61.7) - 0.5;
      col += grain * uGrain;

      // Radial streak blur sells the afterburner without a full motion-blur pass.
      if (uSpeed > 0.002) {
        float d = length(centered);
        float edge = smoothstep(0.12, 0.72, d);
        vec4 accum = vec4(0.0);
        for (int i = 1; i <= 4; i++) {
          vec2 off = centered * (uSpeed * 0.03) * (float(i) / 4.0);
          accum += texture2D(tDiffuse, vUv + off);
        }
        accum *= 0.25;
        col = mix(col, accum.rgb, uSpeed * edge * 0.28);
        float angle = atan(centered.y, centered.x);
        float streak = hash(vec2(floor(angle * 42.0), floor(uTime * 18.0)));
        float lines = smoothstep(0.93, 1.0, streak) * edge * uSpeed;
        col += vec3(0.72, 0.84, 1.0) * lines * 0.35;
      }

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

export class PostFX {
  private renderer: WebGLRenderer;
  private scene: Scene;
  private camera: PerspectiveCamera;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private gradePass: ShaderPass;
  private fxaaPass: FXAAPass;
  private quality: Quality;
  private time = 0;
  private speed = 0;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, quality: Quality) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0.22, 0.32, 2.4);
    this.composer.addPass(this.bloomPass);

    const output = new OutputPass();
    this.composer.addPass(output);

    this.gradePass = new ShaderPass(new ShaderMaterial(GradeShader));
    this.composer.addPass(this.gradePass);

    this.fxaaPass = new FXAAPass();
    this.composer.addPass(this.fxaaPass);

    this.setQuality(quality);
  }

  get enabled(): boolean {
    return this.quality !== "low";
  }

  setQuality(quality: Quality): void {
    this.quality = quality;
    this.bloomPass.enabled = quality !== "low";
    this.bloomPass.strength = quality === "high" ? 0.24 : 0.15;
    this.bloomPass.radius = quality === "high" ? 0.34 : 0.28;
    this.fxaaPass.enabled = quality === "high";
    this.gradePass.uniforms.uVignette.value = quality === "low" ? 0.28 : 0.34;
    this.gradePass.uniforms.uGrain.value = quality === "low" ? 0.012 : 0.024;
  }

  setSize(width: number, height: number, dpr: number): void {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    this.gradePass.uniforms.uResolution.value.set(width * dpr, height * dpr);
  }

  setSpeed(target: number): void {
    this.speed += (Math.max(0, Math.min(1, target)) - this.speed) * 0.12;
  }

  render(dt: number): void {
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.time += dt;
    this.gradePass.uniforms.uTime.value = this.time;
    this.gradePass.uniforms.uSpeed.value = this.speed;
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
