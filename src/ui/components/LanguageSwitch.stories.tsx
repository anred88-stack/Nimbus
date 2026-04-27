import type { Meta, StoryObj } from '@storybook/react';
import { LanguageSwitch } from './LanguageSwitch';

/**
 * Smoke-test story for the Storybook scaffold. Serves two purposes:
 *
 *  1. Proves the pipeline (Vite builder + i18n bootstrap + CSS modules)
 *     works end-to-end; without a story `pnpm build-storybook` would
 *     warn about an empty index and skip most of its work.
 *  2. Gives the a11y addon something to exercise — `LanguageSwitch`
 *     renders an aria-labelled button and must pass axe with no
 *     violations before the UI layer grows.
 */
const meta = {
  title: 'UI/LanguageSwitch',
  component: LanguageSwitch,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LanguageSwitch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
