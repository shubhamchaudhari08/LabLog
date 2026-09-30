/**
 * The measurement vocabulary the voice agent uses (api/app/tools/vocabulary.py),
 * with lookups by stored type name. One query, shared by the Measurements page,
 * the dock's chips and the bench's confirm card.
 */
import { useQuery } from '@tanstack/react-query';
import { fetchMeasurementTypes, type MeasurementType } from '@/lib/api';

export function useMeasurementTypes() {
  const query = useQuery({
    queryKey: ['measurement-types'],
    queryFn: fetchMeasurementTypes,
    staleTime: Infinity,
  });
  const byName = new Map((query.data ?? []).map((t) => [t.name.toLowerCase(), t]));
  const find = (raw: string | null | undefined): MeasurementType | undefined =>
    raw ? byName.get(raw.toLowerCase()) : undefined;
  return { ...query, find, typeName: (raw: string) => find(raw)?.name ?? raw };
}
