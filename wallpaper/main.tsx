import { StrictMode, useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { MapScene } from '../src/components/AudioVisualizer/MapScene';
import { themes } from '../src/lib/themes';
import { engine } from '../src/lib/AudioEngine';
import '../src/index.css';

/* Wallpaper Engine 属性监听回调的 properties 对象结构 */
interface PropertyValue {
  value: string | number | boolean;
}

interface WallpaperProperties {
  theme?: PropertyValue;
  audioIntensity?: PropertyValue;
  responseRange?: PropertyValue;
  gridSize?: PropertyValue;
  idleWaveEnabled?: PropertyValue;
  idleWaveDebounce?: PropertyValue;
  idleWaveFadeDuration?: PropertyValue;
  autoRotateSpeed?: PropertyValue;
  cameraDistance?: PropertyValue;
  cameraAngleX?: PropertyValue;
  cameraAngleY?: PropertyValue;
  pulseEnabled?: PropertyValue;
  pulseSensitivity?: PropertyValue;
  pulseCooldown?: PropertyValue;
  meteorEnabled?: PropertyValue;
  meteorSensitivity?: PropertyValue;
  meteorCooldown?: PropertyValue;
  meteorClickEnabled?: PropertyValue;
  showPlayerController?: PropertyValue;
  showAlbumCover?: PropertyValue;
  controllerSize?: PropertyValue;
}

function WallpaperApp() {
  const defaultCameraDistance = 85;

  const [themeName, setThemeName] = useState('nocturnal');
  const [autoRotateSpeed, setAutoRotateSpeed] = useState(0);
  const [cameraDistance, setCameraDistance] = useState(defaultCameraDistance);
  const [cameraAngleX, setCameraAngleX] = useState(120);
  const [cameraAngleY, setCameraAngleY] = useState(25);
  const [idleWaveEnabled, setIdleWaveEnabled] = useState(true);
  const [showPlayerController, setShowPlayerController] = useState(true);
  const [showAlbumCover, setShowAlbumCover] = useState(true);
  const [controllerSize, setControllerSize] = useState<'small' | 'medium' | 'large'>('large');
  const [audioIntensity, setAudioIntensity] = useState(1);
  const [responseRange, setResponseRange] = useState(1);
  const [gridSize, setGridSize] = useState(160);
  const [meteorClickEnabled, setMeteorClickEnabled] = useState(true);
  const mapSceneRef = useRef<any>(null);

  /* Wallpaper Engine Media Integration 状态 */
  const [mediaTitle, setMediaTitle] = useState('');
  const [mediaArtist, setMediaArtist] = useState('');
  const [mediaThumbnail, setMediaThumbnail] = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [textColor, setTextColor] = useState('');
  const [isMediaPlaying, setIsMediaPlaying] = useState(false);
  const [mediaPosition, setMediaPosition] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);

  const t = themes[themeName] || themes['nocturnal'];
  const bgColor = `#${t.uBaseColor1.getHexString()}`;
  const accentColor = `#${t.uRippleColor.getHexString()}`;

  /* applyUserProperties 回调 - Wallpaper Engine 配置项变更 */
  const handleProperties = useCallback((properties: WallpaperProperties) => {
    if (properties.theme?.value) {
      setThemeName(properties.theme.value as string);
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
    if (properties.autoRotateSpeed?.value !== undefined) {
      setAutoRotateSpeed(properties.autoRotateSpeed.value as number);
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
      setControllerSize(properties.controllerSize.value as 'small' | 'medium' | 'large');
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
  }, []);

  /* 注册 Wallpaper Engine 核心回调 */
  useEffect(() => {
    const w = window as any;
    if (w.wallpaperRegisterAudioListener) {
      w.wallpaperRegisterAudioListener((audioData: number[]) => {
        engine.setWallpaperAudioData(audioData);
      });
    }
    w.wallpaperPropertyListener = { applyUserProperties: handleProperties };
    if (w.wallpaperReady) {
      w.wallpaperReady();
    }
  }, [handleProperties]);

  /* 注册 Wallpaper Engine Media Integration 回调 */
  useEffect(() => {
    const w = window as any;
    if (w.wallpaperRegisterMediaPropertiesListener) {
      w.wallpaperRegisterMediaPropertiesListener((props: any) => {
        setMediaTitle(props.title || '');
        setMediaArtist(props.artist || '');
      });
    }
    if (w.wallpaperRegisterMediaThumbnailListener) {
      w.wallpaperRegisterMediaThumbnailListener((thumb: any) => {
        setMediaThumbnail(thumb.thumbnail || '');
        setPrimaryColor(thumb.primaryColor || '');
        setTextColor(thumb.textColor || '');
      });
    }
    if (w.wallpaperRegisterMediaPlaybackListener) {
      w.wallpaperRegisterMediaPlaybackListener((pb: any) => {
        const PLAYING = (w.wallpaperMediaIntegration?.PLAYBACK_PLAYING) || 0;
        setIsMediaPlaying(pb.state === PLAYING);
      });
    }
    if (w.wallpaperRegisterMediaTimelineListener) {
      w.wallpaperRegisterMediaTimelineListener((tl: any) => {
        setMediaPosition(tl.position || 0);
        setMediaDuration(tl.duration || 0);
      });
    }
  }, []);

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

  /* 播放器尺寸配置 */
  const sizes = {
    small: { width: 300, cover: 76, padding: 14, gap: 12, title: 14, artist: 11, progressHeight: 4, timeText: 9.5 },
    medium: { width: 360, cover: 92, padding: 16, gap: 14, title: 15.5, artist: 12, progressHeight: 4.5, timeText: 10 },
    large: { width: 420, cover: 110, padding: 20, gap: 18, title: 18, artist: 13.5, progressHeight: 5, timeText: 11 },
  }[controllerSize];

  return (
    <div className="w-screen h-screen overflow-hidden" style={{ backgroundColor: bgColor }} onClick={handleRootClick}>
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [35, 25, 35], fov: 45 }}>
          <MapScene
            ref={mapSceneRef}
            theme={themeName}
            audioIntensity={audioIntensity}
            responseRange={responseRange}
            gridSize={gridSize}
            idleWaveEnabled={idleWaveEnabled}
            autoRotateSpeed={autoRotateSpeed}
            cameraDistance={cameraDistance}
            cameraAngleX={cameraAngleX}
            cameraAngleY={cameraAngleY}
          />
        </Canvas>
      </div>

      {/* 播放器控制器 */}
      {showPlayerController && (
        <div
          className="absolute top-[28px] right-[28px] z-50 select-none"
          style={{
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
              backdropFilter: 'blur(24px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
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
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        color: 'rgba(255,255,255,0.30)',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: `${sizes.timeText}px`,
                        minWidth: '50px',
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
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WallpaperApp />
  </StrictMode>,
);
