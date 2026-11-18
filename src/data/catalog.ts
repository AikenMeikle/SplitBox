import type { CampusHub, CatalogItem, HubId, ProductCategory } from '../types';

export const RETAIL_BENCHMARK_LABEL = 'SELLY OAK EXPRESS';

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  'Pantry & Cooking',
  'Drinks & Oat Milk',
  'Snacks & Study Fuel',
  'Household & Dorm',
];

export const UOB_CAMPUS_HUBS: CampusHub[] = [
  {
    id: 'vale-shackleton',
    name: 'The Vale Village — Shackleton Hub',
    shortLabel: 'VALE · SHACKLETON',
    area: 'The Vale Student Village',
    addressNote: 'Shackleton Reception Forecourt, Edgbaston Park Rd, B15 3SZ',
    pickupWindow: 'Sat 11:00–14:00',
    walkingNote: '2 min walk from Chamberlain, Maple Bank & Tennis Courts halls',
  },
  {
    id: 'guild-mermaid',
    name: 'Guild of Students — Mermaid Square',
    shortLabel: 'GUILD · MERMAID SQ',
    area: 'Edgbaston Main Campus',
    addressNote: 'Mermaid Square Covered Concourse (by University Station), B15 2TU',
    pickupWindow: 'Sat 12:00–15:00',
    walkingNote: '4 min walk from University Rail Station & Main Library',
  },
  {
    id: 'selly-oak-bristol',
    name: 'Selly Oak — Bristol Road Hub',
    shortLabel: 'SELLY OAK · BRISTOL RD',
    area: 'Selly Oak Student Quarter',
    addressNote: '618 Bristol Rd Pop-Up Crate Bay (nr Dawlish Rd & Heeley Rd), B29 6BQ',
    pickupWindow: 'Sat 13:00–16:00',
    walkingNote: '3 min walk from Bournbrook, Tiverton Rd & Dawlish Rd student houses',
  },
  {
    id: 'pritchatts-park',
    name: 'Pritchatts Park — Social Space Hub',
    shortLabel: 'PRITCHATTS PARK',
    area: 'Pritchatts Park Village',
    addressNote: 'Pritchatts Social Space Courtyard, Pritchatts Rd, B15 2SA',
    pickupWindow: 'Sat 10:30–13:00',
    walkingNote: '1 min walk from Ashcroft, Oakley Court & Pritchatts House',
  },
];

