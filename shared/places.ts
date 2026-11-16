// The ten places, in their fixed order. Chinese strings here are zh locale content.
export type Locale = 'zh' | 'en';
export type PlaceId = 'lingyin' | 'shaolin' | 'yonghe' | 'jokhang' | 'puji' | 'zixiao' | 'qufu' | 'meizhou' | 'guandi' | 'hongluo';
export interface Place { id: PlaceId; vessel: 'candle' | 'lamp'; name: Record<Locale, string>; where: Record<Locale, string>; line: Record<Locale, string> }

export const PLACES: Place[] = [
  { id: 'lingyin', vessel: 'candle', name: { zh: '灵隐寺', en: 'Lingyin Temple' }, where: { zh: '杭州', en: 'Hangzhou' }, line: { zh: '山色很静，心里的话可以慢慢说。', en: 'The hills are quiet; say it slowly.' } },
  { id: 'shaolin', vessel: 'candle', name: { zh: '少林寺', en: 'Shaolin Temple' }, where: { zh: '登封 · 嵩山', en: 'Dengfeng · Songshan' }, line: { zh: '留一段时间，给想做好的事。', en: 'Give some time to what you want to do well.' } },
  { id: 'yonghe', vessel: 'candle', name: { zh: '雍和宫', en: 'Yonghe Temple' }, where: { zh: '北京', en: 'Beijing' }, line: { zh: '热闹留在门外，这一盏留给你。', en: 'Leave the bustle at the gate; this light is yours.' } },
  { id: 'jokhang', vessel: 'lamp', name: { zh: '大昭寺', en: 'Jokhang Temple' }, where: { zh: '拉萨', en: 'Lhasa' }, line: { zh: '让一点暖光，陪你坐一会儿。', en: 'Let a little warmth sit with you.' } },
  { id: 'puji', vessel: 'candle', name: { zh: '普济寺', en: 'Puji Temple' }, where: { zh: '普陀山', en: 'Putuoshan' }, line: { zh: '远处有潮声，眼前有一盏光。', en: 'The tide far off, a light close by.' } },
  { id: 'zixiao', vessel: 'candle', name: { zh: '紫霄宫', en: 'Zixiao Palace' }, where: { zh: '武当山', en: 'Wudang' }, line: { zh: '云慢慢经过，你做自己的事。', en: 'Clouds pass slowly; do your own thing.' } },
  { id: 'qufu', vessel: 'candle', name: { zh: '孔庙', en: 'Temple of Confucius' }, where: { zh: '曲阜', en: 'Qufu' }, line: { zh: '为想学会的事，留一点耐心。', en: 'A little patience for what you want to learn.' } },
  { id: 'meizhou', vessel: 'candle', name: { zh: '妈祖祖庙', en: 'Mazu Ancestral Temple' }, where: { zh: '湄洲岛', en: 'Meizhou Island' }, line: { zh: '愿远行的人，也有安心的方向。', en: 'May those far away find their way home.' } },
  { id: 'guandi', vessel: 'candle', name: { zh: '关帝庙', en: 'Guandi Temple' }, where: { zh: '解州', en: 'Xiezhou' }, line: { zh: '把在意的事，郑重放在这里。', en: 'Set what matters to you down here, with care.' } },
  { id: 'hongluo', vessel: 'candle', name: { zh: '红螺寺', en: 'Hongluo Temple' }, where: { zh: '怀柔 · 红螺山', en: 'Huairou · Hongluo Hill' }, line: { zh: '为相遇，也为好好相处。', en: 'For meeting, and for getting along.' } },
];
export const PLACE_IDS = PLACES.map((p) => p.id) as [PlaceId, ...PlaceId[]];
export const placeById = (id: string) => PLACES.find((p) => p.id === id);
