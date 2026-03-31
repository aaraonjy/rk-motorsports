export type BaseTune = {
  id: string;
  name: string;
  price: number;
};

export type AddOn = {
  name: string;
  price: number;
};

export const baseTunes: BaseTune[] = [
  { id: "stage1", name: "Stage 1 ECU Tune", price: 1200 },
  { id: "stage2", name: "Stage 2 ECU Tune", price: 2000 },
  { id: "custom", name: "Custom File Service", price: 2800 },
];

const rawAddOns: AddOn[] = [
  { name: "Boosted Launch Control (2-Step)", price: 400 },
  { name: "Rolling Anti-Lag (RAL)", price: 500 },
  { name: "Pop & Bang / Flame Tuning", price: 300 },
  { name: "Multi-Map Switching (On-The-Fly)", price: 600 },
  { name: "EGR Off", price: 200 },
  { name: "Lambda / Decat / O2 Off", price: 300 },
  { name: "DTC Off", price: 200 },
  { name: "Speed Limiter Removal", price: 200 },
  { name: "Cold Start Delete", price: 200 },
  { name: "MAF Off", price: 300 },
  { name: "Start Stop Disable", price: 200 },
];

export const addOns: AddOn[] = [...rawAddOns].sort((a, b) => {
  if (a.price !== b.price) return a.price - b.price;
  return a.name.localeCompare(b.name);
});

export function getAddOnByName(name: string) {
  return addOns.find((item) => item.name === name) || null;
}

export function calculateAddOnTotal(selectedAddOns: string[]) {
  return selectedAddOns.reduce((total, selectedName) => {
    const addOn = getAddOnByName(selectedName);
    return total + (addOn?.price || 0);
  }, 0);
}