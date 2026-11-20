import { useTranslation } from 'react-i18next';
import Slider, { SliderChangeEvent } from '../../ui/Slider';
import Switch from '../../ui/Switch';
import Dropdown from '../../ui/Dropdown';
import AdjustmentSubSection from '../AdjustmentSubSection';
import { SpatialEffect } from '../Effects';
import { Adjustments, Effect } from '../../../utils/adjustments';
import { BLUR_NOISE_PRESETS, NOISE_AMOUNT_MAX, NOISE_AMOUNT_MIN, NOISE_OPACITY_MAX, NOISE_OPACITY_MIN, NoiseDistribution, rollNoiseSeed } from '../../../utils/blurNoise';

interface NoiseSectionProps {
  adjustments: Adjustments;
  handleAdjustmentChange(key: Effect, value: SliderChangeEvent['target']['value'] | boolean | string): void;
  hiddenTools: string[];
  onDragStateChange?: (isDragging: boolean) => void;
  // NOTE: `handleAdjustmentChange` (above) runs every non-boolean value
  // through `parseInt(String(value), 10)` — fine for sliders/toggles, but it
  // silently turns a string like 'gaussian' into NaN. The Distribution
  // dropdown (and the preset button, which also sets it) must go through
  // this raw setter instead.
  setAdjustments(updater: (prev: Adjustments) => Adjustments): void;
  toolOrder: string[];
}

// New section rendered inside RapidRAW's existing Effects panel, right after
// Gaussian Blur — "Blur -> Noise" matches the pipeline order requested in
// the session brief (PLAN.md "Feature-Roadmap").
export default function NoiseSection({
  adjustments,
  handleAdjustmentChange,
  hiddenTools,
  onDragStateChange,
  setAdjustments,
  toolOrder,
}: NoiseSectionProps) {
  const { t } = useTranslation();

  if (hiddenTools.includes('noise')) {
    return null;
  }

  const distributionOptions = [
    { label: t('editor.blurNoise.noise.uniform'), value: 'uniform' as NoiseDistribution },
    { label: t('editor.blurNoise.noise.gaussian'), value: 'gaussian' as NoiseDistribution },
  ];

  const applyPreset = (presetId: string) => {
    const preset = BLUR_NOISE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    // One atomic update (not six handleAdjustmentChange calls) — simpler,
    // and sidesteps its number-only coercion for noiseDistribution.
    setAdjustments((prev) => ({ ...prev, ...preset.values }));
  };

  const rerollSeed = () => {
    setAdjustments((prev) => ({ ...prev, noiseSeed: rollNoiseSeed() }));
  };

  return (
    <AdjustmentSubSection
      id="noise"
      order={toolOrder.indexOf('noise')}
      title={t('editor.blurNoise.noise.title')}
      actions={
        <div className="flex items-center gap-1">
          <button
            className="text-xs text-text-secondary hover:text-text-primary transition-colors px-2 py-1 rounded-md hover:bg-card-active"
            onClick={() => applyPreset('vintageVideo')}
            type="button"
          >
            {t('editor.blurNoise.presets.vintageVideo')}
          </button>
          <button
            className="text-xs text-text-secondary hover:text-text-primary transition-colors px-2 py-1 rounded-md hover:bg-card-active"
            onClick={rerollSeed}
            title={t('editor.blurNoise.noise.rerollSeedTitle')}
            type="button"
          >
            {t('editor.blurNoise.noise.rerollSeed')}
          </button>
        </div>
      }
    >
      <SpatialEffect
        enabled={adjustments.noiseEnabled}
        label={t('editor.blurNoise.noise.enable')}
        onToggle={(enabled: boolean) => handleAdjustmentChange(Effect.NoiseEnabled, enabled as any)}
      >
        <Slider
          defaultValue={0}
          label={t('editor.blurNoise.noise.amount')}
          max={NOISE_AMOUNT_MAX}
          min={NOISE_AMOUNT_MIN}
          onChange={(e: SliderChangeEvent) => handleAdjustmentChange(Effect.NoiseAmount, e.target.value)}
          onDragStateChange={onDragStateChange}
          step={0.1}
          suffix=" %"
          value={adjustments.noiseAmount}
        />
        <Slider
          defaultValue={100}
          label={t('editor.blurNoise.noise.opacity')}
          max={NOISE_OPACITY_MAX}
          min={NOISE_OPACITY_MIN}
          onChange={(e: SliderChangeEvent) => handleAdjustmentChange(Effect.NoiseOpacity, e.target.value)}
          onDragStateChange={onDragStateChange}
          step={0.1}
          suffix=" %"
          value={adjustments.noiseOpacity}
        />
        <div className="flex items-center justify-between gap-2 mt-2">
          <span className="text-sm text-text-secondary">{t('editor.blurNoise.noise.distribution')}</span>
          <Dropdown
            className="w-32"
            onChange={(value: NoiseDistribution) => setAdjustments((prev) => ({ ...prev, noiseDistribution: value }))}
            options={distributionOptions}
            value={adjustments.noiseDistribution}
          />
        </div>
        <Switch
          checked={adjustments.noiseMonochrome}
          label={t('editor.blurNoise.noise.monochrome')}
          onChange={(checked: boolean) => handleAdjustmentChange(Effect.NoiseMonochrome, checked as any)}
        />
      </SpatialEffect>
    </AdjustmentSubSection>
  );
}
