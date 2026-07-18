import {loadFont as loadManrope} from '@remotion/google-fonts/Manrope';
import {loadFont as loadNotoSansArabic} from '@remotion/google-fonts/NotoSansArabic';

const manrope = loadManrope('normal', {
  weights: ['400', '500', '600', '700', '800'],
  subsets: ['latin'],
});

const arabic = loadNotoSansArabic('normal', {
  weights: ['400', '500', '600', '700', '800'],
  subsets: ['arabic'],
});

export const premiumFonts = {
  sans: manrope.fontFamily,
  arabic: arabic.fontFamily,
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
};

export const waitForPremiumFonts = async () => {
  await Promise.all([manrope.waitUntilDone(), arabic.waitUntilDone()]);
};
