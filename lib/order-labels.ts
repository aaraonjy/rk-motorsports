export function formatEcuStageLabel(value?: string | null) {
  switch (value) {
    case "stock":
      return "Stock";
    case "stage1":
      return "Stage 1";
    case "stage2":
      return "Stage 2";
    case "stage3":
      return "Stage 3";
    case "custom":
      return "Custom Tune";
    default:
      return value || "";
  }
}

export function formatCurrentEcuSetupLabel(value?: string | null) {
  switch (value) {
    case "stock":
      return "Stock";
    case "stage1":
      return "Stage 1";
    case "stage2":
      return "Stage 2";
    case "stage3":
      return "Stage 3";
    case "custom":
      return "Custom";
    default:
      return value || "";
  }
}

export function formatTurboSetupLabel(value?: string | null) {
  switch (value) {
    case "stock":
      return "Stock";
    case "oem_upgrade":
      return "OEM+";
    case "hybrid":
      return "Hybrid";
    case "big_turbo":
      return "Big Turbo";
    case "other":
      return "Others";
    default:
      return value || "";
  }
}

export function formatTcuStageLabel(value?: string | null) {
  switch (value) {
    case "stage1":
      return "Stage 1";
    case "stage2":
      return "Stage 2";
    case "custom":
      return "Custom Tune";
    default:
      return value || "";
  }
}
