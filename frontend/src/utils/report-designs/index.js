/** Frontend report design registry — design 1 is the default active layout. */
import { DESIGN_ID, LAB_REPORT_PRINT_STYLES } from './design-1-print';

export const ACTIVE_DESIGN_ID = DESIGN_ID;

export const getPrintStyles = (designId = ACTIVE_DESIGN_ID) => {
  if (Number(designId) === 1) return LAB_REPORT_PRINT_STYLES;
  return LAB_REPORT_PRINT_STYLES;
};

export { LAB_REPORT_PRINT_STYLES };