export const SPLITBOX_CATALOG: CatalogItem[] = [
  {
    id: 'oatly-barista-ambient',
    name: 'Oatly Barista Edition Oat Milk (Ambient)',
    brand: 'Oatly',
    category: 'Drinks & Oat Milk',
    caseDescription: '12 × 1L Ambient Wholesale Case',
    sliceUnitDescription: '1 Slice = 3 × 1L Sealed Ambient Cartons (from 12 × 1L Box)',
    totalSlicesPerBox: 4,
    slicePriceGbp: 4.2,
    retailPriceGbp: 6.6,
    initialStrangerSlices: 3,
    packBadge: 'DRINKS · 4-SLICE BOX',
  },
  {
    id: 'mutti-chopped-tomatoes',
    name: 'Mutti Polpa Finely Chopped Tomatoes',
    brand: 'Mutti',
    category: 'Pantry & Cooking',
    caseDescription: '24 × 400g Catering Tray (6 Sealed 4-Packs)',
    sliceUnitDescription: '1 Slice = Sealed 4 × 400g Tin Multipack (from 24-Tin Box)',
    totalSlicesPerBox: 6,
    slicePriceGbp: 3.3,
    retailPriceGbp: 5.4,
    initialStrangerSlices: 5,
    packBadge: 'PANTRY · 6-SLICE BOX',
  },
  {
    id: 'who-gives-a-crap-bamboo',
    name: 'Bamboo 3-Ply Toilet Tissue Sub-Packs',
    brand: 'Who Gives A Crap',
    category: 'Household & Dorm',
    caseDescription: '48-Roll Double-Length Carton (8 Wrapped 6-Packs)',
    sliceUnitDescription: '1 Slice = Sealed 6-Roll Paper-Wrapped Sub-Pack (from 48-Roll Box)',
    totalSlicesPerBox: 8,
    slicePriceGbp: 4.8,
    retailPriceGbp: 7.5,
    initialStrangerSlices: 7,
    packBadge: 'HOUSEHOLD · 8-SLICE BOX',
  },
  {
    id: 'tilda-basmati-rice',
    name: 'Pure Basmati Rice Resealable Pouches',
    brand: 'Tilda',
    category: 'Pantry & Cooking',
    caseDescription: '4 × 2kg Trade Outer Case',
    sliceUnitDescription: '1 Slice = 1 × 2kg Factory-Sealed Ziplock Bag (from 8kg Box)',
    totalSlicesPerBox: 4,
    slicePriceGbp: 4.5,
    retailPriceGbp: 7.25,
    initialStrangerSlices: 2,
    packBadge: 'PANTRY · 4-SLICE BOX',
  },
  {
    id: 'trek-protein-flapjacks',
    name: 'Cocoa Oat Protein Flapjack Multipacks',
    brand: 'TREK',
    category: 'Snacks & Study Fuel',
    caseDescription: '24 × 50g Wholesale Case (6 Sealed 4-Bar Boxes)',
    sliceUnitDescription: '1 Slice = Sealed 4 × 50g Flapjack Box (from 24-Bar Case)',
    totalSlicesPerBox: 6,
    slicePriceGbp: 2.8,
    retailPriceGbp: 4.5,
    initialStrangerSlices: 4,
    packBadge: 'STUDY FUEL · 6-SLICE BOX',
  },
  {
    id: 'fairy-non-bio-pods',
    name: 'Non-Bio 3-in-1 Laundry Washing Capsules',
    brand: 'Fairy',
    category: 'Household & Dorm',
    caseDescription: '4 × 28-Wash Sealed Click-Lock Tubs',
    sliceUnitDescription: '1 Slice = 1 × 28-Wash Child-Safe Sealed Tub (from 4-Tub Box)',
    totalSlicesPerBox: 4,
    slicePriceGbp: 5.9,
    retailPriceGbp: 9.5,
    initialStrangerSlices: 1,
    packBadge: 'DORM WASH · 4-SLICE BOX',
  },
  {
    id: 'nongshim-shin-ramyun',
    name: 'Shin Ramyun Gourmet Spicy Noodle Packs',
    brand: 'Nongshim',
    category: 'Pantry & Cooking',
    caseDescription: '20 × 120g Export Carton (4 Sealed 5-Packs)',
    sliceUnitDescription: '1 Slice = Sealed 5 × 120g Pillow Multipack (from 20-Pack Box)',
    totalSlicesPerBox: 4,
    slicePriceGbp: 3.75,
    retailPriceGbp: 6.25,
    initialStrangerSlices: 6,
    packBadge: 'PANTRY · 4-SLICE BOX',
  },
  {
    id: 'easy-peeler-clementines',
    name: 'Sweet Easy-Peeler Clementines (Ambient Net)',
    brand: 'Orchard Crate',
    category: 'Snacks & Study Fuel',
    caseDescription: '6 × 1kg Pre-Netted Ambient Citrus Crate',
    sliceUnitDescription: '1 Slice = 1 × 1kg Sealed Mesh Net (~12 Fruit, Ambient)',
    totalSlicesPerBox: 6,
    slicePriceGbp: 1.85,
    retailPriceGbp: 3.0,
    initialStrangerSlices: 5,
    packBadge: 'AMBIENT FRUIT · 6-SLICE BOX',
  },
  {
    id: 'jimmys-iced-coffee-cans',
    name: 'Original Iced Coffee Slim Cans (Ambient)',
    brand: "Jimmy's",
    category: 'Drinks & Oat Milk',
    caseDescription: '24 × 250ml Ambient Tray (6 Sealed 4-Packs)',
    sliceUnitDescription: '1 Slice = Sealed 4 × 250ml Ambient Can Pack (from 24-Can Box)',
    totalSlicesPerBox: 6,
    slicePriceGbp: 3.9,
    retailPriceGbp: 6.4,
    initialStrangerSlices: 3,
    packBadge: 'DRINKS · 6-SLICE BOX',
  },
  {
    id: 'garofalo-penne-rigate',
    name: 'Penne Ziti Rigate Bronze-Die Durum Pasta',
    brand: 'Garofalo',
    category: 'Pantry & Cooking',
    caseDescription: '16 × 500g Trattoria Wholesale Case',
    sliceUnitDescription: '1 Slice = 2 × 500g Sealed Pasta Bags (from 16-Bag Box)',
    totalSlicesPerBox: 8,
    slicePriceGbp: 2.6,
    retailPriceGbp: 4.4,
    initialStrangerSlices: 6,
    packBadge: 'PANTRY · 8-SLICE BOX',
  },
  {
    id: 'pip-nut-peanut-butter',
    name: 'High-Oleic Smooth Peanut Butter 1kg Tub',
    brand: 'Pip & Nut',
    category: 'Pantry & Cooking',
    caseDescription: '4 × 1kg Tamper-Sealed Wholesale Case',
    sliceUnitDescription: '1 Slice = 1 × 1kg Tamper-Sealed Recyclable Tub (from 4-Tub Box)',
    totalSlicesPerBox: 4,
    slicePriceGbp: 4.95,
    retailPriceGbp: 7.8,
    initialStrangerSlices: 3,
    packBadge: 'PANTRY · 4-SLICE BOX',
  },
  {
    id: 'finish-ultimate-tabs',
    name: 'Ultimate All-In-1 Dishwasher Tablets Pouch',
    brand: 'Finish',
    category: 'Household & Dorm',
    caseDescription: '6 × 34-Tab Resealable Shared-House Case',
    sliceUnitDescription: '1 Slice = 1 × 34-Tab Foil-Sealed Ziplock Pouch (from 6-Pouch Box)',
    totalSlicesPerBox: 6,
    slicePriceGbp: 5.2,
    retailPriceGbp: 8.75,
    initialStrangerSlices: 2,
    packBadge: 'HOUSEHOLD · 6-SLICE BOX',
  },
  {
    id: 'minor-figures-chai',
    name: 'Organic Masala Chai Concentrate (Ambient)',
    brand: 'Minor Figures',
    category: 'Drinks & Oat Milk',
    caseDescription: '12 × 1L Ambient Barista Case',
    sliceUnitDescription: '1 Slice = 2 × 1L Sealed Ambient Tetra Cartons (from 12L Box)',
    totalSlicesPerBox: 6,
    slicePriceGbp: 4.6,
    retailPriceGbp: 7.4,
    initialStrangerSlices: 4,
    packBadge: 'DRINKS · 6-SLICE BOX',
  },
  {
    id: 'proper-lentil-chips',
    name: 'Sea Salt Lentil Chips Sharing Multipack',
    brand: 'PROPER',
    category: 'Snacks & Study Fuel',
    caseDescription: '24 × 85g Wholesale Carton',
    sliceUnitDescription: '1 Slice = 3 × 85g Sealed Sharing Bags (from 24-Bag Box)',
    totalSlicesPerBox: 8,
    slicePriceGbp: 3.15,
    retailPriceGbp: 5.25,
    initialStrangerSlices: 5,
    packBadge: 'STUDY FUEL · 8-SLICE BOX',
  },
];

export function toPence(amountGbp: number): number {
  return Math.round(amountGbp * 100);
}

export function fromPence(pence: number): number {
  return Math.round(pence) / 100;
}

export function formatGbp(amountGbp: number): string {
  const pence = toPence(amountGbp);
  const sign = pence < 0 ? '-' : '';
  const absPence = Math.abs(pence);
  return `${sign}£${(absPence / 100).toFixed(2)}`;
}

export function calcSavingsPercent(slicePriceGbp: number, retailPriceGbp: number): number {
  const slicePence = toPence(slicePriceGbp);
  const retailPence = toPence(retailPriceGbp);
  if (retailPence <= 0 || slicePence >= retailPence) return 0;
  return Math.round(((retailPence - slicePence) / retailPence) * 100);
}

export function getCampusHubById(hubId: HubId): CampusHub {
  return UOB_CAMPUS_HUBS.find((h) => h.id === hubId) ?? UOB_CAMPUS_HUBS[0];
}

export function getCatalogItemById(productId: string): CatalogItem | undefined {
  return SPLITBOX_CATALOG.find((item) => item.id === productId);
}
