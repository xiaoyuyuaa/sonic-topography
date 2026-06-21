import * as THREE from 'three';

export interface ThemeColors {
  name: string;
  id: string;
  uBaseColor1: THREE.Color;
  uBaseColor2: THREE.Color;
  uCoolCore: THREE.Color;
  uCoolEdge: THREE.Color;
  uWarmCore: THREE.Color;
  uWarmEdge: THREE.Color;
  uRippleColor: THREE.Color;
  uPeakColor: THREE.Color; // 中间凸起峰值颜色
  uGlowIntensity: number;
}

/* 主题ID列表，用于轮询 */
export const themeIds = [
  'nocturnal',
  'ocean-deep',
  'arctic-aurora',
  'cyber-forest',
  'golden-hour',
  'ember-fire',
  'crimson-sunset',
  'coral-mirage',
  'neon-tokyo',
  'minimal-monochrome',
] as const;

export type ThemeId = typeof themeIds[number];

/* 混合两个主题，t 为 0-1 之间的插值因子 */
export function lerpThemes(theme1: ThemeColors, theme2: ThemeColors, t: number): ThemeColors {
  const clampedT = Math.max(0, Math.min(1, t));
  return {
    name: clampedT < 0.5 ? theme1.name : theme2.name,
    id: clampedT < 0.5 ? theme1.id : theme2.id,
    uBaseColor1: new THREE.Color().lerpColors(theme1.uBaseColor1, theme2.uBaseColor1, clampedT),
    uBaseColor2: new THREE.Color().lerpColors(theme1.uBaseColor2, theme2.uBaseColor2, clampedT),
    uCoolCore: new THREE.Color().lerpColors(theme1.uCoolCore, theme2.uCoolCore, clampedT),
    uCoolEdge: new THREE.Color().lerpColors(theme1.uCoolEdge, theme2.uCoolEdge, clampedT),
    uWarmCore: new THREE.Color().lerpColors(theme1.uWarmCore, theme2.uWarmCore, clampedT),
    uWarmEdge: new THREE.Color().lerpColors(theme1.uWarmEdge, theme2.uWarmEdge, clampedT),
    uRippleColor: new THREE.Color().lerpColors(theme1.uRippleColor, theme2.uRippleColor, clampedT),
    uPeakColor: new THREE.Color().lerpColors(theme1.uPeakColor, theme2.uPeakColor, clampedT),
    uGlowIntensity: THREE.MathUtils.lerp(theme1.uGlowIntensity, theme2.uGlowIntensity, clampedT),
  };
}

