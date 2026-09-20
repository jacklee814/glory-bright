/**
 * 舊站首頁輪播圖。
 *
 * 檔名沿用舊站原樣（`blank.png`／`blank1.png` 的命名具誤導性，實際上是情境照，
 * 不是空白圖）。caption 取自圖片內的標題文字，供 alt 使用。
 */
export interface HeroImage { file: string; slug: string; alt: string }

export const HERO_IMAGES: HeroImage[] = [
  { file: 'blank.png',  slug: 'unica-living',  alt: 'Unica 全彩智能開關情境照：綠色牆面客廳中的雙切開關面板' },
  { file: 'blank1.png', slug: 'zencelo-lounge', alt: 'ZENcelo 點藏純平開關情境照：木質牆面休閒椅旁的純平開關面板' },
  { file: '0.jpg',      slug: 'unica-top',     alt: 'Unica Top 系列面板材質一覽：原木、金屬與多聯大型面板型號對照' },
  { file: '1.jpg',      slug: 'unica-plus',    alt: 'Unica Plus 系列面板材質一覽：塑膠材質與多聯大型面板型號對照' },
];
