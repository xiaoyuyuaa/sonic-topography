import { useFrame, extend, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRef, useMemo, useCallback, useLayoutEffect, useEffect, forwardRef, useImperativeHandle } from 'react';
import { MapShaderMaterial } from './CustomShaderMaterial';
import { engine } from '../../lib/AudioEngine';
import { AudioData } from '../../types';
import { themes, ThemeColors } from '../../lib/themes';

extend({ MapShaderMaterial });
/* ============================================================
 * GPU 优化：自定义柱子几何 + 半精度顶点
 * 1) 去掉永远不可见的底面（相机始终在 Y>0，底面法线朝下被背面剔除）
 *    BoxGeometry 6 面 24 顶点 → 5 面 20 顶点（-17% 顶点数）
 * 2) position/normal/uv 转半精度 Float16（顶点带宽 -50%，
 *    局部坐标范围 ±0.5，半精度绝对精度 ~0.0005，视觉不可辨）
 * 渲染结果与 BoxGeometry 完全一致（底面本来就被剔除，不产生任何像素）
 * ============================================================ */

// 与 BoxGeometry(w, 1, w) 顶面+侧面完全一致的 5 面柱子（逆时针绕序，从法线方向看）
function createPillarGeometry(width: number): THREE.BufferGeometry {
  const hw = width / 2;
  const hd = width / 2;
  const hy = 0.5;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    n: [number, number, number],
  ) => {
    const base = positions.length / 3;
    positions.push(...a, ...b, ...c, ...d);
    normals.push(...n, ...n, ...n, ...n);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  // 顶面（法线 +y，uv 0-1 平面，供片元着色器边缘发光使用）
  quad([-hw, hy, -hd], [hw, hy, -hd], [hw, hy, hd], [-hw, hy, hd], [0, 1, 0]);
  // 侧面 +z
  quad([-hw, -hy, hd], [hw, -hy, hd], [hw, hy, hd], [-hw, hy, hd], [0, 0, 1]);
  // 侧面 -z
  quad([hw, -hy, -hd], [-hw, -hy, -hd], [-hw, hy, -hd], [hw, hy, -hd], [0, 0, -1]);
  // 侧面 +x
  quad([hw, -hy, -hd], [hw, -hy, hd], [hw, hy, hd], [hw, hy, -hd], [1, 0, 0]);
  // 侧面 -x
  quad([-hw, -hy, hd], [-hw, -hy, -hd], [-hw, hy, -hd], [-hw, hy, hd], [-1, 0, 0]);
  // 底面已省略（永远不可见）

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

// position/normal/uv → Float16（顶点属性带宽减半）
// 注意：three r184 的 Float16BufferAttribute 不自动编码，需手动 toHalfFloat
function toHalfPrecision(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const attrs = geometry.attributes;
  for (const key of ['position', 'normal', 'uv']) {
    const attr = attrs[key] as THREE.BufferAttribute | undefined;
    if (!attr) continue;
    const src = attr.array as ArrayLike<number>;
    const half = new Uint16Array(src.length);
    for (let i = 0; i < src.length; i++) {
      half[i] = THREE.DataUtils.toHalfFloat(src[i]);
    }
    geometry.setAttribute(key, new THREE.Float16BufferAttribute(half, attr.itemSize));
  }
  return geometry;
}

interface MapSceneProps {
  theme?: string | ThemeColors; // 支持主题名或混合后的主题颜色对象
  cameraDistance?: number;
  idleWaveEnabled?: boolean;
  audioIntensity?: number;
  responseRange?: number;
  cameraAngleX?: number;
  cameraAngleY?: number;
  autoRotateEnabled?: boolean;
  autoRotateSpeed?: number; // 每秒旋转的角度（度）
  gridSize?: number;
  peakColorEnabled?: boolean; // 强调色开关
  peakColorIntensity?: number; // 强调色强度 (0-2)
}

export interface MapSceneHandle {
  triggerMeteorAt: (clientX: number, clientY: number) => void;
}

export const MapScene = forwardRef<MapSceneHandle, MapSceneProps>(({ theme = 'nocturnal', cameraDistance = 50, idleWaveEnabled = true, audioIntensity = 1.0, responseRange = 1.0, cameraAngleX = 45, cameraAngleY = 30, autoRotateEnabled = false, autoRotateSpeed = 10, gridSize = 160, peakColorEnabled = true, peakColorIntensity = 1.0 }, ref) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<any>(null);
  const { clock, camera, gl } = useThree();

  // 自动旋转角度追踪
  const autoRotateAngleRef = useRef(cameraAngleX);

  // 逻辑帧参数 ref：存储最新的动态参数，避免 useEffect 频繁重建
  const logicParamsRef = useRef({
    autoRotateEnabled,
    autoRotateSpeed,
    cameraAngleY,
    cameraDistance,
  });

  // 同步最新参数到 ref
  useEffect(() => {
    logicParamsRef.current.autoRotateEnabled = autoRotateEnabled;
    logicParamsRef.current.autoRotateSpeed = autoRotateSpeed;
    logicParamsRef.current.cameraAngleY = cameraAngleY;
    logicParamsRef.current.cameraDistance = cameraDistance;
  }, [autoRotateEnabled, autoRotateSpeed, cameraAngleY, cameraDistance]);

  // 复用 Color 对象避免每帧 GC
  const _tempColor = useMemo(() => new THREE.Color(), []);
  const _whiteColor = useMemo(() => new THREE.Color(0xffffff), []);

  // 获取主题颜色对象
  const getThemeColors = useCallback((): ThemeColors => {
    if (typeof theme === 'string') {
      return themes[theme] || themes['nocturnal'];
    }
    return theme;
  }, [theme]);
  
  const totalRange = 168;
  const spacing = totalRange / gridSize;
  const pillarWidth = spacing * 0.857;
  const count = gridSize * gridSize;
  const halfExtent = totalRange / 2;

  // 优化几何：去底面 + 半精度顶点（渲染结果与 boxGeometry 一致，GPU 顶点负载显著下降）
  const pillarGeometry = useMemo(
    () => toHalfPrecision(createPillarGeometry(pillarWidth)),
    [pillarWidth],
  );
  useEffect(() => {
    return () => pillarGeometry.dispose();
  }, [pillarGeometry]);

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    const tempMatrix = new THREE.Matrix4();
    const offset = (gridSize * spacing) / 2;

    let i = 0;
    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        const px = x * spacing - offset;
        const pz = z * spacing - offset;
        tempMatrix.makeTranslation(px, 0.5, pz);
        meshRef.current.setMatrixAt(i, tempMatrix);
        i++;
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [gridSize, spacing]);

  // Ripples logic
  // We keep a ring buffer of 20 ripples
  const ripplesRef = useRef(new Array(20).fill(null).map(() => ({
    pos: new THREE.Vector2(),
    time: -100,
    strength: 0,
    isActive: 0,
    rippleType: 0
  })));
  const rippleIndex = useRef(0);

  const addRipple = useCallback((x: number, y: number, strength: number, isWhite: boolean = false) => {
    const idx = rippleIndex.current;
    ripplesRef.current[idx] = {
      pos: new THREE.Vector2(x, y),
      time: clock.getElapsedTime(),
      strength,
      isActive: 1,
      rippleType: isWhite ? 1 : 0
    } as any;
    rippleIndex.current = (idx + 1) % 20;
  }, [clock]);

  const fogRef = useRef<THREE.Fog>(null);
  
  // Meteors logic
  const MAX_METEORS = 40;
  const meteorMeshRef = useRef<THREE.InstancedMesh>(null);
  const meteorMatRef = useRef<THREE.MeshBasicMaterial>(null);
  
  // Particles for meteor trails
  const MAX_PARTICLES = 200;
  const particleMeshRef = useRef<THREE.InstancedMesh>(null);
  const particleMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const particlesRef = useRef(new Array(MAX_PARTICLES).fill(null).map(() => ({
    active: false,
    x: 0, y: -1000, z: 0,
    vx: 0, vy: 0, vz: 0,
    life: 0, maxLife: 1, scale: 1
  })));
  const particleIndex = useRef(0);
  const spawnParticle = useCallback((x: number, y: number, z: number, speedMultiplier: number) => {
     const idx = particleIndex.current;
     const p = particlesRef.current[idx];
     p.active = true;
     p.x = x + (Math.random() - 0.5) * 1.5;
     p.y = y + (Math.random() - 0.5) * 1.5;
     p.z = z + (Math.random() - 0.5) * 1.5;
     p.vx = (Math.random() - 0.5) * 2.0;
     p.vy = Math.random() * 2.0 + speedMultiplier * 10.0;
     p.vz = (Math.random() - 0.5) * 2.0;
     p.life = 0;
     p.maxLife = 0.5 + Math.random() * 0.5;
     p.scale = Math.random() * 0.6 + 0.2;
     particleIndex.current = (idx + 1) % MAX_PARTICLES;
  }, [MAX_PARTICLES]);
  
  const dummyMatrix = useMemo(() => new THREE.Matrix4(), []);
  const dummyPosition = useMemo(() => new THREE.Vector3(), []);
  const dummyRotation = useMemo(() => new THREE.Quaternion(), []);
  const dummyScale = useMemo(() => new THREE.Vector3(), []);
  
  const meteorsRef = useRef(new Array(MAX_METEORS).fill(null).map(() => ({
    active: false,
    x: 0,
    y: -1000,
    z: 0,
    speed: 0,
    strength: 0,
  })));
  const meteorIndex = useRef(0);
  const lastMeteorSpawnTime = useRef(-Infinity);
  const lastClickMeteorTime = useRef(-Infinity);

  const addMeteor = (strength: number) => {
     const now = clock.getElapsedTime();
     const cooldownSeconds = engine.meteorTrigger.cooldown / 60;
     if (now - lastMeteorSpawnTime.current < cooldownSeconds) return;
     lastMeteorSpawnTime.current = now;

     const idx = meteorIndex.current;
     const angle = Math.random() * Math.PI * 2;
     const dist = 10 + Math.random() * 35;
     
     const m = meteorsRef.current[idx];
     m.active = true;
     m.x = Math.cos(angle) * dist;
     m.z = Math.sin(angle) * dist;
     m.y = 30 + Math.random() * 10;
     m.speed = 1.0 + Math.random() * 0.5 + (strength * 2.5);
     m.strength = strength;
     
     meteorIndex.current = (idx + 1) % MAX_METEORS;
  };
  
  // Pulse anchor: keep kick ripples clustered in groups of 3~7 per anchor position
  const pulseAnchorRef = useRef({ x: 0, z: 0, initialized: false, lastTriggerTime: 0, hitsRemaining: 0 });
  const PULSE_ANCHOR_EXPIRE_MS = 1500; // 超过此间隔则重新开始新簇计数

  // Wire up audio engine beat detection
  // Strength is already scaled by engine's pulseStrength/meteorStrength config in evaluateTrigger
  useEffect(() => {
    engine.onFreqTrigger = (strength, mode, action) => {
       if (action === 'Meteor') {
          addMeteor(Math.min(strength * 20, 4.0));
       } else {
          const now = performance.now();

          if (!pulseAnchorRef.current.initialized || 
              (now - pulseAnchorRef.current.lastTriggerTime) > PULSE_ANCHOR_EXPIRE_MS ||
              pulseAnchorRef.current.hitsRemaining <= 0) {
             pulseAnchorRef.current.x = (Math.random() - 0.5) * 50;
             pulseAnchorRef.current.z = (Math.random() - 0.5) * 50;
             pulseAnchorRef.current.hitsRemaining = 5 + Math.floor(Math.random() * 9);
             pulseAnchorRef.current.initialized = true;
          }
          pulseAnchorRef.current.hitsRemaining--;
          pulseAnchorRef.current.lastTriggerTime = now;

          let rx: number, rz: number;
          if (mode === 'Kick') {
             rx = pulseAnchorRef.current.x + (Math.random() - 0.5) * 8;
             rz = pulseAnchorRef.current.z + (Math.random() - 0.5) * 8;
          } else {
             const angle = Math.random() * Math.PI * 2;
             const dist = 15 + Math.random() * 45;
             rx = Math.cos(angle) * dist;
             rz = Math.sin(angle) * dist;
          }
          addRipple(rx, rz, Math.min(strength * 40, 8.0));
       }
    };
  }, [theme]);

  useImperativeHandle(ref, () => ({
    triggerMeteorAt: (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersectionPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, intersectionPoint);

      if (intersectionPoint) {
        const now = clock.getElapsedTime();
        if (now - lastClickMeteorTime.current < 0.3) return;
        lastClickMeteorTime.current = now;

        const idx = meteorIndex.current;
        const m = meteorsRef.current[idx];
        m.active = true;
        m.x = intersectionPoint.x;
        m.z = intersectionPoint.z;
        m.y = 30 + Math.random() * 10;
        m.speed = 1.0 + Math.random() * 0.5 + 2.5;
        m.strength = 1.0;

        meteorIndex.current = (idx + 1) % MAX_METEORS;
      }
    },
  }), [camera, gl, clock]);

  // Camera position controlled by distance + two-axis angle
  const updateCameraPosition = useCallback((angleX: number, angleY: number, dist: number) => {
    const azimuth = angleX * Math.PI / 180;
    const elevation = angleY * Math.PI / 180;
    const horizontalDist = dist * Math.cos(elevation);
    camera.position.x = horizontalDist * Math.sin(azimuth);
    camera.position.z = horizontalDist * Math.cos(azimuth);
    camera.position.y = dist * Math.sin(elevation);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useEffect(() => {
    // 自动旋转未启用时，始终将 cameraAngleX 同步到 ref，确保启用旋转时从当前角度开始
    if (!autoRotateEnabled) {
      autoRotateAngleRef.current = cameraAngleX;
    }
    // 自动旋转未启用时，由 prop 控制相机位置；启用时由逻辑帧控制
    if (!autoRotateEnabled) {
      updateCameraPosition(cameraAngleX, cameraAngleY, cameraDistance);
    }
  }, [cameraAngleX, cameraAngleY, cameraDistance, autoRotateEnabled, updateCameraPosition]);

  // 逻辑帧缓冲区：逻辑帧写入，渲染帧读取
  const logicBufferRef = useRef({
    audioData: null as AudioData | null,
    idleIntensity: 0,
  });

  /* 逻辑帧：固定 1000fps，独立于渲染帧率，保证位置更新平滑跟手 */
  useEffect(() => {
    const LOGIC_FPS = 1000;
    let lastTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const elapsed = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(elapsed, 0.1);

      // 音频数据采样
      logicBufferRef.current.audioData = engine.getAudioData(dt);
      logicBufferRef.current.idleIntensity = engine.getIdleWaveIntensity(dt);

      // 流星位置更新
      for (let i = 0; i < MAX_METEORS; i++) {
        const m = meteorsRef.current[i];
        if (m.active) {
          m.y -= m.speed * 60 * dt;
          if (m.y <= 0) {
            m.active = false;
            addRipple(m.x, m.z, m.strength * 1.5, true);
            for (let pIndex = 0; pIndex < 10; pIndex++) spawnParticle(m.x, 0.5, m.z, m.speed * 1.5);
          }
          // 流星拖尾粒子
          if (m.active && m.y > 0 && Math.random() > 0.3) {
            spawnParticle(m.x, m.y, m.z, m.speed * 0.2);
          }
        }
      }

      // 粒子位置更新
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = particlesRef.current[i];
        if (p.active) {
          p.life += dt;
          if (p.life >= p.maxLife) {
            p.active = false;
          } else {
            p.x += p.vx * dt * 10;
            p.y += p.vy * dt * 10;
            p.z += p.vz * dt * 10;
          }
        }
      }

      // 自动旋转 - 从 ref 读取最新参数
      const params = logicParamsRef.current;
      if (params.autoRotateEnabled) {
        autoRotateAngleRef.current = (autoRotateAngleRef.current + params.autoRotateSpeed * dt) % 360;
        updateCameraPosition(autoRotateAngleRef.current, params.cameraAngleY, params.cameraDistance);
      }
    };

    const interval = setInterval(tick, 1000 / LOGIC_FPS);
    tick();
    return () => clearInterval(interval);
  }, [MAX_METEORS, MAX_PARTICLES, addRipple, spawnParticle, updateCameraPosition]);

  /* 渲染帧：按 fpsLimit 频率，只传递 uniform + 更新矩阵 */
  useFrame((state) => {
    if (!materialRef.current) return;
    const mat = materialRef.current;
    const buf = logicBufferRef.current;
    const data = buf.audioData || engine.getAudioData(0.016);
    const t = getThemeColors();

    const isMixedTheme = typeof theme !== 'string';
    const lerpSpeed = isMixedTheme ? 1.0 : 0.05;

    mat.uBaseColor1.lerp(t.uBaseColor1, lerpSpeed);
    mat.uBaseColor2.lerp(t.uBaseColor2, lerpSpeed);
    mat.uCoolCore.lerp(t.uCoolCore, lerpSpeed);
    mat.uCoolEdge.lerp(t.uCoolEdge, lerpSpeed);
    mat.uWarmCore.lerp(t.uWarmCore, lerpSpeed);
    mat.uWarmEdge.lerp(t.uWarmEdge, lerpSpeed);
    mat.uRippleColor.lerp(t.uRippleColor, lerpSpeed);
    mat.uPeakColor.lerp(t.uPeakColor, lerpSpeed);
    mat.uGlowIntensity = THREE.MathUtils.lerp(mat.uGlowIntensity, t.uGlowIntensity, lerpSpeed);
    mat.uPeakEnabled = peakColorEnabled ? 1.0 : 0.0;
    mat.uPeakIntensity = peakColorIntensity;

    if (fogRef.current) {
        fogRef.current.color.lerp(t.uBaseColor1, lerpSpeed);
    }

    mat.uTime = state.clock.getElapsedTime();
    mat.uBass = data.bass;
    mat.uMid = data.mid;
    mat.uTreble = data.treble;
    mat.uEnergy = data.energy;
    mat.uSubBass = data.subBass;
    mat.uLowMid = data.lowMid;
    mat.uHighMid = data.highMid;
    mat.uPresence = data.presence;
    mat.uBrilliance = data.brilliance;
    mat.uAir = data.air;
    mat.uWarmth = data.warmth;
    mat.uBrightness = data.brightness;
    mat.uSharpness = data.sharpness;
    mat.uSmoothness = data.smoothness;
    mat.uDensity = data.density;
    mat.uSpectralCentroid = data.spectralCentroid;
    mat.uAudioIntensity = audioIntensity;
    mat.uResponseRange = responseRange;
    mat.uRipples = ripplesRef.current;
    mat.uIdleWave = idleWaveEnabled ? buf.idleIntensity : 0.0;
    mat.uHalfExtent = halfExtent;

    // 流星矩阵更新
    if (meteorMeshRef.current) {
        if (meteorMatRef.current) {
            const mColor = _tempColor.copy(t.uWarmCore).lerp(_whiteColor, 0.7);
            meteorMatRef.current.color.lerp(mColor, lerpSpeed);
        }
        for (let i = 0; i < MAX_METEORS; i++) {
            const m = meteorsRef.current[i];
            if (!m.active) {
                dummyPosition.set(0, -1000, 0);
                dummyScale.set(0, 0, 0);
            } else {
                dummyPosition.set(m.x, Math.max(0, m.y), m.z);
                dummyScale.set(1.5, 1.5, 1.5);
            }
            dummyMatrix.compose(dummyPosition, dummyRotation, dummyScale);
            meteorMeshRef.current.setMatrixAt(i, dummyMatrix);
        }
        meteorMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    // 粒子矩阵更新
    if (particleMeshRef.current) {
        if (particleMatRef.current) particleMatRef.current.color.copy(meteorMatRef.current ? meteorMatRef.current.color : _whiteColor);
        for (let i = 0; i < MAX_PARTICLES; i++) {
           const p = particlesRef.current[i];
           if (!p.active) {
                dummyPosition.set(0, -1000, 0);
                dummyScale.set(0, 0, 0);
           } else {
                const s = p.scale * (1.0 - (p.life / p.maxLife));
                dummyPosition.set(p.x, p.y, p.z);
                dummyScale.set(s, s, s);
           }
           dummyMatrix.compose(dummyPosition, dummyRotation, dummyScale);
           particleMeshRef.current.setMatrixAt(i, dummyMatrix);
        }
        particleMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  const t = getThemeColors();

  return (
    <>
      <fog ref={fogRef} attach="fog" args={[`#${t.uBaseColor1.getHexString()}`, 30, 95]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={1} />

      <instancedMesh
        ref={meshRef}
        key={gridSize}
        args={[undefined, undefined, count]}
      >
        <primitive object={pillarGeometry} attach="geometry" />
        {/* @ts-ignore */}
        <mapShaderMaterial ref={materialRef} transparent={true} depthWrite={true} />
      </instancedMesh>

      <instancedMesh ref={meteorMeshRef} args={[undefined as any, undefined as any, MAX_METEORS]} frustumCulled={false}>
         <boxGeometry args={[0.4, 1.2, 0.4]} />
         <meshBasicMaterial ref={meteorMatRef} color="#ffffff" toneMapped={false} /> 
      </instancedMesh>

      <instancedMesh ref={particleMeshRef} args={[undefined as any, undefined as any, MAX_PARTICLES]} frustumCulled={false}>
         <boxGeometry args={[0.8, 0.8, 0.8]} />
         <meshBasicMaterial ref={particleMatRef} color="#ffffff" toneMapped={false} transparent={true} opacity={0.6} /> 
      </instancedMesh>
    </>
  );
});
