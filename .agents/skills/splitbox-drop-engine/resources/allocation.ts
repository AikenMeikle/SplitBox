export type SliceLifecycleStatus =
  | 'POOLING'
  | 'BOX_LOCKED'
  | 'FULFILLED'
  | 'AUTO_REFUNDED';

export interface ClaimedSliceRecord {
  id: string;
  productId: string;
  owner: 'stranger' | 'student';
  orderId?: string;
  /** 1-based sequential box number (Box #1, Box #2, ...) */
  boxNumber: number;
  /** 1-based position inside that box (1..slicesPerBox) */
  slotInBox: number;
  pricePence: number;
  retailPricePence: number;
  claimedAtIso: string;
}

export interface EvaluatedSlice extends ClaimedSliceRecord {
  status: SliceLifecycleStatus;
  boxClaimedCount: number;
  slicesPerBox: number;
}

export function formatGBP(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(Math.round(pence));
  return `${sign}£${(abs / 100).toFixed(2)}`;
}

export function calcSavingsPercent(slicePricePence: number, retailPricePence: number): number {
  if (retailPricePence <= 0 || slicePricePence >= retailPricePence) return 0;
  return Math.round(((retailPricePence - slicePricePence) / retailPricePence) * 100);
}

/**
 * Appends `quantity` new slices strictly first-come, first-served after existing slices.
 * Example: existingCount = 3, slicesPerBox = 4, quantity = 2
 *  -> Slice 1 lands at index 3 => Box #1, slot 4/4
 *  -> Slice 2 lands at index 4 => Box #2, slot 1/4
 */
export function allocateSlicesChronologically(params: {
  existingSlices: ClaimedSliceRecord[];
  productId: string;
  slicesPerBox: number;
  quantity: number;
  owner: 'stranger' | 'student';
  pricePence: number;
  retailPricePence: number;
  orderId?: string;
  nowIso?: string;
}): ClaimedSliceRecord[] {
  const {
    existingSlices,
    productId,
    slicesPerBox,
    quantity,
    owner,
    pricePence,
    retailPricePence,
    orderId,
    nowIso = new Date().toISOString(),
  } = params;

  const baseCount = existingSlices.length;
  const newlyAdded: ClaimedSliceRecord[] = [];

  for (let i = 0; i < quantity; i++) {
    const globalIdx = baseCount + i;
    const boxNumber = Math.floor(globalIdx / slicesPerBox) + 1;
    const slotInBox = (globalIdx % slicesPerBox) + 1;
    newlyAdded.push({
      id: `${productId}-slice-${globalIdx + 1}-${Math.random().toString(36).slice(2, 7)}`,
      productId,
      owner,
      orderId,
      boxNumber,
      slotInBox,
      pricePence,
      retailPricePence,
      claimedAtIso: nowIso,
    });
  }

  return [...existingSlices, ...newlyAdded];
}

/**
 * Computes open-box meter metrics for product cards in the catalog.
 * If existingCount is an exact multiple of slicesPerBox (e.g. 4 on a 4-slice box),
 * 1 box is locked and the next open box starts at 0/4 (unless drop is closed).
 */
export function getPoolMeterSummary(
  slices: ClaimedSliceRecord[],
  slicesPerBox: number,
  isCutoffTriggered: boolean
) {
  const totalClaimed = slices.length;
  const lockedBoxesCount = Math.floor(totalClaimed / slicesPerBox);
  const openBoxClaimed = totalClaimed % slicesPerBox;
  const activeBoxNumber = lockedBoxesCount + 1;

  // Count how many slices the current student holds inside the active open box
  // (or inside the just-locked box if openBoxClaimed === 0 and lockedBoxesCount > 0)
  const displayBoxNumber =
    openBoxClaimed === 0 && lockedBoxesCount > 0 && isCutoffTriggered
      ? lockedBoxesCount
      : activeBoxNumber;

  const slicesInDisplayBox = slices.filter((s) => s.boxNumber === displayBoxNumber);
  const userSlicesInOpenBox = slicesInDisplayBox.filter((s) => s.owner === 'student').length;
  const totalUserSlices = slices.filter((s) => s.owner === 'student').length;

  return {
    totalClaimed,
    lockedBoxesCount,
    openBoxClaimed:
      openBoxClaimed === 0 && lockedBoxesCount > 0 && isCutoffTriggered
        ? slicesPerBox
        : openBoxClaimed,
    slicesRemainingToLockOpenBox:
      openBoxClaimed === 0 ? slicesPerBox : slicesPerBox - openBoxClaimed,
    activeBoxNumber: displayBoxNumber,
    userSlicesInOpenBox,
    totalUserSlices,
  };
}

/**
 * Evaluates every slice's live lifecycle status before and after Drop Cutoff.
 */
export function evaluateProductSlices(
  slices: ClaimedSliceRecord[],
  slicesPerBox: number,
  isCutoffTriggered: boolean
): EvaluatedSlice[] {
  const countsByBox = new Map<number, number>();
  for (const s of slices) {
    countsByBox.set(s.boxNumber, (countsByBox.get(s.boxNumber) ?? 0) + 1);
  }

  return slices.map((s) => {
    const boxClaimedCount = countsByBox.get(s.boxNumber) ?? 0;
    const isBoxFull = boxClaimedCount >= slicesPerBox;

    let status: SliceLifecycleStatus;
    if (isCutoffTriggered) {
      status = isBoxFull ? 'FULFILLED' : 'AUTO_REFUNDED';
    } else {
      status = isBoxFull ? 'BOX_LOCKED' : 'POOLING';
    }

    return {
      ...s,
      status,
      boxClaimedCount,
      slicesPerBox,
    };
  });
}