export const themes: Record<string, ThemeColors> = {
  // === 1. 靛蓝紫 (Indigo Violet) ===
  'nocturnal': {
    name: 'Nocturnal',
    id: 'nocturnal',
    uBaseColor1: new THREE.Color(0.005, 0.008, 0.025),
    uBaseColor2: new THREE.Color(0.015, 0.025, 0.07),
    uCoolCore: new THREE.Color(0.35, 0.1, 0.9),     // 紫罗兰
    uCoolEdge: new THREE.Color(0.15, 0.0, 0.45),     // 深靛紫
    uWarmCore: new THREE.Color(0.65, 0.25, 1.0),     // 亮紫
    uWarmEdge: new THREE.Color(0.5, 0.1, 0.8),       // 中紫
    uRippleColor: new THREE.Color(0.5, 0.2, 1.0),
    uPeakColor: new THREE.Color(1.0, 0.55, 0.05),    // 亮橙色 - 互补色
    uGlowIntensity: 1.0,
  },
  // === 2. 深海蓝 (Deep Ocean Blue) ===
  'ocean-deep': {
    name: 'Ocean Deep',
    id: 'ocean-deep',
    uBaseColor1: new THREE.Color(0.002, 0.008, 0.028),
    uBaseColor2: new THREE.Color(0.005, 0.018, 0.06),
    uCoolCore: new THREE.Color(0.0, 0.25, 1.0),      // 皇家蓝
    uCoolEdge: new THREE.Color(0.0, 0.08, 0.35),      // 深渊蓝
    uWarmCore: new THREE.Color(0.15, 0.55, 1.0),      // 天蓝
    uWarmEdge: new THREE.Color(0.05, 0.35, 0.85),     // 中蓝
    uRippleColor: new THREE.Color(0.1, 0.5, 1.0),
    uPeakColor: new THREE.Color(1.0, 0.75, 0.1),      // 金黄色 - 暖色对比
    uGlowIntensity: 1.1,
  },
  // === 3. 冰蓝 (Arctic Cyan) ===
  'arctic-aurora': {
    name: 'Arctic Aurora',
    id: 'arctic-aurora',
    uBaseColor1: new THREE.Color(0.003, 0.015, 0.022),
    uBaseColor2: new THREE.Color(0.01, 0.03, 0.055),
    uCoolCore: new THREE.Color(0.0, 0.75, 0.85),     // 青绿
    uCoolEdge: new THREE.Color(0.0, 0.3, 0.5),        // 冰蓝
    uWarmCore: new THREE.Color(0.2, 1.0, 0.85),       // 亮青
    uWarmEdge: new THREE.Color(0.05, 0.6, 0.6),       // 绿松
    uRippleColor: new THREE.Color(0.1, 0.9, 0.9),
    uPeakColor: new THREE.Color(1.0, 0.25, 0.35),     // 珊瑚红 - 互补色
    uGlowIntensity: 1.25,
  },
  // === 4. 翡翠绿 (Emerald Green) ===
  'cyber-forest': {
    name: 'Cyber Forest',
    id: 'cyber-forest',
    uBaseColor1: new THREE.Color(0.003, 0.018, 0.005),
    uBaseColor2: new THREE.Color(0.01, 0.045, 0.018),
    uCoolCore: new THREE.Color(0.0, 0.85, 0.35),     // 翡翠绿
    uCoolEdge: new THREE.Color(0.0, 0.35, 0.15),      // 墨绿
    uWarmCore: new THREE.Color(0.4, 1.0, 0.3),        // 亮绿
    uWarmEdge: new THREE.Color(0.15, 0.65, 0.2),      // 草绿
    uRippleColor: new THREE.Color(0.3, 1.0, 0.4),
    uPeakColor: new THREE.Color(1.0, 0.2, 0.5),       // 品红色 - 互补色
    uGlowIntensity: 1.3,
  },
  // === 5. 暖金黄 (Warm Gold) ===
  'golden-hour': {
    name: 'Golden Hour',
    id: 'golden-hour',
    uBaseColor1: new THREE.Color(0.018, 0.015, 0.005),
    uBaseColor2: new THREE.Color(0.045, 0.035, 0.012),
    uCoolCore: new THREE.Color(0.85, 0.6, 0.05),      // 古铜
    uCoolEdge: new THREE.Color(0.5, 0.3, 0.02),        // 深褐
    uWarmCore: new THREE.Color(1.0, 0.92, 0.35),       // 亮金
    uWarmEdge: new THREE.Color(0.85, 0.7, 0.15),       // 暖金
    uRippleColor: new THREE.Color(1.0, 0.85, 0.25),
    uPeakColor: new THREE.Color(0.2, 0.5, 1.0),        // 宝蓝色 - 冷色对比
    uGlowIntensity: 1.2,
  },
  // === 6. 琥珀橙 (Amber Orange) ===
  'ember-fire': {
    name: 'Ember Fire',
    id: 'ember-fire',
    uBaseColor1: new THREE.Color(0.022, 0.008, 0.002),
    uBaseColor2: new THREE.Color(0.05, 0.018, 0.005),
    uCoolCore: new THREE.Color(1.0, 0.45, 0.0),      // 橙
    uCoolEdge: new THREE.Color(0.6, 0.15, 0.0),       // 焦橙
    uWarmCore: new THREE.Color(1.0, 0.78, 0.15),      // 琥珀
    uWarmEdge: new THREE.Color(0.9, 0.55, 0.05),      // 深琥珀
    uRippleColor: new THREE.Color(1.0, 0.65, 0.1),
    uPeakColor: new THREE.Color(0.1, 0.4, 1.0),        // 深蓝色 - 互补色
    uGlowIntensity: 1.5,
  },
  // === 7. 血红 (Crimson Red) ===
  'crimson-sunset': {
    name: 'Crimson Sunset',
    id: 'crimson-sunset',
    uBaseColor1: new THREE.Color(0.025, 0.003, 0.005),
    uBaseColor2: new THREE.Color(0.055, 0.01, 0.015),
    uCoolCore: new THREE.Color(1.0, 0.05, 0.08),      // 正红
    uCoolEdge: new THREE.Color(0.65, 0.0, 0.06),       // 暗红
    uWarmCore: new THREE.Color(1.0, 0.35, 0.2),        // 亮红
    uWarmEdge: new THREE.Color(0.85, 0.12, 0.1),       // 中红
    uRippleColor: new THREE.Color(1.0, 0.15, 0.1),
    uPeakColor: new THREE.Color(0.1, 0.9, 0.7),        // 青绿色 - 互补色
    uGlowIntensity: 1.4,
  },
  // === 8. 珊瑚粉 (Coral Pink) ===
  'coral-mirage': {
    name: 'Coral Mirage',
    id: 'coral-mirage',
    uBaseColor1: new THREE.Color(0.02, 0.006, 0.01),
    uBaseColor2: new THREE.Color(0.045, 0.015, 0.022),
    uCoolCore: new THREE.Color(1.0, 0.25, 0.3),       // 珊瑚红
    uCoolEdge: new THREE.Color(0.7, 0.08, 0.18),       // 深珊瑚
    uWarmCore: new THREE.Color(1.0, 0.55, 0.55),       // 粉红
    uWarmEdge: new THREE.Color(0.9, 0.3, 0.35),        // 中珊瑚
    uRippleColor: new THREE.Color(1.0, 0.4, 0.4),
    uPeakColor: new THREE.Color(0.1, 0.7, 1.0),        // 天蓝色 - 冷色对比
    uGlowIntensity: 1.3,
  },
  // === 9. 霓虹紫粉 (Neon Magenta) ===
  'neon-tokyo': {
    name: 'Neon Tokyo',
    id: 'neon-tokyo',
    uBaseColor1: new THREE.Color(0.01, 0.002, 0.025),
    uBaseColor2: new THREE.Color(0.03, 0.008, 0.065),
    uCoolCore: new THREE.Color(1.0, 0.05, 0.6),       // 霓虹粉
    uCoolEdge: new THREE.Color(0.55, 0.02, 0.85),      // 紫外光
    uWarmCore: new THREE.Color(1.0, 0.25, 0.85),       // 亮紫粉
    uWarmEdge: new THREE.Color(0.8, 0.1, 0.7),         // 中紫粉
    uRippleColor: new THREE.Color(1.0, 0.2, 0.75),
    uPeakColor: new THREE.Color(0.95, 1.0, 0.15),      // 荧光黄绿 - 互补色
    uGlowIntensity: 1.6,
  },
  // === 10. 极简黑白 (Greyscale) ===
  'minimal-monochrome': {
    name: 'Minimal Monochrome',
    id: 'minimal-monochrome',
    uBaseColor1: new THREE.Color(0.012, 0.012, 0.012),
    uBaseColor2: new THREE.Color(0.045, 0.045, 0.045),
    uCoolCore: new THREE.Color(0.8, 0.8, 0.8),
    uCoolEdge: new THREE.Color(0.3, 0.3, 0.3),
    uWarmCore: new THREE.Color(1.0, 1.0, 1.0),
    uWarmEdge: new THREE.Color(0.6, 0.6, 0.6),
    uRippleColor: new THREE.Color(1.0, 1.0, 1.0),
    uPeakColor: new THREE.Color(1.0, 1.0, 1.0),        // 纯白
    uGlowIntensity: 0.7,
  },
};
