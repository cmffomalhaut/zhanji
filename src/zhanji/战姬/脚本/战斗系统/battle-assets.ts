export interface CharacterAsset { url: string; name: string }
export interface BackgroundAsset { url: string; name: string; keywords: string[] }

const QUIET_NATURES = ['孤僻', '内敛', '稳重', '冷静', '胆小', '慎重', '害羞', '悠闲', '温和'];

const ALL_PORTRAITS: CharacterAsset[] = [
  { url: 'https://s3.bmp.ovh/2026/05/12/6UBM1tjR.png', name: '金发活泼少女芭蕾舞者' },

  { url: 'https://s3.bmp.ovh/2026/05/12/XbFydqLd.png', name: '黑发冷静武士少女' },
  { url: 'https://s3.bmp.ovh/2026/05/12/CSRCzu5R.png', name: '黑发马尾眼镜温柔少女班长' },
  { url: 'https://s3.bmp.ovh/2026/05/12/9BKwRzwE.png', name: '粉发活泼jk' },
  { url: 'https://s3.bmp.ovh/2026/05/12/gxCWFAu0.png', name: '粉发傲娇魔法少女' },
  { url: 'https://s3.bmp.ovh/2026/05/12/jpw6FD2s.png', name: '黑发毒舌文学少女' },

];

const NAMED_PORTRAITS: Record<string, string> = {
  '银发冷淡御姐女仆': 'https://s3.bmp.ovh/2026/05/12/ZLHwrPKq.png',
};

const BACKGROUNDS: BackgroundAsset[] = [
  { url: 'https://s3.bmp.ovh/2026/05/12/XlzT9Wix.jpg', name: '暗夜森林', keywords: ['森林', '野外', '林地', '树', '暗', '夜'] },
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

const _portraitCache = new Map<string, string>();
let _shuffledPool: string[] = [];

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function resetPortraitPool(): void {
  _shuffledPool = shuffleArray(ALL_PORTRAITS.map(p => p.url));
  _portraitCache.clear();
}

function drawFromPool(): string {
  if (_shuffledPool.length === 0) {
    _shuffledPool = shuffleArray(ALL_PORTRAITS.map(p => p.url));
  }
  return _shuffledPool.pop()!;
}

export function getPortraitUrl(charName: string, nature?: string, _side?: 'ally' | 'enemy'): string {
  const key = `${charName}|${_side ?? ''}`;
  if (_portraitCache.has(key)) return _portraitCache.get(key)!;

  if (NAMED_PORTRAITS[charName]) {
    _portraitCache.set(key, NAMED_PORTRAITS[charName]);
    return NAMED_PORTRAITS[charName];
  }

  const url = drawFromPool();
  _portraitCache.set(key, url);
  return url;
}

export function getBackgroundUrl(location?: string): string {
  if (location) {
    for (const bg of BACKGROUNDS) {
      if (bg.keywords.some(kw => location.includes(kw))) return bg.url;
    }
  }
  const idx = BACKGROUNDS.length > 0 ? Math.floor(Math.random() * BACKGROUNDS.length) : 0;
  return BACKGROUNDS[Math.abs(idx)]?.url ?? '';
}
