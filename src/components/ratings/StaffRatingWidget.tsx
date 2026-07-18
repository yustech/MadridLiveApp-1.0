import { Star, X } from 'lucide-react';
import type { StaffRating } from '../../types';
import {
  getStaffRatingColor,
  STAFF_RATING_VALUES,
} from './staffRating';

interface StaffRatingWidgetProps {
  rating?: StaffRating | null;
  workerName: string;
  interactive?: boolean;
  disabled?: boolean;
  onChange?: (rating: StaffRating | null) => void;
  testId?: string;
  compact?: boolean;
}

export default function StaffRatingWidget({
  rating = null,
  workerName,
  interactive = false,
  disabled = false,
  onChange,
  testId,
  compact = false,
}: StaffRatingWidgetProps) {
  const normalizedRating = rating ?? null;
  const color = getStaffRatingColor(normalizedRating);
  const numericLabel = `${normalizedRating ?? 0}/5`;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={`Puntuación de ${workerName}: ${normalizedRating === null ? 'sin puntuar' : numericLabel}`}
      data-testid={testId}
      data-rating={normalizedRating ?? 'unrated'}
      data-rating-color={color}
    >
      <div className="flex items-center gap-0.5" aria-hidden={!interactive || undefined}>
        {STAFF_RATING_VALUES.map((starValue) => {
          const isFilled = normalizedRating !== null && starValue <= normalizedRating;
          const icon = (
            <Star
              className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}
              fill={isFilled ? 'currentColor' : 'none'}
              strokeWidth={isFilled ? 1.5 : 2}
              data-filled={isFilled ? 'true' : 'false'}
              aria-hidden="true"
            />
          );

          if (!interactive) {
            return (
              <span
                key={starValue}
                className={isFilled ? '' : 'text-white/35'}
                style={isFilled ? { color } : undefined}
              >
                {icon}
              </span>
            );
          }

          return (
            <button
              key={starValue}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onChange?.(starValue);
              }}
              disabled={disabled}
              className={`rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait disabled:opacity-50 ${isFilled ? '' : 'text-white/35 hover:text-white/70'}`}
              style={isFilled ? { color } : undefined}
              aria-label={`Puntuar a ${workerName} con ${starValue} de 5 estrellas`}
              aria-pressed={normalizedRating === starValue}
            >
              {icon}
            </button>
          );
        })}
      </div>

      <span className="whitespace-nowrap text-[10px] font-mono font-bold text-white/65">
        {normalizedRating === null && <span className="mr-1 text-white/40">Sin puntuar ·</span>}
        {numericLabel}
      </span>

      {interactive && normalizedRating !== null && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onChange?.(null);
          }}
          disabled={disabled}
          className="rounded p-0.5 text-white/30 transition-colors hover:bg-white/10 hover:text-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait disabled:opacity-50"
          aria-label={`Quitar puntuación de ${workerName}`}
          title="Quitar puntuación"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
