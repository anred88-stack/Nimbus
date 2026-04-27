import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook scaffold for milestone M1. Story files live next to their
 * components under src/ and re-use Vite's existing config
 * for CSS modules, aliases, and React plugin.
 *
 * Addons kept minimal on purpose:
 *   - addon-a11y: WCAG AA is a project-level requirement (see
 *     CLAUDE.md), so an in-canvas axe pass is table-stakes.
 *
 * `docs.autodocs: 'tag'` opts only tagged components into generated
 * docs, avoiding surprise pages. Add stories and extra addons as the UI
 * layer grows in M2+.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  addons: ['@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
  docs: {
    autodocs: 'tag',
  },
  viteFinal: (viteConfig) => {
    // vite-plugin-cesium has a Windows path-concat bug when Storybook
    // runs from a project-level Vite config; strip it here because no
    // stories use Cesium. The main app build is unaffected.
    const plugins = (viteConfig.plugins ?? []).filter((plugin) => {
      const name = plugin && typeof plugin === 'object' && 'name' in plugin ? plugin.name : null;
      return name !== 'vite-plugin-cesium';
    });
    return {
      ...viteConfig,
      plugins,
    };
  },
};

export default config;
