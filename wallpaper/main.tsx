import { StrictMode, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { MapScene } from '../src/components/AudioVisualizer/MapScene';
import { themes, themeIds, lerpThemes, ThemeColors } from '../src/lib/themes';
import { engine } from '../src/lib/AudioEngine';
import { fetchWeather, WeatherInfo } from '../src/lib/weather';
import '../src/index.css';

/* Wallpaper Engine Media Integration 全局类型声明（index.html 内联脚本注入，纯类型、无运行时影响） */
declare global {
  interface MediaState {
    title: string;
    artist: string;
    thumbnail: string;
    primaryColor: string;
    textColor: string;
    isPlaying: boolean;
    position: number;
    duration: number;
  }
  interface Window {
    __mediaState: MediaState & { _callbacks: ((state: MediaState) => void)[] };
  }
}

/* 中文星期 */
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/* Wallpaper Engine 属性监听 - 模块级别缓存，解决加载时序问题 */
let _pendingProps: WallpaperProperties | null = null;
let _pendingGeneralProps: GeneralProperties | null = null;
let _applyProps: ((props: WallpaperProperties) => void) | null = null;
let _applyGeneralProps: ((props: GeneralProperties) => void) | null = null;

interface PropertyValue {
  value: string | number | boolean;
}

interface WallpaperProperties {
  [key: string]: PropertyValue;
}

interface GeneralProperties {
  fps?: number;
}

// 立即注册监听器，确保不丢失 Wallpaper Engine 的初始属性调用
(window as any).wallpaperPropertyListener = {
  applyUserProperties: (props: WallpaperProperties) => {
    if (_applyProps) {
      _applyProps(props); // 组件已挂载，直接应用
    } else {
      _pendingProps = { ...(_pendingProps || {}), ...props }; // 组件未挂载，缓存
    }
  },
  applyGeneralProperties: (props: GeneralProperties) => {
    if (_applyGeneralProps) {
      _applyGeneralProps(props);
    } else {
      _pendingGeneralProps = { ...(_pendingGeneralProps || {}), ...props };
    }
  }
};

/* FPS 限制器组件 - demand 模式 + setTimeout 精确控制 */
function FPSLimiter({ fpsLimit }: { fpsLimit: number }) {
  const { invalidate } = useThree();

  useEffect(() => {
    let timerId: number;

    if (fpsLimit <= 0) {
      // 无限制，持续触发渲染
      const loop = () => {
        invalidate();
        timerId = requestAnimationFrame(loop);
      };
      timerId = requestAnimationFrame(loop);
    } else {
      // 限制帧率，用 setTimeout 精确控制
      const interval = 1000 / fpsLimit;
      const loop = () => {
        invalidate();
        timerId = window.setTimeout(loop, interval);
      };
      timerId = window.setTimeout(loop, interval);
    }

    return () => {
      if (fpsLimit <= 0) cancelAnimationFrame(timerId);
      else clearTimeout(timerId);
    };
  }, [fpsLimit, invalidate]);

  return null;
}

function WallpaperApp() {
  const defaultCameraDistance = 85;

  // Wallpaper Engine FPS 限制（默认 60 上限：动画观感不变，避免无限制渲染导致 GPU 满载空转；WE 的 fps 属性仍可覆盖）
  const [fpsLimit, setFpsLimit] = useState(60); // 0 表示无限制

  const [themeMode, setThemeMode] = useState<'cycle' | string>('nocturnal'); // 'cycle' 或具体主题名
  const [cameraDistance, setCameraDistance] = useState(defaultCameraDistance);
  const [cameraAngleX, setCameraAngleX] = useState(120);
  const [cameraAngleY, setCameraAngleY] = useState(25);
  const [autoRotateEnabled, setAutoRotateEnabled] = useState(false);
  const [autoRotateSpeed, setAutoRotateSpeed] = useState(10);
  const [idleWaveEnabled, setIdleWaveEnabled] = useState(true);
  const [showPlayerController, setShowPlayerController] = useState(true);
  const [showAlbumCover, setShowAlbumCover] = useState(true);
  const [controllerScale, setControllerScale] = useState(1.0); // 控制器尺寸比例（1.0 = 100%，可在属性中直接输入数值）
  const [controllerX, setControllerX] = useState(2); // 控制器水平位置 (%)
  const [controllerY, setControllerY] = useState(3); // 控制器垂直位置 (%)
  const [audioIntensity, setAudioIntensity] = useState(1);
  const [responseRange, setResponseRange] = useState(1);
  const [gridSize, setGridSize] = useState(160);
  const [meteorClickEnabled, setMeteorClickEnabled] = useState(true);
  const [peakColorEnabled, setPeakColorEnabled] = useState(true); // 强调色开关
  const [peakColorIntensity, setPeakColorIntensity] = useState(1.0); // 强调色强度
  const [themeCycleInterval, setThemeCycleInterval] = useState(60); // 默认60秒
  const mapSceneRef = useRef<any>(null);

  /* 时钟模块状态 */
  const [showClock, setShowClock] = useState(true);
  const [clockPosX, setClockPosX] = useState(50); // 水平位置 (%)
  const [clockPosY, setClockPosY] = useState(10); // 垂直位置 (%)
  const [clockSize, setClockSize] = useState(56); // 字号 (px)
  const [clock24Hour, setClock24Hour] = useState(true); // 12/24 小时制
  const [clockText, setClockText] = useState('');
  const [clockSuffix, setClockSuffix] = useState('');
  const [dateText, setDateText] = useState('');
  /* 天气模块状态（Open-Meteo 免费 API，无需 key；城市留空时尝试 IP 定位） */
  const [weatherEnabled, setWeatherEnabled] = useState(true);
  const [weatherCity, setWeatherCity] = useState('');
  const [weatherData, setWeatherData] = useState<WeatherInfo | null>(null);
  
  /* 主题轮询过渡状态 */
  const [cycleProgress, setCycleProgress] = useState(0); // 0-1 之间的过渡进度
  const cycleStartRef = useRef<number>(0); // 当前过渡周期的开始时间
  const currentThemeIndexRef = useRef(0); // 当前主题索引

  /* Wallpaper Engine Media Integration 状态 - 从全局读取初始值 */
const getInitialMediaState = () => window.__mediaState || {
  title: '', artist: '', thumbnail: '', primaryColor: '', textColor: '', isPlaying: false, position: 0, duration: 0
};
const initialMedia = getInitialMediaState();

const [mediaTitle, setMediaTitle] = useState(initialMedia.title);
const [mediaArtist, setMediaArtist] = useState(initialMedia.artist);
const [mediaThumbnail, setMediaThumbnail] = useState(initialMedia.thumbnail);
const [primaryColor, setPrimaryColor] = useState(initialMedia.primaryColor);
const [textColor, setTextColor] = useState(initialMedia.textColor);
const [isMediaPlaying, setIsMediaPlaying] = useState(initialMedia.isPlaying);
const [mediaPosition, setMediaPosition] = useState(initialMedia.position);
const [mediaDuration, setMediaDuration] = useState(initialMedia.duration);

  /* 订阅 Media Integration 状态更新 */
  useEffect(() => {
    if (!window.__mediaState) return;
    const callback = (state: MediaState) => {
      setMediaTitle(state.title);
      setMediaArtist(state.artist);
      setMediaThumbnail(state.thumbnail);
      setPrimaryColor(state.primaryColor);
      setTextColor(state.textColor);
      setIsMediaPlaying(state.isPlaying);
      setMediaPosition(state.position);
      setMediaDuration(state.duration);
    };
    window.__mediaState._callbacks.push(callback);
    return () => {
      const idx = window.__mediaState._callbacks.indexOf(callback);
      if (idx > -1) window.__mediaState._callbacks.splice(idx, 1);
    };
  }, []);

  /* 计算当前主题（支持混合过渡） */
  const currentTheme: ThemeColors = useMemo(() => {
    if (themeMode === 'cycle') {
      // 轮询模式：计算当前主题和下一个主题的混合
      const currentIndex = currentThemeIndexRef.current;
      const nextIndex = (currentIndex + 1) % themeIds.length;
      const currentThemeData = themes[themeIds[currentIndex]];
      const nextThemeData = themes[themeIds[nextIndex]];
      return lerpThemes(currentThemeData, nextThemeData, cycleProgress);
    } else {
      // 固定主题模式
      return themes[themeMode] || themes['nocturnal'];
    }
  }, [themeMode, cycleProgress]);

  const t = currentTheme;
  const bgColor = `#${t.uBaseColor1.getHexString()}`;
  const accentColor = `#${t.uRippleColor.getHexString()}`;

  /* applyUserProperties 回调 - Wallpaper Engine 配置项变更 */
  const handleProperties = useCallback((properties: WallpaperProperties) => {
    if (properties.theme?.value) {
      setThemeMode(properties.theme.value as string);
    }
    if (properties.idleWaveEnabled?.value !== undefined) {
      setIdleWaveEnabled(properties.idleWaveEnabled.value as boolean);
    }
    if (properties.idleWaveDebounce?.value !== undefined) {
      engine.setIdleWaveDebounce(properties.idleWaveDebounce.value as number);
    }
    if (properties.idleWaveFadeDuration?.value !== undefined) {
      engine.setIdleFadeOutDuration(properties.idleWaveFadeDuration.value as number);
    }
    if (properties.cameraDistance?.value !== undefined) {
      setCameraDistance(properties.cameraDistance.value as number);
    }
    if (properties.cameraAngleX?.value !== undefined) {
      setCameraAngleX(properties.cameraAngleX.value as number);
    }
    if (properties.cameraAngleY?.value !== undefined) {
      setCameraAngleY(properties.cameraAngleY.value as number);
    }
    if (properties.autoRotateEnabled?.value !== undefined) {
      setAutoRotateEnabled(properties.autoRotateEnabled.value as boolean);
    }
    if (properties.autoRotateSpeed?.value !== undefined) {
      setAutoRotateSpeed(properties.autoRotateSpeed.value as number);
    }
    if (properties.pulseEnabled?.value !== undefined) {
      engine.pulseTrigger.enabled = properties.pulseEnabled.value as boolean;
    }
    if (properties.pulseSensitivity?.value !== undefined) {
      engine.pulseTrigger.sensitivity = properties.pulseSensitivity.value as number;
    }
    if (properties.pulseCooldown?.value !== undefined) {
      engine.pulseTrigger.cooldown = properties.pulseCooldown.value as number;
    }
    if (properties.meteorEnabled?.value !== undefined) {
      engine.meteorTrigger.enabled = properties.meteorEnabled.value as boolean;
    }
    if (properties.meteorSensitivity?.value !== undefined) {
      engine.meteorTrigger.sensitivity = properties.meteorSensitivity.value as number;
    }
    if (properties.meteorCooldown?.value !== undefined) {
      engine.meteorTrigger.cooldown = properties.meteorCooldown.value as number;
    }
    if (properties.showPlayerController?.value !== undefined) {
      setShowPlayerController(properties.showPlayerController.value as boolean);
    }
    if (properties.showAlbumCover?.value !== undefined) {
      setShowAlbumCover(properties.showAlbumCover.value as boolean);
    }
    if (properties.controllerSize?.value !== undefined) {
      const v = Number(properties.controllerSize.value);
      if (isFinite(v) && v > 0) {
        // 限制在安全范围 0.5x ~ 3x，避免输入异常值导致布局错乱
        setControllerScale(Math.min(Math.max(v, 0.5), 3.0));
      }
    }
    if (properties.controllerX?.value !== undefined) {
      setControllerX(properties.controllerX.value as number);
    }
    if (properties.controllerY?.value !== undefined) {
      setControllerY(properties.controllerY.value as number);
    }
    if (properties.audioIntensity?.value !== undefined) {
      setAudioIntensity(properties.audioIntensity.value as number);
    }
    if (properties.responseRange?.value !== undefined) {
      setResponseRange(properties.responseRange.value as number);
    }
    if (properties.gridSize?.value !== undefined) {
      setGridSize(properties.gridSize.value as number);
    }
    if (properties.meteorClickEnabled?.value !== undefined) {
      setMeteorClickEnabled(properties.meteorClickEnabled.value as boolean);
    }
    if (properties.peakColorEnabled?.value !== undefined) {
      setPeakColorEnabled(properties.peakColorEnabled.value as boolean);
    }
    if (properties.peakColorIntensity?.value !== undefined) {
      setPeakColorIntensity(properties.peakColorIntensity.value as number);
    }
    if (properties.themeCycleInterval?.value !== undefined) {
      setThemeCycleInterval(properties.themeCycleInterval.value as number);
    }
    /* 时钟属性 */
    if (properties.showClock?.value !== undefined) {
      setShowClock(properties.showClock.value as boolean);
    }
    if (properties.clockPosX?.value !== undefined) {
      setClockPosX(properties.clockPosX.value as number);
    }
    if (properties.clockPosY?.value !== undefined) {
      setClockPosY(properties.clockPosY.value as number);
    }
    if (properties.clockSize?.value !== undefined) {
      setClockSize(properties.clockSize.value as number);
    }
    if (properties.clock24Hour?.value !== undefined) {
      setClock24Hour(properties.clock24Hour.value as boolean);
    }
    /* 天气属性 */
    if (properties.weatherEnabled?.value !== undefined) {
      setWeatherEnabled(properties.weatherEnabled.value as boolean);
    }
    if (properties.weatherCity?.value !== undefined) {
      setWeatherCity(String(properties.weatherCity.value).trim());
    }
  }, []);

  /* 主题轮询过渡 - 低频定时器驱动（1秒更新一次，避免独立 rAF 与 demand 模式冲突） */
  useEffect(() => {
    if (themeMode !== 'cycle') return;
    
    cycleStartRef.current = performance.now();
    
    const tick = () => {
      const elapsed = (performance.now() - cycleStartRef.current) / 1000;
      const progress = elapsed / themeCycleInterval;
      
      if (progress >= 1) {
        currentThemeIndexRef.current = (currentThemeIndexRef.current + 1) % themeIds.length;
        cycleStartRef.current = performance.now();
        setCycleProgress(0);
      } else {
        setCycleProgress(progress);
      }
    };
    
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [themeMode, themeCycleInterval]);

  /* 注册 Wallpaper Engine 核心回调 */
  useEffect(() => {
    const w = window as any;
    if (w.wallpaperRegisterAudioListener) {
      w.wallpaperRegisterAudioListener((audioData: number[]) => {
        engine.setWallpaperAudioData(audioData);
      });
    }
    // 注册属性回调，后续属性变更直接应用
    _applyProps = handleProperties;
    _applyGeneralProps = (props: GeneralProperties) => {
      if (props.fps !== undefined) {
        setFpsLimit(props.fps);
      }
    };
    // 应用启动时缓存的属性
    if (_pendingProps) {
      handleProperties(_pendingProps);
      _pendingProps = null;
    }
    if (_pendingGeneralProps) {
      if (_pendingGeneralProps.fps !== undefined) {
        setFpsLimit(_pendingGeneralProps.fps);
      }
      _pendingGeneralProps = null;
    }
    if (w.wallpaperReady) {
      w.wallpaperReady();
    }
    return () => {
      _applyProps = null;
      _applyGeneralProps = null;
    };
  }, [handleProperties]);

  /* 空闲波浪检测 */
  const [isIdle, setIsIdle] = useState(true);
  const idleStartRef = useRef<number>(Infinity);
  const idleActiveRef = useRef(false);
  const ENERGY_THRESHOLD = 0.05;
  const IDLE_DELAY_MS = 3000;

  useEffect(() => {
    const interval = setInterval(() => {
      const data = engine.getAudioData();
      const now = performance.now();
      if (data.energy > ENERGY_THRESHOLD) {
        setIsIdle(false);
        idleActiveRef.current = false;
        idleStartRef.current = Infinity;
      } else if (idleStartRef.current === Infinity) {
        idleStartRef.current = now + IDLE_DELAY_MS;
      } else if (now >= idleStartRef.current) {
        setIsIdle(true);
        idleActiveRef.current = true;
      }
    }, 300);
    return () => clearInterval(interval);
  }, []);

  /* 播放器可见性：有媒体内容且非空闲时显示，播放开始后延迟1秒淡入 */
  const hasMedia = !!(mediaTitle || mediaArtist || mediaThumbnail);
  const [showPlayerTimeout, setShowPlayerTimeout] = useState(false);
  const [showPlayerActual, setShowPlayerActual] = useState(false);

  useEffect(() => {
    if (isMediaPlaying && hasMedia) {
      const timer = setTimeout(() => setShowPlayerTimeout(true), 1000);
      return () => clearTimeout(timer);
    }
    setShowPlayerTimeout(false);
  }, [isMediaPlaying, hasMedia]);

  useEffect(() => {
    if (!showPlayerController) {
      setShowPlayerActual(false);
      return;
    }
    if (showPlayerTimeout) {
      setShowPlayerActual(true);
      return;
    }
    setShowPlayerActual(!isIdle && hasMedia);
  }, [showPlayerTimeout, isIdle, hasMedia, showPlayerController]);

  /* 格式化时间 */
  const formatTime = (time: number) => {
    if (!time || isNaN(time)) return '0:00';
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  /* 根元素点击 - 空闲模式下触发流星 */
  const handleRootClick = useCallback((e: React.MouseEvent) => {
    if (isIdle && meteorClickEnabled && mapSceneRef.current) {
      mapSceneRef.current.triggerMeteorAt(e.clientX, e.clientY);
    }
  }, [isIdle, meteorClickEnabled]);

  /* 媒体播放时间进度跟踪 */
  const timelineRef = useRef({ position: 0, time: 0 });
  const [displayedTime, setDisplayedTime] = useState(0);

  useEffect(() => {
    if (mediaDuration > 0) {
      timelineRef.current = { position: mediaPosition, time: performance.now() };
      setDisplayedTime(mediaPosition);
    } else {
      setDisplayedTime(0);
    }
  }, [mediaPosition, mediaDuration]);

  useEffect(() => {
    if (!isMediaPlaying || mediaDuration <= 0) return;
    const tick = () => {
      const elapsed = (performance.now() - timelineRef.current.time) / 1000;
      setDisplayedTime(Math.min(timelineRef.current.position + elapsed, mediaDuration));
    };
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [isMediaPlaying, mediaDuration]);

  /* 时钟：1s 更新一次，含秒、日期，支持 12/24 小时制 */
  useEffect(() => {
    const update = () => {
      const d = new Date();
      let h = d.getHours();
      let suffix = '';
      if (!clock24Hour) {
        suffix = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
      }
      const main = String(h).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
      setClockText((prev) => (prev === main ? prev : main));
      setClockSuffix((prev) => (prev === suffix ? prev : suffix));
      const dateStr = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEKDAYS[d.getDay()];
      setDateText((prev) => (prev === dateStr ? prev : dateStr));
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [clock24Hour]);

  /* 天气：立即获取 + 每 15 分钟刷新；城市变化时重新获取 */
  useEffect(() => {
    if (!weatherEnabled) {
      setWeatherData(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const w = await fetchWeather(weatherCity);
      if (!cancelled) setWeatherData(w);
    };
    load();
    const iv = setInterval(load, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [weatherEnabled, weatherCity]);

  /* 播放器尺寸配置：以原 "large" 档为基准，按比例缩放（controllerScale = 1.0 即原大号） */
  const sizes = {
    width: 420 * controllerScale,
    cover: 110 * controllerScale,
    padding: 20 * controllerScale,
    gap: 18 * controllerScale,
    title: 18 * controllerScale,
    artist: 13.5 * controllerScale,
    progressHeight: 5 * controllerScale,
    timeText: 11 * controllerScale,
  };

  return (
    <div className="w-screen h-screen overflow-hidden" style={{ backgroundColor: bgColor }} onClick={handleRootClick}>
      <div className="absolute inset-0 z-0">
        <Canvas
          camera={{ position: [35, 25, 35], fov: 45 }}
          frameloop="demand"
          // 限制 DPR 上限，避免高分屏超采样浪费像素填充（原生分辨率渲染，画面不变）
          dpr={[1, 1.5]}
        >
          <FPSLimiter fpsLimit={fpsLimit} />
          <MapScene
            ref={mapSceneRef}
            theme={currentTheme}
            audioIntensity={audioIntensity}
            responseRange={responseRange}
            gridSize={gridSize}
            idleWaveEnabled={idleWaveEnabled}
            cameraDistance={cameraDistance}
            cameraAngleX={cameraAngleX}
            cameraAngleY={cameraAngleY}
            autoRotateEnabled={autoRotateEnabled}
            autoRotateSpeed={autoRotateSpeed}
            peakColorEnabled={peakColorEnabled}
            peakColorIntensity={peakColorIntensity}
          />
        </Canvas>
      </div>

      {/* 播放器控制器 */}
      {showPlayerController && (
        <div
          className="absolute z-50 select-none"
          style={{
            top: `${controllerY}vh`,
            right: `${controllerX}vw`,
            opacity: showPlayerActual ? 1 : 0,
            transform: showPlayerActual
              ? 'scale(1) translateY(0px)'
              : 'scale(0.92) translateY(-8px)',
            transformOrigin: 'top right',
            pointerEvents: showPlayerActual ? 'auto' : 'none',
            transition: 'opacity 600ms cubic-bezier(0.4, 0, 0.2, 1), transform 600ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div
            style={{
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: showPlayerActual ? 'blur(24px) saturate(1.4)' : 'none',
              WebkitBackdropFilter: showPlayerActual ? 'blur(24px) saturate(1.4)' : 'none',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '18px',
              boxShadow: '0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
              width: `${sizes.width}px`,
            }}
          >
            <div style={{ display: 'flex', gap: `${sizes.gap}px`, padding: `${sizes.padding}px`, alignItems: 'center' }}>
              {/* 专辑封面 */}
              <AnimatePresence mode="popLayout">
                {showAlbumCover && mediaThumbnail ? (
                  <motion.div
                    key={mediaThumbnail}
                    className="flex-shrink-0 relative"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] } }}
                    transition={{ duration: 1.0, delay: 0.15, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        inset: '-4px',
                        borderRadius: '15px',
                        background: `linear-gradient(140deg, ${accentColor}35, transparent 55%, ${accentColor}18)`,
                        filter: 'blur(5px)',
                      }}
                    />
                    <img
                      src={mediaThumbnail}
                      alt=""
                      className="block rounded-[13px] object-cover relative"
                      style={{
                        width: `${sizes.cover}px`,
                        height: `${sizes.cover}px`,
                        boxShadow: '0 6px 24px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)',
                      }}
                    />
                    <div
                      className="absolute inset-0 rounded-[13px] pointer-events-none"
                      style={{
                        background: 'linear-gradient(145deg, rgba(255,255,255,0.06) 0%, transparent 50%, rgba(0,0,0,0.25) 100%)',
                      }}
                    />
                    <div
                      className="absolute inset-0 rounded-[13px] pointer-events-none"
                      style={{
                        background: 'linear-gradient(to top, rgba(0,0,0,0.35) 0%, transparent 50%)',
                        mixBlendMode: 'multiply',
                      }}
                    />
                  </motion.div>
                ) : (
                  <div className="flex-shrink-0" style={{ width: `${sizes.cover}px`, height: `${sizes.cover}px` }} />
                )}
              </AnimatePresence>

              {/* 歌曲信息 + 进度条 */}
              <div className="flex-1 min-w-0 flex flex-col justify-center" style={{ gap: mediaDuration > 0 ? '8px' : '0' }}>
                <div>
                  <AnimatePresence mode="popLayout">
                    <motion.div
                      key={mediaTitle || 'empty'}
                      className="truncate leading-snug"
                      style={{
                        fontSize: `${sizes.title}px`,
                        color: 'rgba(255,255,255,0.90)',
                        letterSpacing: '0.015em',
                        fontWeight: 450,
                      }}
                      title={mediaTitle}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10, transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] } }}
                      transition={{ duration: 1.0, delay: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    >
                      {mediaTitle || '--'}
                    </motion.div>
                  </AnimatePresence>
                  <AnimatePresence mode="popLayout">
                    <motion.div
                      key={mediaArtist || 'empty'}
                      className="truncate leading-snug"
                      style={{
                        fontSize: `${sizes.artist}px`,
                        color: 'rgba(255,255,255,0.28)',
                        marginTop: '3px',
                        letterSpacing: '0.01em',
                      }}
                      title={mediaArtist}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10, transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] } }}
                      transition={{ duration: 1.0, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    >
                      {mediaArtist || '--'}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* 进度条 + 时间 */}
                {mediaDuration > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        flex: 1,
                        height: `${sizes.progressHeight}px`,
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        borderRadius: '999px',
                        overflow: 'visible',
                        position: 'relative',
                        boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.2)',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          borderRadius: '999px',
                          width: `${Math.min((displayedTime / mediaDuration) * 100, 100)}%`,
                          background: `linear-gradient(90deg, ${accentColor}dd, ${accentColor})`,
                          boxShadow: `0 0 10px ${accentColor}44, 0 0 20px ${accentColor}12`,
                          transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            right: '-3px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: `${Math.max(5, sizes.progressHeight + 2)}px`,
                            height: `${Math.max(5, sizes.progressHeight + 2)}px`,
                            borderRadius: '999px',
                            backgroundColor: accentColor,
                            boxShadow: `0 0 8px ${accentColor}88, 0 0 16px ${accentColor}44`,
                            opacity: 0.9,
                          }}
                        />
                      </div>
                    </div>
                    <div
                      style={{
                        flexShrink: 0,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                        color: 'rgba(255,255,255,0.30)',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: `${sizes.timeText}px`,
                        minWidth: `${50 * controllerScale}px`,
                        textAlign: 'right',
                        lineHeight: 1,
                        letterSpacing: '0.03em',
                      }}
                    >
                      {formatTime(displayedTime)}/{formatTime(mediaDuration)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 时钟模块：可自定义位置/大小/12-24制，颜色随壁纸主题（accentColor）变化，Win11 Segoe UI Variable 字体 */}
      {showClock && clockText && (
        <div
          className="absolute z-30 select-none"
          style={{
            left: clockPosX + '%',
            top: clockPosY + '%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: "'Segoe UI Variable Display','Segoe UI Variable Text','Segoe UI',system-ui,sans-serif",
              fontWeight: 600,
              fontSize: clockSize,
              lineHeight: 1,
              color: accentColor,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
              textShadow: '0 2px 14px rgba(0,0,0,0.65), 0 0 3px rgba(0,0,0,0.45)',
              whiteSpace: 'nowrap',
            }}
          >
            {clockText}
            {clockSuffix && (
              <span
                style={{
                  fontSize: clockSize * 0.32,
                  fontWeight: 500,
                  opacity: 0.8,
                  marginLeft: clockSize * 0.1,
                  letterSpacing: '0.1em',
                  verticalAlign: '0.6em',
                }}
              >
                {clockSuffix}
              </span>
            )}
          </div>
          {/* 日期 */}
          {dateText && (
            <div
              style={{
                marginTop: Math.max(6, clockSize * 0.12),
                fontFamily: "'Segoe UI Variable','Segoe UI','Microsoft YaHei UI',sans-serif",
                fontWeight: 400,
                fontSize: clockSize * 0.24,
                lineHeight: 1.2,
                color: 'rgba(255,255,255,0.75)',
                letterSpacing: '0.06em',
                textShadow: '0 1px 8px rgba(0,0,0,0.7)',
                whiteSpace: 'nowrap',
              }}
            >
              {dateText}
            </div>
          )}
          {/* 实时天气 */}
          {weatherEnabled && weatherData && (
            <div
              style={{
                marginTop: Math.max(4, clockSize * 0.08),
                fontFamily: "'Segoe UI Variable','Segoe UI','Microsoft YaHei UI',sans-serif",
                fontWeight: 500,
                fontSize: clockSize * 0.2,
                lineHeight: 1.2,
                color: accentColor,
                letterSpacing: '0.04em',
                textShadow: '0 1px 8px rgba(0,0,0,0.7)',
                whiteSpace: 'nowrap',
              }}
            >
              {weatherData.icon} {weatherData.desc} {Math.round(weatherData.temp)}°C
              {weatherData.city ? ' · ' + weatherData.city : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WallpaperApp />
  </StrictMode>,
);
