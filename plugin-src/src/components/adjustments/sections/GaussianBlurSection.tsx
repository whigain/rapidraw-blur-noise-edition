import { useTranslation } from 'react-i18next';
import Slider, { SliderChangeEvent } from '../../ui/Slider';
import Switch from '../../ui/Switch';
import AdjustmentSubSection from '../AdjustmentSubSection';
import { SpatialEffect } from '../Effects';
import { Adjustments, Effect } from '../../../utils/adjustments';
import { GAUSSIAN_BLUR_MAX, GAUSSIAN_BLUR_MIN } from '../../../utils/blurNoise';

interface GaussianBlurSectionProps {
  adjustments: Adjustments;
  handleAdjustmentChange(key: Effect, value: SliderChangeEvent['target']['value'] | boolean): void;
  hiddenTools: string[];
  onDragStateChange?: (isDragging: boolean) => void;
  toolOrder: string[];
}

// New section rendered inside RapidRAW's existing Effects panel — see
// PLAN.md ("UI-Panels"): a Gaussian Blur effect belongs next to Lens Blur /
// Grain / Vignette, not in a separate top-level panel.
export default function GaussianBlurSection({
  adjustments,
  handleAdjustmentChange,
  hiddenTools,
  onDragStateChange,
  toolOrder,
}: GaussianBlurSectionProps) {
  const { t } = useTranslation();

  if (hiddenTools.includes('gaussianBlur')) {
    return null;
  }

  return (
    <AdjustmentSubSection
      id="gaussianBlur"
      order={toolOrder.indexOf('gaussianBlur')}
      title={t('editor.blurNoise.gaussianBlur.title')}
    >
      <SpatialEffect
        enabled={adjustments.gaussianBlurEnabled}
        label={t('editor.blurNoise.gaussianBlur.enable')}
        onToggle={(enabled: boolean) => handleAdjustmentChange(Effect.GaussianBlurEnabled, enabled)}
      >
        <Slider
          defaultValue={0}
          label={t('editor.blurNoise.gaussianBlur.radius')}
          max={GAUSSIAN_BLUR_MAX}
          min={GAUSSIAN_BLUR_MIN}
          onChange={(e: SliderChangeEvent) => handleAdjustmentChange(Effect.GaussianBlurRadius, e.target.value)}
          onDragStateChange={onDragStateChange}
          step={0.1}
          suffix=" px"
          value={adjustments.gaussianBlurRadius}
        />
      </SpatialEffect>
    </AdjustmentSubSection>
  );
}
