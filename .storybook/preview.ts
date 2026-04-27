import type { Preview } from '@storybook/react';
import '../src/styles/globals.css';
import '../src/i18n';

/**
 * Story defaults shared by every component. Two things happen here that
 * keep the stories honest:
 *
 *  1. Global styles and i18n are imported once, so components render in
 *     the same visual/locale context as the deployed app. Without this a
 *     LanguageSwitch story would render raw translation keys, and most
 *     components would look like unstyled text.
 *
 *  2. The a11y addon is parked at 'error' severity so violations fail
 *     CI (via build-storybook → report-storybook) rather than becoming
 *     silent warnings.
 */
const preview: Preview = {
  parameters: {
    a11y: {
      test: 'error',
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
