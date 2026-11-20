import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Slider, { SliderChangeEvent } from '../../ui/Slider';
import Switch from '../../ui/Switch';
import Dropdown from '../../ui/Dropdown';
import AdjustmentSubSection from '../AdjustmentSubSection';
import { SpatialEffect } from '../Effects';
import { Adjustments, Effect } from '../../../utils/adjustments';
import {
  FILM_NOISE_STOCKS,
  FILM_NOISE_STRENGTH_MAX,
  FILM_NOISE_STRENGTH_MIN,
  FILM_NOISE_GRAIN_SIZE_MAX,
  FILM_NOISE_GRAIN_SIZE_MIN,
  FILM_NOISE_BLUE_BOOST_MAX,
  FILM_NOISE_BLUE_BOOST_MIN,
  FILM_NOISE_COLOR_SAT_MAX,
  FILM_NOISE_COLOR_SAT_MIN,
  FILM_NOISE_OPACITY_MAX,
  FILM_NOISE_OPACITY_MIN,
  FilmNoiseResponse,
  FilmNoiseStock,
  findFilmNoiseStock,
  matchFilmNoiseStock,
  rollNoiseSeed,
} from '../../../utils/blurNoise';

interface FilmNoiseSectionProps {
  adjustments: Adjustments;
  handleAdjustmentChange(key: Effect, value: SliderChangeEvent['target']['value'] | boolean | string): void;
  hiddenTools: string[];
  onDragStateChange?: (isDragging: boolean) => void;
  // See NoiseSection.tsx for why we need the raw setter too — the stock
  // dropdown has to atomically set multiple numeric fields at once, and the
  // generic handleAdjustmentChange runs non-boolean values through parseInt.
  setAdjustments(updater: (prev: Adjustments) => Adjustments): void;
  toolOrder: string[];
}

