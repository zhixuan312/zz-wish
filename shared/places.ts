// The ten places, in their fixed order. Each is a fictional temple with its own landscape and its own lamp.
// Chinese strings here are zh locale content.
export type Locale = 'zh' | 'en';
export type PlaceId = 'pine-gate' | 'bamboo-rain' | 'cloud-cliff' | 'lotus-pond' | 'sea-tide' | 'snow-roof' | 'loess-cliff' | 'highland' | 'bell-lane' | 'valley-pagoda';
// wax: a candle you can shape or draw; oil: you choose how much oil; shade: a lamp behind a shade, you choose how long.
export type Vessel = 'wax' | 'oil' | 'shade';
export interface Place { id: PlaceId; vessel: Vessel; name: Record<Locale, string>; lamp: Record<Locale, string>; line: Record<Locale, string> }

export const PLACES: Place[] = [
  { id: 'pine-gate', vessel: 'wax', name: { zh: '松门石阶', en: 'Pine Gate Steps' }, lamp: { zh: '石龛灯', en: 'Stone niche lamp' }, line: { zh: '走完最后几级台阶，在门边留一盏灯。', en: 'Climb the last few steps and leave a light by the gate.' } },
  { id: 'bamboo-rain', vessel: 'oil', name: { zh: '竹院雨廊', en: 'Bamboo Rain Cloister' }, lamp: { zh: '青瓷盏灯', en: 'Celadon cup lamp' }, line: { zh: '雨落在瓦上，灯在廊下。', en: 'Rain on the tiles, a light under the eaves.' } },
  { id: 'cloud-cliff', vessel: 'wax', name: { zh: '云崖悬院', en: 'Cloud Cliff Court' }, lamp: { zh: '铜框风灯', en: 'Brass storm lantern' }, line: { zh: '云走得很快，这一盏不动。', en: 'The clouds move fast; this light holds still.' } },
  { id: 'lotus-pond', vessel: 'wax', name: { zh: '莲池水院', en: 'Lotus Pond Court' }, lamp: { zh: '莲瓣座灯', en: 'Lotus-petal lamp' }, line: { zh: '一盏灯，水里还有一盏。', en: 'One light, and another in the water.' } },
  { id: 'sea-tide', vessel: 'shade', name: { zh: '潮声海寺', en: 'Tide Temple' }, lamp: { zh: '陶罩海灯', en: 'Pottery-hood sea lamp' }, line: { zh: '浪再大，墙上的光也是稳的。', en: 'However loud the sea, the light on the wall stays still.' } },
  { id: 'snow-roof', vessel: 'shade', name: { zh: '雪瓦北院', en: 'Snow Roof Court' }, lamp: { zh: '红纱廊灯', en: 'Red gauze lantern' }, line: { zh: '翻过雪岭的旅人，会在殿里留一盏红纱灯。', en: 'Travellers stop at the pass and leave a red gauze lantern in the hall.' } },
  { id: 'loess-cliff', vessel: 'oil', name: { zh: '黄土崖院', en: 'Loess Cliff Court' }, lamp: { zh: '浅陶油灯', en: 'Shallow clay oil lamp' }, line: { zh: '一截短短的灯芯，也能亮很久。', en: 'A short wick can still burn a long time.' } },
  { id: 'highland', vessel: 'oil', name: { zh: '高原白院', en: 'High White Court' }, lamp: { zh: '玻璃罩铜灯', en: 'Brass lamp with glass chimney' }, line: { zh: '天很高，风很大，灯躲在墙角。', en: 'High sky, strong wind; the lamp keeps to the corner.' } },
  { id: 'bell-lane', vessel: 'shade', name: { zh: '巷尾钟院', en: "Lane's End Bell Court" }, lamp: { zh: '木格方灯', en: 'Wooden lattice lamp' }, line: { zh: '巷子还亮着，院子里已经静了。', en: 'The lane is still lit; the court is already quiet.' } },
  { id: 'valley-pagoda', vessel: 'oil', name: { zh: '深谷塔院', en: 'Valley Pagoda Court' }, lamp: { zh: '琉璃小灯', en: 'Small glass lamp' }, line: { zh: '溪声在墙外，塔在身后。', en: 'The stream beyond the wall, the pagoda behind you.' } },
];
export const PLACE_IDS = PLACES.map((p) => p.id) as [PlaceId, ...PlaceId[]];
export const placeById = (id: string) => PLACES.find((p) => p.id === id);
