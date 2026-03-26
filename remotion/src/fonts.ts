import { loadFont as loadDMSerif } from "@remotion/google-fonts/DMSerifDisplay";
import { loadFont as loadDMSans } from "@remotion/google-fonts/DMSans";

const serif = loadDMSerif("normal", { weights: ["400"], subsets: ["latin"] });
const sans = loadDMSans("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });

export const fontDisplay = serif.fontFamily;
export const fontBody = sans.fontFamily;