// Film Noise — the third section next to Gaussian Blur and Noise.
// Clean-room take on analog film grain: spatially correlated, color-sensitive
// (blue stronger), density-weighted. Parameter model and sensible defaults
// cross-checked against the user's own RapidGrade Film profiles — all
// numeric parameters, no reverse-engineered code.
export default function FilmNoiseSection({
  adjustments,
  handleAdjustmentChange,
  hiddenTools,
  onDragStateChange,
  setAdjustments,
  toolOrder,
}: FilmNoiseSectionProps) {
  const { t } = useTranslation();

  // Monochrome toggle remembers the previous colorSaturation so flipping
  // it off restores what the user had. useRef is deliberate — this is UI
  // state, not render state, and it must never travel into the sidecar
  // (that would thrash the effects-stage render cache). Lost on unmount;
  // then the untoggle falls back to the stock's own saturation (or 20%).
  const previousColorSatRef = useRef<number | null>(null);

  if (hiddenTools.includes('filmNoise')) {
    return null;
  }

  // 'custom' appears as the sixth option so a user never sees a dropdown
  // showing '35mm' when their sliders are actually at some other values.
  const stockOptions = [
    ...FILM_NOISE_STOCKS.map((s) => ({
      label: t(`editor.blurNoise.filmNoise.stocks.${s.id}`),
      value: s.id as FilmNoiseStock,
    })),
    { label: t('editor.blurNoise.filmNoise.stocks.custom'), value: 'custom' as FilmNoiseStock },
  ];

  const applyStock = (stockId: FilmNoiseStock) => {
    if (stockId === 'custom') {
      // Selecting 'Custom' explicitly is a no-op on slider values — it
      // just locks the dropdown label on 'custom'.
      setAdjustments((prev) => ({ ...prev, filmNoiseStock: 'custom' }));
      return;
    }
    const stock = findFilmNoiseStock(stockId);
    if (!stock) return;
    // Atomic update — matches the pattern used by NoiseSection's preset
    // button, so the render cache sees ONE adjustments change and schedules
    // ONE re-render instead of thrashing through four separate state writes.
    setAdjustments((prev) => ({
      ...prev,
      filmNoiseStock: stock.id,
      filmNoiseStrength: stock.strength,
      filmNoiseGrainSize: stock.grainSize,
      filmNoiseBlueBoost: stock.blueBoost,
      filmNoiseColorSaturation: stock.colorSaturation,
    }));
  };

  // Each slider commit snaps the dropdown to whichever preset (if any) the
  // new four-tuple exactly matches, otherwise to 'custom'. Stays as one
  // atomic write so the Rust cache sees a single effects-hash change.
  const commitSliderChange = (field: keyof Adjustments, raw: number | string) => {
    const value = Number(raw);
    setAdjustments((prev) => {
      const next = { ...prev, [field]: value } as Adjustments;
      next.filmNoiseStock = matchFilmNoiseStock(
        next.filmNoiseStrength,
        next.filmNoiseGrainSize,
        next.filmNoiseBlueBoost,
        next.filmNoiseColorSaturation,
      );
      return next;
    });
  };

  const isMonochrome = adjustments.filmNoiseColorSaturation <= 0;
  const toggleMonochrome = (checked: boolean) => {
    if (checked) {
      if (adjustments.filmNoiseColorSaturation > 0) {
        previousColorSatRef.current = adjustments.filmNoiseColorSaturation;
      }
      commitSliderChange('filmNoiseColorSaturation', 0);
    } else {
      const stockPreset =
        adjustments.filmNoiseStock !== 'custom' ? findFilmNoiseStock(adjustments.filmNoiseStock) : undefined;
      const restored = previousColorSatRef.current ?? stockPreset?.colorSaturation ?? 20;
      commitSliderChange('filmNoiseColorSaturation', restored);
    }
  };

  const rerollSeed = () => {
    setAdjustments((prev) => ({ ...prev, filmNoiseSeed: rollNoiseSeed() }));
  };

  return (
    <AdjustmentSubSection
      id="filmNoise"
      order={toolOrder.indexOf('filmNoise')}
      title={t('editor.blurNoise.filmNoise.title')}
      actions={
        <button
          className="text-xs text-text-secondary hover:text-text-primary transition-colors px-2 py-1 rounded-md hover:bg-card-active"
          onClick={rerollSeed}
          title={t('editor.blurNoise.filmNoise.rerollSeedTitle')}
          type="button"
        >
          {t('editor.blurNoise.filmNoise.rerollSeed')}
        </button>
      }
    >
      <SpatialEffect
        enabled={adjustments.filmNoiseEnabled}
        label={t('editor.blurNoise.filmNoise.enable')}
        onToggle={(enabled: boolean) => handleAdjustmentChange(Effect.FilmNoiseEnabled, enabled as any)}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-text-secondary">{t('editor.blurNoise.filmNoise.stock')}</span>
          <Dropdown
            className="w-32"
            onChange={(value: FilmNoiseStock) => applyStock(value)}
            options={stockOptions}
            value={adjustments.filmNoiseStock}
          />
        </div>
        <Slider
          defaultValue={60}
          label={t('editor.blurNoise.filmNoise.strength')}
          max={FILM_NOISE_STRENGTH_MAX}
          min={FILM_NOISE_STRENGTH_MIN}
          onChange={(e: SliderChangeEvent) => commitSliderChange('filmNoiseStrength', e.target.value)}
          onDragStateChange={onDragStateChange}
          step={0.1}
          suffix=" %"
          value={adjustments.filmNoiseStrength}
        />
        <Slider
          defaultValue={100}
          label={t('editor.blurNoise.filmNoise.opacity')}
          max={FILM_NOISE_OPACITY_MAX}
          min={FILM_NOISE_OPACITY_MIN}
          onChange={(e: SliderChangeEvent) =>
            handleAdjustmentChange(Effect.FilmNoiseOpacity, e.target.value)
          }
          onDragStateChange={onDragStateChange}
          step={0.1}
          suffix=" %"
          value={adjustments.filmNoiseOpacity}
        />
        <Slider
          defaultValue={1}
          label={t('editor.blurNoise.filmNoise.grainSize')}
          max={FILM_NOISE_GRAIN_SIZE_MAX}
          min={FILM_NOISE_GRAIN_SIZE_MIN}
          onChange={(e: SliderChangeEvent) => commitSliderChange('filmNoiseGrainSize', e.target.value)}
          onDragStateChange={onDragStateChange}
          step={0.1}
          suffix=" px"
          value={adjustments.filmNoiseGrainSize}
        />
        <Slider
          defaultValue={2}
          label={t('editor.blurNoise.filmNoise.blueBoost')}
          max={FILM_NOISE_BLUE_BOOST_MAX}
          min={FILM_NOISE_BLUE_BOOST_MIN}
          onChange={(e: SliderChangeEvent) => commitSliderChange('filmNoiseBlueBoost', e.target.value)}
          onDragStateChange={onDragStateChange}
          step={0.1}
          suffix="×"
          value={adjustments.filmNoiseBlueBoost}
        />
        <Slider
          defaultValue={20}
          label={t('editor.blurNoise.filmNoise.colorSaturation')}
          max={FILM_NOISE_COLOR_SAT_MAX}
          min={FILM_NOISE_COLOR_SAT_MIN}
          onChange={(e: SliderChangeEvent) => commitSliderChange('filmNoiseColorSaturation', e.target.value)}
          onDragStateChange={onDragStateChange}
          step={0.1}
          suffix=" %"
          value={adjustments.filmNoiseColorSaturation}
        />
        <Switch
          checked={isMonochrome}
          label={t('editor.blurNoise.filmNoise.monochrome')}
          onChange={toggleMonochrome}
        />
        <Switch
          checked={adjustments.filmNoiseResponse === 'flat'}
          label={t('editor.blurNoise.filmNoise.responseFlat')}
          onChange={(checked: boolean) =>
            setAdjustments((prev) => ({
              ...prev,
              filmNoiseResponse: (checked ? 'flat' : 'film') as FilmNoiseResponse,
            }))
          }
        />
      </SpatialEffect>
    </AdjustmentSubSection>
  );
}
